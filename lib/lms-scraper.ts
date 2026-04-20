import { DateTime } from "luxon";
import { Browser, chromium, Frame, Locator, Page } from "playwright";

import { BatchUrlOverrides, getScopedLmsUrl, LECTURE_BATCH_URLS } from "@/lib/lms-batch-urls";
import { getAppTimezone } from "@/lib/env";
import { AutomationLecture, LmsTrackingRecord, TaskType } from "@/lib/types";

const LMS_URL = "https://experience-admin.masaischool.com";
const LMS_API_URL = "https://experience-api.masaischool.com/";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Lenient lecture name matcher.
 *
 * 1. Try exact normalized substring first  ("for loops" ⊆ row).
 * 2. Fallback: split name into keywords (≥3 chars) and require ALL of them
 *    to appear somewhere in the row — handles mismatches like
 *    "For Loops" (import) vs "For-Loops" (LMS) or extra words in the title.
 */
function lectureNameMatchesRow(lectureName: string, normalizedRowText: string): boolean {
  const normalizedName = normalizeText(lectureName);

  // Pass 1 — exact substring
  if (normalizedRowText.includes(normalizedName)) return true;

  // Pass 2 — all keywords present (order-independent)
  const keywords = normalizedName.split(" ").filter((w) => w.length >= 3);
  if (keywords.length === 0) return false;
  return keywords.every((kw) => normalizedRowText.includes(kw));
}

function logLmsDebug(...args: unknown[]) {
  if (process.env.LMS_DEBUG === "1") {
    console.log("[lms-debug]", ...args);
  }
}

// ─────────────────────────────────────────────
// LMS GraphQL API — direct HTTP (no Playwright UI)
// ─────────────────────────────────────────────

/**
 * A lecture record from adminLectures.
 * - `notes`            : string | null  — markdown blob; starts with "# Pre-Read:" for pre-reads,
 *                        "# Lecture Notes:" (or similar) for notes.
 * - `faculty_resources`: array | null   — uploaded PDFs / links (also indicates preread uploaded).
 * Each lecture record is for ONE resource type; the same lecture title has separate records
 * for pre-read and lecture notes.
 */
interface ApiLecture {
  id?: number | string;
  title?: string;
  notes?: string | null;
  faculty_resources?: Array<{
    id?: number | string;
    link?: string;
    type?: string;
    title?: string;
    description?: string;
  }> | null;
  created_at?: string;
  updated_at?: string;
}

/** Parse the numeric batch id embedded in an LMS admin URL's `batch` query param */
function extractBatchIdFromUrl(batchUrl: string): number | null {
  try {
    const url = new URL(batchUrl);
    const raw = url.searchParams.get("batch");
    if (!raw) return null;
    const obj = JSON.parse(decodeURIComponent(raw)) as { id?: unknown };
    return typeof obj.id === "number" ? obj.id : null;
  } catch {
    return null;
  }
}

/** Look up the numeric batch id for a given batch name */
function getBatchId(batchName: string, batchUrls?: BatchUrlOverrides): number | null {
  const overrideUrl = batchUrls?.[batchName]?.lectures;
  if (overrideUrl) {
    const id = extractBatchIdFromUrl(overrideUrl);
    if (id != null) return id;
  }
  const url = LECTURE_BATCH_URLS[batchName];
  return url ? extractBatchIdFromUrl(url) : null;
}

/** Capture masaischool.com cookies from a logged-in Playwright page */
async function getAuthCookieHeader(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const relevant = cookies.filter((c) => c.domain.includes("masaischool.com"));
  logLmsDebug("auth-cookies", relevant.map((c) => c.name));
  return relevant.map((c) => `${c.name}=${c.value}`).join("; ");
}

/** Generic GraphQL POST to the experience-api */
async function callLmsGraphQL(
  operationName: string,
  query: string,
  variables: Record<string, unknown>,
  cookieHeader: string
): Promise<Record<string, unknown>> {
  const res = await fetch(LMS_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Cookie": cookieHeader,
      "Origin": "https://experience-admin.masaischool.com",
      "Referer": "https://experience-admin.masaischool.com/",
      "x-apollo-operation-name": operationName
    },
    body: JSON.stringify({ operationName, query, variables })
  });

  if (!res.ok) throw new Error(`LMS API HTTP ${res.status}`);
  const json = (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] };
  if (json.errors?.length) {
    logLmsDebug("graphql-errors", json.errors);
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data ?? {};
}

// The exact query shape from the confirmed Python script
const ADMIN_LECTURES_QUERY = `
query adminLectures($input: LectureListFilters) {
  adminLectures(input: $input) {
    lectures {
      id
      title
      notes
      faculty_resources
      created_at
      updated_at
    }
    page
    pages
  }
}
`;

/**
 * Fetch all lectures for a batch (optionally filtered by title).
 * Automatically pages through all results.
 */
async function fetchLecturesFromApi(
  batchId: number,
  title: string | null,
  cookieHeader: string
): Promise<ApiLecture[]> {
  const all: ApiLecture[] = [];
  let page = 0;

  while (true) {
    try {
      const data = await callLmsGraphQL("adminLectures", ADMIN_LECTURES_QUERY, {
        input: {
          lecture_id: null,
          title: title,
          batch_id: batchId,
          section_id: 0,
          type: null,
          user_id: null,
          concludes: null,
          schedule: null,
          block_id: null,
          host_id: null,
          faculty_resources_uploaded: null,
          page
        }
      }, cookieHeader);

      const result = data.adminLectures as { lectures?: ApiLecture[]; pages?: number } | undefined;
      const lectures = result?.lectures ?? [];
      if (lectures.length === 0) break;

      all.push(...lectures);

      const totalPages = result?.pages ?? 1;
      page += 1;
      if (page >= totalPages) break;
    } catch (err) {
      logLmsDebug("fetchLecturesFromApi error page", page, err instanceof Error ? err.message : err);
      break;
    }
  }

  return all;
}

/**
 * True when the notes string looks like a pre-read (not lecture notes).
 * e.g. "# Pre-Read: ..." or "# Pre-Read\n..."
 */
function isPreReadNotes(notes: string): boolean {
  return /pre[-\s]?read/i.test(notes.slice(0, 80));
}

/**
 * Try to resolve preread + notes via the GraphQL API.
 * Returns `null` when the API cannot be used (no batch id, API error).
 */
async function checkLectureResourcesViaApi(
  lecture: AutomationLecture,
  cookieHeader: string,
  batchUrls?: BatchUrlOverrides
): Promise<[LmsTrackingRecord, LmsTrackingRecord] | null> {
  const batchId = getBatchId(lecture.batch_name, batchUrls);
  if (!batchId) {
    logLmsDebug("checkLectureResourcesViaApi: no batchId for", lecture.batch_name);
    return null;
  }

  // Fetch with title filter — each resource type is its own lecture record
  const lectures = await fetchLecturesFromApi(batchId, lecture.lecture_name, cookieHeader);
  logLmsDebug("adminLectures result", { batchId, title: lecture.lecture_name, count: lectures.length });

  // Filter to records whose title matches the lecture name (lenient)
  const matching = lectures.filter((l) =>
    l.title ? lectureNameMatchesRow(lecture.lecture_name, normalizeText(l.title)) : false
  );

  // If no matching lectures found at all, the title filter may not have worked —
  // return null so Playwright takes over rather than falsely reporting "not uploaded".
  if (matching.length === 0) {
    logLmsDebug("checkLectureResourcesViaApi: no matching lectures for", lecture.lecture_name, "— Playwright fallback");
    return null;
  }

  // ── Preread ──
  // A record is a pre-read when: notes starts with "Pre-Read" OR faculty_resources non-empty
  const prereadRecord = matching.find(
    (l) =>
      (l.notes && isPreReadNotes(l.notes)) ||
      (Array.isArray(l.faculty_resources) && l.faculty_resources.length > 0)
  ) ?? null;

  const prereadFound = Boolean(prereadRecord);
  const prereadTimestamp = prereadRecord?.created_at
    ? toIsoTimestamp(prereadRecord.created_at)
    : null;

  const preread: LmsTrackingRecord = {
    lectureId: lecture.id,
    resourceType: "preread",
    found: prereadFound,
    uploadedAt: prereadTimestamp,
    rawPayload: {
      source: "api",
      matchedTitle: prereadRecord?.title,
      notes: prereadRecord?.notes?.slice(0, 120),
      faculty_resources: prereadRecord?.faculty_resources
    }
  };

  // ── Notes ──
  // A record is lecture notes when: notes is non-null and NOT a pre-read
  const notesRecord = matching.find(
    (l) => l.notes && !isPreReadNotes(l.notes)
  ) ?? null;

  const notesFound = Boolean(notesRecord);
  const notesTimestamp = notesRecord?.created_at
    ? toIsoTimestamp(notesRecord.created_at)
    : null;

  const notes: LmsTrackingRecord = {
    lectureId: lecture.id,
    resourceType: "notes",
    found: notesFound,
    uploadedAt: notesTimestamp,
    rawPayload: {
      source: "api",
      matchedTitle: notesRecord?.title,
      notes: notesRecord?.notes?.slice(0, 120)
    }
  };

  logLmsDebug("api-lecture-resources", {
    lectureName: lecture.lecture_name,
    prereadFound,
    notesFound,
    matchingCount: matching.length
  });

  return [preread, notes];
}

/**
 * Assignment check via API — falls back to Playwright (no confirmed query schema yet).
 * Returns `null` to trigger Playwright fallback.
 */
async function checkAssignmentViaApi(
  _lecture: AutomationLecture,
  _cookieHeader: string,
  _batchUrls?: BatchUrlOverrides
): Promise<LmsTrackingRecord | null> {
  // The assignment GraphQL query schema has not been confirmed.
  // Always fall back to Playwright scraping for assignments.
  return null;
}

function timestampPatterns() {
  return {
    createdAt: [
      /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?!\d)/g,
      /\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?![:\d])/g
    ],
    fallback: [
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}.*\d{1,2}:\d{2}\s*(AM|PM)?\b/gi,
      /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}[,\s]+\d{1,2}:\d{2}\s*(AM|PM)?\b/gi
    ]
  };
}

function toIsoTimestamp(text: string) {
  const timezone = getAppTimezone();
  const formats = [
    "yyyy-MM-dd HH:mm:ss",
    "yyyy-MM-dd'T'HH:mm:ss",
    "yyyy-MM-dd HH:mm",
    "yyyy-MM-dd'T'HH:mm",
    "dd-MM-yyyy, hh:mm a",
    "dd/MM/yyyy, hh:mm a",
    "dd-MM-yyyy hh:mm a",
    "dd/MM/yyyy hh:mm a",
    "LLL d, yyyy, hh:mm a",
    "LLLL d, yyyy, hh:mm a"
  ];

  for (const format of formats) {
    const parsed = DateTime.fromFormat(text.trim(), format, {
      zone: timezone
    });

    if (parsed.isValid) {
      return parsed.toUTC().toISO();
    }
  }

  const fallback = DateTime.fromJSDate(new Date(text), {
    zone: timezone
  });
  return fallback.isValid ? fallback.toUTC().toISO() : null;
}

function latestTimestamp(values: Array<string | null | undefined>) {
  return values
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
}

async function firstVisible(locator: Locator) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) {
      return item;
    }
  }

  return null;
}

async function clickNavigation(page: Page, label: string) {
  const directRoutes: Record<string, string> = {
    Lectures: `${LMS_URL}/lectures/?page=0`,
    Assignments: `${LMS_URL}/assignment/?page=0`,
    Assignment: `${LMS_URL}/assignment/?page=0`
  };

  const directRoute = directRoutes[label];
  if (directRoute) {
    await page.goto(directRoute, {
      waitUntil: "domcontentloaded"
    });
    await page.waitForLoadState("networkidle").catch(() => undefined);
    return;
  }

  const candidates = [
    page.getByRole("link", { name: new RegExp(label, "i") }),
    page.getByRole("button", { name: new RegExp(label, "i") }),
    page.locator(`text=${label}`)
  ];

  for (const candidate of candidates) {
    const visible = await firstVisible(candidate);
    if (visible) {
      await visible.click();
      await page.waitForLoadState("networkidle").catch(() => undefined);
      return;
    }
  }

  throw new Error(`Unable to open "${label}" in the LMS navigation`);
}

async function waitForPageRefresh(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800);
}

async function waitForBodyText(page: Page, needle: string, timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const text =
      (await page.evaluate(() => document.body?.textContent ?? "").catch(() => "")) ?? "";

    if (text.includes(needle)) {
      return true;
    }

    await page.waitForTimeout(250);
  }

  return false;
}

async function waitForResourceText(
  page: Page,
  lectureName: string,
  batchName: string,
  resourceNeedles: string[],
  options?: {
    batchScoped?: boolean;
  },
  timeoutMs = 15000
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const text =
      (await page.evaluate(() => document.body?.textContent ?? "").catch(() => "")) ?? "";
    const normalized = normalizeText(text);

    if (
      lectureNameMatchesRow(lectureName, normalized) &&
      (options?.batchScoped || normalized.includes(normalizeText(batchName))) &&
      resourceNeedles.some((needle) => normalized.includes(normalizeText(needle)))
    ) {
      return text;
    }

    await page.waitForTimeout(500);
  }

  return null;
}

async function fillFirstMatching(page: Page, selectors: string[], value: string) {
  const searchContexts: Array<Page | Frame> = [page, ...page.frames()];

  for (const context of searchContexts) {
    for (const selector of selectors) {
      const locator = context.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        await locator.fill("").catch(() => undefined);
        await locator.fill(value);
        return true;
      }
    }
  }

  return false;
}

async function hasVisibleMatching(page: Page, selectors: string[]) {
  const searchContexts: Array<Page | Frame> = [page, ...page.frames()];

  for (const context of searchContexts) {
    for (const selector of selectors) {
      const locator = context.locator(selector).first();
      if (await locator.isVisible().catch(() => false)) {
        return true;
      }
    }
  }

  return false;
}

async function openFiltersPanel(page: Page) {
  const visibleBatchControl = await firstVisible(
    page.locator(
      [
        'input[placeholder*="Batch"]',
        'input[aria-label*="Batch"]',
        'input[name*="batch"]',
        "select",
        '[role="combobox"][aria-label*="Batch"]',
        '[role="combobox"][name*="batch"]'
      ].join(", ")
    )
  );

  if (visibleBatchControl) {
    return;
  }

  const triggerCandidates = [
    page.getByRole("button", { name: /filters?/i }),
    page.locator("button").filter({ hasText: /filters?/i }),
    page.locator("[role='button']").filter({ hasText: /filters?/i }),
    page.locator("text=/filters?/i")
  ];

  for (const candidate of triggerCandidates) {
    const trigger = await firstVisible(candidate);
    if (!trigger) {
      continue;
    }

    await trigger.click().catch(() => undefined);
    await page.waitForTimeout(500);

    const batchControl = await firstVisible(
      page.locator(
        [
          'input[placeholder*="Batch"]',
          'input[aria-label*="Batch"]',
          'input[name*="batch"]',
          "select",
          '[role="combobox"]',
          '[aria-label*="Batch"]'
        ].join(", ")
      )
    );

    if (batchControl) {
      return;
    }
  }
}

async function filterByBatch(page: Page, batchName: string) {
  await openFiltersPanel(page);

  const exactBatchPlaceholder = page.locator("#react-select-4-placeholder").first();
  if (await exactBatchPlaceholder.isVisible().catch(() => false)) {
    await exactBatchPlaceholder.click().catch(() => undefined);
    await page.waitForTimeout(300);

    const exactBatchInput = page.locator("#react-select-4-input").first();
    if (await exactBatchInput.count().catch(() => 0)) {
      await exactBatchInput.fill(batchName).catch(() => undefined);
    } else {
      await page.keyboard.type(batchName).catch(() => undefined);
    }

    await page.waitForTimeout(700);

    const exactBatchOption = await firstVisible(
      page.locator("[id^='react-select-4-option']").filter({
        hasText: new RegExp(`^\\s*${escapeRegex(batchName)}\\s*$`, "i")
      })
    );

    if (exactBatchOption) {
      await exactBatchOption.click().catch(() => undefined);
      await waitForPageRefresh(page);
      return;
    }
  }

  const batchReactSelect = page
    .locator("[id^='react-select-'][id$='-placeholder']")
    .filter({ hasText: /^Select\.\.\.$/ })
    .nth(2);

  if (await batchReactSelect.isVisible().catch(() => false)) {
    await batchReactSelect.click().catch(() => undefined);
    await page.waitForTimeout(300);

    await page.keyboard.type(batchName).catch(() => undefined);
    await page.waitForTimeout(700);

    const reactOption = await firstVisible(
      page.locator("[id^='react-select-'][id*='-option']").filter({
        hasText: new RegExp(`^\\s*${escapeRegex(batchName)}\\s*$`, "i")
      })
    );

    if (reactOption) {
      await reactOption.click().catch(() => undefined);
      await waitForPageRefresh(page);
      return;
    }
  }

  const batchLabel = page.locator("text=/^Batch$/i").first();
  const batchSelect = batchLabel.locator("xpath=following::select[1]").first();

  if (await batchSelect.isVisible().catch(() => false)) {
    const options = await batchSelect
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          value: (node as HTMLOptionElement).value,
          label: (node.textContent || "").trim()
        }))
      )
      .catch(() => []);
    const matchingOption = options.find((option) =>
      normalizeText(option.label).includes(normalizeText(batchName))
    );

    if (matchingOption?.value) {
      await batchSelect.selectOption(matchingOption.value).catch(() => undefined);
      await waitForPageRefresh(page);
      return;
    }
  }

  const controlCandidates = [
    batchLabel.locator("xpath=following::input[1]").first(),
    batchLabel.locator("xpath=following::*[@role='combobox'][1]").first(),
    page.locator('input[placeholder*="Batch"]').first(),
    page.locator('input[aria-label*="Batch"]').first(),
    page.locator('input[name*="batch"]').first(),
    page.locator('[role="combobox"][aria-label*="Batch"]').first(),
    page.locator('[role="combobox"]').first()
  ];

  let control: Locator | null = null;

  for (const candidate of controlCandidates) {
    if (await candidate.isVisible().catch(() => false)) {
      control = candidate;
      break;
    }
  }

  if (!control) {
    return;
  }

  const tagName = await control.evaluate((node) => node.tagName.toLowerCase()).catch(() => "");

  if (tagName === "input" || tagName === "textarea") {
    await control.fill("").catch(() => undefined);
    await control.fill(batchName).catch(() => undefined);
  } else {
    await control.click().catch(() => undefined);
    await page.keyboard.press("Meta+A").catch(() => undefined);
    await page.keyboard.press("Control+A").catch(() => undefined);
    await page.keyboard.type(batchName).catch(() => undefined);
  }

  await page.waitForTimeout(700);

  const optionCandidates = [
    page.getByRole("option", {
      name: new RegExp(`^\\s*${escapeRegex(batchName)}\\s*$`, "i")
    }),
    page.locator("[role='option'], li, button, div").filter({
      hasText: new RegExp(escapeRegex(batchName), "i")
    }),
    page.locator(`text="${batchName}"`)
  ];

  for (const candidate of optionCandidates) {
    const option = await firstVisible(candidate);
    if (option) {
      await option.click().catch(() => undefined);
      await waitForPageRefresh(page);
      return;
    }
  }

  const applyCandidates = [
    page.getByRole("button", { name: /apply|update|search|done|submit/i }),
    page.locator("button").filter({ hasText: /apply|update|search|done|submit/i })
  ];

  for (const candidate of applyCandidates) {
    const button = await firstVisible(candidate);
    if (button) {
      await button.click().catch(() => undefined);
      await waitForPageRefresh(page);
      return;
    }
  }

  await page.keyboard.press("Enter").catch(() => undefined);
  await waitForPageRefresh(page);
}

async function searchByLectureName(page: Page, lectureName: string) {
  await fillFirstMatching(
    page,
    [
      'input[placeholder*="Title"]',
      'input[placeholder*="Search"]',
      'input[aria-label*="Search"]',
      'input[type="search"]',
      'input[name*="title"]'
    ],
    lectureName
  );
  await page.keyboard.press("Enter").catch(() => undefined);
  await waitForPageRefresh(page);
}

async function paginateNext(page: Page, attempts: number, seenPages: Set<string>) {
  const currentPageButton =
    (await firstVisible(page.locator("button[aria-current='page'], [aria-current='page']"))) ??
    (await firstVisible(page.locator(".active, [class*='active']")));
  const currentPageKey = currentPageButton
    ? await currentPageButton.innerText().catch(() => `page-${attempts}`)
    : `page-${attempts}`;

  if (seenPages.has(currentPageKey)) {
    return false;
  }

  seenPages.add(currentPageKey);

  const currentPageNumber = Number.parseInt(currentPageKey.trim(), 10);
  let nextButton: Locator | null = null;

  if (Number.isFinite(currentPageNumber)) {
    nextButton = await firstVisible(
      page
        .locator("button, a")
        .filter({ hasText: new RegExp(`^\\s*${currentPageNumber + 1}\\s*$`) })
    );
  }

  if (!nextButton) {
    nextButton = await firstVisible(
      page
        .locator("button, a")
        .filter({ hasText: /next|›|»|>|→/i })
    );
  }

  if (!nextButton) {
    return false;
  }

  const disabled = await nextButton.isDisabled().catch(() => false);
  if (disabled) {
    return false;
  }

  await nextButton.click().catch(() => undefined);
  await waitForPageRefresh(page);
  return true;
}

async function readTableRows(page: Page) {
  return page
    .locator("tr, [role='row'], article, section, .table-row, .card")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
        .filter(Boolean)
    )
    .catch(() => [] as string[]);
}

async function waitForTableRows(page: Page, timeoutMs = 10000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const rows = await readTableRows(page);
    if (rows.length > 0) {
      return rows;
    }

    await page.waitForTimeout(500);
  }

  return [] as string[];
}

async function findLectureResourceRowTexts(
  page: Page,
  lectureName: string,
  batchName: string,
  options?: {
    batchScoped?: boolean;
  }
) {
  const normalizedLectureName = normalizeText(lectureName);
  const normalizedBatchName = normalizeText(batchName);
  const seenPages = new Set<string>();
  let prereadRowText: string | null = null;
  let notesRowText: string | null = null;
  const notesNeedles = [/notes?/i, /lecture\s*notes?/i];

  for (let attempts = 0; attempts < 15; attempts += 1) {
    const rows = attempts === 0 ? await waitForTableRows(page) : await readTableRows(page);
    logLmsDebug("scan-page", {
      lectureName,
      batchName,
      attempts,
      rowCount: rows.length,
      firstRows: rows.slice(0, 5)
    });

    for (const text of rows) {
      const normalizedText = normalizeText(text);
      const matchesLecture = lectureNameMatchesRow(lectureName, normalizedText);
      const matchesBatch = options?.batchScoped || normalizedText.includes(normalizedBatchName);
      const lowerText = text.toLowerCase();
      const matchesPreread = /pre[- ]?reads?/i.test(lowerText);
      const matchesNotes = notesNeedles.some((pattern) => pattern.test(text));

      if (matchesBatch && matchesLecture) {
        if (!prereadRowText && matchesPreread) {
          prereadRowText = text;
          logLmsDebug("matched-row", {
            lectureName,
            batchName,
            resourceType: "preread",
            text
          });
        }

        if (!notesRowText && matchesNotes) {
          notesRowText = text;
          logLmsDebug("matched-row", {
            lectureName,
            batchName,
            resourceType: "notes",
            text
          });
        }

        if (prereadRowText && notesRowText) {
          return {
            prereadRowText,
            notesRowText
          };
        }
      }

      if (matchesLecture || matchesPreread || matchesNotes) {
        logLmsDebug("row-check", {
          lectureName,
          batchName,
          matchesLecture,
          matchesBatch,
          matchesPreread,
          matchesNotes,
          text
        });
      }
    }

    if (!(await paginateNext(page, attempts, seenPages))) {
      break;
    }
  }

  return {
    prereadRowText,
    notesRowText
  };
}

function resourceRecordFromRowText(
  rowText: string,
  lectureId: string,
  type: TaskType
): LmsTrackingRecord {
  return {
    lectureId,
    resourceType: type,
    found: true,
    uploadedAt: extractTimestampFromText(rowText),
    rawPayload: {
      matchedText: rowText
    }
  };
}

async function extractTimestamp(container: Locator) {
  const text = await container.innerText().catch(() => "");
  const patterns = timestampPatterns();

  for (const pattern of patterns.createdAt) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      return latestTimestamp(matches.map((match) => toIsoTimestamp(match[0])));
    }
  }

  for (const pattern of patterns.fallback) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      return latestTimestamp(matches.map((match) => toIsoTimestamp(match[0])));
    }
  }

  return null;
}

function extractTimestampFromText(text: string) {
  const patterns = timestampPatterns();

  for (const pattern of patterns.createdAt) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      return latestTimestamp(matches.map((match) => toIsoTimestamp(match[0])));
    }
  }

  for (const pattern of patterns.fallback) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      return latestTimestamp(matches.map((match) => toIsoTimestamp(match[0])));
    }
  }

  return null;
}

async function detectResourceFromPageText(
  page: Page,
  lecture: AutomationLecture,
  keyword: RegExp,
  type: TaskType,
  options?: {
    batchScoped?: boolean;
  }
): Promise<LmsTrackingRecord> {
  const resourceNeedles =
      type === "preread"
      ? ["pre read", "pre reads"]
      : type === "notes"
        ? ["notes", "note", "lecture notes"]
        : ["assignment"];
  const resourcePatternSource =
    type === "preread"
      ? "pre[- ]?reads?"
      : type === "notes"
        ? "lecture\\s+notes?|notes?|note"
        : "assignment";
  const pageText = await waitForResourceText(
    page,
    lecture.lecture_name,
    lecture.batch_name,
    resourceNeedles,
    options
  );

  const matchedWindow = pageText
    ? pageText
        .split(/\n+/)
        .map((line) => line.trim().replace(/\s+/g, " "))
        .find((line) => {
          const normalizedLine = normalizeText(line);
          return (
            lectureNameMatchesRow(lecture.lecture_name, normalizedLine) &&
            (options?.batchScoped ||
              normalizedLine.includes(normalizeText(lecture.batch_name))) &&
            resourceNeedles.some((needle) =>
              normalizedLine.includes(normalizeText(needle))
            )
          );
        }) ?? pageText
    : null;

  const fallbackWindow = pageText
    ? (() => {
        const escapedLectureName = escapeRegex(lecture.lecture_name);
        const escapedBatchName = escapeRegex(lecture.batch_name);
        const batchSegment = options?.batchScoped ? "" : `(?:[\\s\\S]{0,240}${escapedBatchName})`;
        const forwardPattern = new RegExp(
          `${escapedLectureName}${batchSegment}[\\s\\S]{0,500}(?:${resourcePatternSource})`,
          "i"
        );
        const reversePattern = new RegExp(
          `(?:${resourcePatternSource})[\\s\\S]{0,500}${escapedLectureName}${batchSegment}`,
          "i"
        );

        return pageText.match(forwardPattern)?.[0] ?? pageText.match(reversePattern)?.[0] ?? null;
      })()
    : null;

  const resourceWindow = matchedWindow ?? fallbackWindow;

  if (!resourceWindow || !keyword.test(resourceWindow)) {
    return {
      lectureId: lecture.id,
      resourceType: type,
      found: false,
      uploadedAt: null,
      rawPayload: {
        pageTextMatch: false
      }
    };
  }

  return {
    lectureId: lecture.id,
    resourceType: type,
    found: true,
    uploadedAt: extractTimestampFromText(resourceWindow),
    rawPayload: {
      matchedText: resourceWindow
    }
  };
}

async function scrapeLectureResourcesOnce(
  page: Page,
  lecture: AutomationLecture,
  options?: {
    useDirectTitleUrl?: boolean;
    batchUrls?: BatchUrlOverrides;
  }
) {
  const scopedLectureUrl = getScopedLmsUrl(
    "lectures",
    lecture.batch_name,
    options?.batchUrls
  );
  const batchScoped = Boolean(scopedLectureUrl);
  const targetUrl = scopedLectureUrl
    ? scopedLectureUrl
    : options?.useDirectTitleUrl
      ? `${LMS_URL}/lectures/?page=0&title=${encodeURIComponent(lecture.lecture_name)}`
      : `${LMS_URL}/lectures/?page=0`;

  await page.goto(targetUrl, {
    waitUntil: "domcontentloaded"
  });
  await waitForPageRefresh(page);
  await waitForTableRows(page);
  await searchByLectureName(page, lecture.lecture_name);
  await waitForBodyText(page, lecture.lecture_name).catch(() => undefined);
  await waitForTableRows(page);

  const { prereadRowText, notesRowText } = await findLectureResourceRowTexts(
    page,
    lecture.lecture_name,
    lecture.batch_name,
    {
      batchScoped
    }
  );

  return Promise.all([
    prereadRowText
      ? Promise.resolve(resourceRecordFromRowText(prereadRowText, lecture.id, "preread"))
      : detectResourceFromPageText(page, lecture, /pre[- ]?reads?/i, "preread", {
          batchScoped
        }),
    notesRowText
      ? Promise.resolve(resourceRecordFromRowText(notesRowText, lecture.id, "notes"))
      : detectResourceFromPageText(page, lecture, /notes?/i, "notes", {
          batchScoped
        })
  ]);
}

async function login(page: Page, username: string, password: string) {
  const usernameSelectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[name="username"]',
    'input[autocomplete="username"]',
    'input[autocomplete="email"]',
    'input[placeholder*="gmail.com"]',
    'input[placeholder*="email" i]',
    'input[placeholder*="username" i]',
    'input[type="text"]'
  ];
  const passwordSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[autocomplete="current-password"]',
    'input[placeholder="password"]',
    'input[placeholder*="password" i]'
  ];

  /** Wait up to `ms` for either field set to appear, checking every 500 ms */
  async function waitForLoginForm(ms = 8000) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (
        (await hasVisibleMatching(page, usernameSelectors)) &&
        (await hasVisibleMatching(page, passwordSelectors))
      ) {
        return true;
      }
      await page.waitForTimeout(500);
    }
    return false;
  }

  // ── Step 1: navigate to base URL and wait for SPA to hydrate ──────────────
  await page.goto(LMS_URL, { waitUntil: "networkidle" }).catch(() =>
    page.goto(LMS_URL, { waitUntil: "domcontentloaded" })
  );
  await page.waitForTimeout(2000);

  // ── Step 2: if login form already visible, proceed ────────────────────────
  if (await waitForLoginForm(3000)) {
    logLmsDebug("login form found on base URL");
  } else {
    // ── Step 3: look for a login trigger button / link ────────────────────
    const loginTriggers = [
      page.getByRole("link", { name: /log in|login|sign in|signin/i }),
      page.getByRole("button", { name: /log in|login|sign in|signin/i }),
      page.locator("a").filter({ hasText: /log in|login|sign in|signin/i }),
      page.locator("button").filter({ hasText: /log in|login|sign in|signin/i })
    ];

    for (const candidate of loginTriggers) {
      const trigger = await firstVisible(candidate);
      if (!trigger) continue;

      await trigger.click().catch(() => undefined);
      await page.waitForLoadState("networkidle").catch(() => undefined);

      if (await waitForLoginForm(3000)) {
        logLmsDebug("login form found after clicking trigger");
        break;
      }
    }
  }

  // ── Step 4: try known login paths if form still not visible ───────────────
  if (
    !(await hasVisibleMatching(page, usernameSelectors)) ||
    !(await hasVisibleMatching(page, passwordSelectors))
  ) {
    for (const candidateUrl of [
      `${LMS_URL}/login`,
      `${LMS_URL}/signin`,
      `${LMS_URL}/auth/login`,
      `${LMS_URL}/auth/signin`
    ]) {
      await page.goto(candidateUrl, { waitUntil: "networkidle" }).catch(() =>
        page.goto(candidateUrl, { waitUntil: "domcontentloaded" })
      );

      if (await waitForLoginForm(4000)) {
        logLmsDebug("login form found at", candidateUrl);
        break;
      }
    }
  }

  // ── Step 5: log page state for debugging if still not found ───────────────
  if (
    !(await hasVisibleMatching(page, usernameSelectors)) ||
    !(await hasVisibleMatching(page, passwordSelectors))
  ) {
    const currentUrl = page.url();
    const bodySnippet = await page
      .evaluate(() => document.body?.innerText?.slice(0, 400) ?? "")
      .catch(() => "");
    console.error("[lms-login] Could not find login form. URL:", currentUrl);
    console.error("[lms-login] Page text snippet:", bodySnippet);
    throw new Error(
      `Unable to find the LMS username/password fields. Current URL: ${currentUrl}`
    );
  }

  const usernameFilled = await fillFirstMatching(page, usernameSelectors, username);
  const passwordFilled = await fillFirstMatching(page, passwordSelectors, password);

  if (!usernameFilled || !passwordFilled) {
    throw new Error("Unable to fill the LMS username/password fields");
  }

  const submitCandidates = [
    page.getByRole("button", { name: /log in|login|sign in/i }),
    page.locator("button").filter({ hasText: /log in|login|sign in/i }),
    page.getByRole("button", { name: /continue|submit|next/i }),
    page.locator("button").filter({ hasText: /continue|submit|next/i }),
    page.locator('[type="submit"]'),
    page.locator("button"),
    page.locator('input[type="submit"]'),
    page.locator('a[role="button"]'),
    page.locator("[role='button']")
  ];

  let submitButton: Locator | null = null;
  for (const candidate of submitCandidates) {
    submitButton = await firstVisible(candidate);
    if (submitButton) {
      break;
    }
  }

  if (submitButton) {
    await submitButton.click().catch(() => undefined);
  } else {
    const passwordField = await firstVisible(
      page.locator(
        passwordSelectors.join(", ")
      )
    );

    if (passwordField) {
      await passwordField.press("Enter").catch(() => undefined);
    } else {
      await page.keyboard.press("Enter").catch(() => undefined);
    }

    await page
      .locator("form")
      .first()
      .evaluate((form) => {
        if (form instanceof HTMLFormElement) {
          form.requestSubmit();
        }
      })
      .catch(() => undefined);
  }

  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);

  const currentUrl = page.url();
  const bodyText =
    (await page.evaluate(() => document.body?.textContent ?? "").catch(() => "")) ?? "";

  if (
    currentUrl.includes("/login") ||
    /invalid|incorrect|unauthorized|sign in|log in/i.test(bodyText)
  ) {
    logLmsDebug("login-page-after-submit", {
      currentUrl,
      bodySnippet: bodyText.slice(0, 500)
    });
  }

  // Visit the experience-api origin so its session cookie is set in the browser context.
  // This mirrors what the Python script does and is required for GraphQL API calls to authenticate.
  await page.goto(LMS_API_URL, { waitUntil: "domcontentloaded" }).catch(() => undefined);
  await page.waitForTimeout(1000);
}

async function scrapeLectures(
  page: Page,
  lecture: AutomationLecture,
  options?: {
    batchUrls?: BatchUrlOverrides;
  }
) {
  if (getScopedLmsUrl("lectures", lecture.batch_name, options?.batchUrls)) {
    return scrapeLectureResourcesOnce(page, lecture, {
      batchUrls: options?.batchUrls
    });
  }

  const searchAttempt = await scrapeLectureResourcesOnce(page, lecture, {
    useDirectTitleUrl: false,
    batchUrls: options?.batchUrls
  });

  if (searchAttempt.some((resource) => resource.found)) {
    return searchAttempt;
  }

  return scrapeLectureResourcesOnce(page, lecture, {
    useDirectTitleUrl: true,
    batchUrls: options?.batchUrls
  });
}

async function scrapeAssignments(
  page: Page,
  lecture: AutomationLecture,
  options?: {
    batchUrls?: BatchUrlOverrides;
  }
) {
  const scopedAssignmentUrl = getScopedLmsUrl(
    "assignments",
    lecture.batch_name,
    options?.batchUrls
  );

  if (scopedAssignmentUrl) {
    await page.goto(scopedAssignmentUrl, {
      waitUntil: "domcontentloaded"
    });
    await waitForPageRefresh(page);
    await waitForTableRows(page);
  } else {
    await clickNavigation(page, "Assignments");
    await filterByBatch(page, lecture.batch_name);
  }

  const normalizedLectureName = normalizeText(lecture.lecture_name);
  const normalizedBatchName = normalizeText(lecture.batch_name);
  const batchScoped = Boolean(scopedAssignmentUrl);

  async function scanPagesForAssignment(maxPages = 15) {
    let match: { text: string; uploadedAt: string | null } | null = null;
    const seenPages = new Set<string>();

    for (let attempts = 0; attempts < maxPages; attempts += 1) {
      const rows = attempts === 0 ? await waitForTableRows(page) : await readTableRows(page);
      logLmsDebug("assignment-scan-page", {
        lectureName: lecture.lecture_name,
        attempts,
        rowCount: rows.length,
        firstRows: rows.slice(0, 3)
      });

      for (const associatedText of rows) {
        const normalizedText = normalizeText(associatedText);

        if (
          !lectureNameMatchesRow(lecture.lecture_name, normalizedText) ||
          (!batchScoped && !normalizedText.includes(normalizedBatchName))
        ) {
          continue;
        }

        match = { text: associatedText, uploadedAt: extractTimestampFromText(associatedText) };
        logLmsDebug("assignment-match", { lectureName: lecture.lecture_name, text: associatedText });
        break;
      }

      if (match) break;
      if (!(await paginateNext(page, attempts, seenPages))) break;
    }

    return match;
  }

  // Pass 1: search by title so results are filtered — wait for the AJAX
  // search to complete before reading rows (not just body text which can
  // resolve immediately from the filled input value).
  await searchByLectureName(page, lecture.lecture_name);
  await page.waitForTimeout(1500); // let React re-render search results
  await waitForPageRefresh(page);

  let match = await scanPagesForAssignment();

  // Pass 2: if title search found nothing, clear the search and paginate
  // through the full batch-filtered list (handles cases where the search
  // AJAX races or the search field wasn't properly applied).
  if (!match) {
    logLmsDebug("assignment-search-miss — retrying without title filter", { lectureName: lecture.lecture_name });

    // Re-navigate to the batch URL (or assignments nav) to reset the search
    if (scopedAssignmentUrl) {
      await page.goto(scopedAssignmentUrl, { waitUntil: "domcontentloaded" });
    } else {
      await clickNavigation(page, "Assignments");
      await filterByBatch(page, lecture.batch_name);
    }
    await waitForPageRefresh(page);
    match = await scanPagesForAssignment(20);
  }

  return {
    lectureId: lecture.id,
    resourceType: "assignment" as const,
    found: Boolean(match),
    uploadedAt: match?.uploadedAt ?? null,
    rawPayload: {
      matchedText: match?.text ?? null
    }
  };
}

export async function scrapeLmsResources(
  lectures: AutomationLecture[],
  credentials: {
    username: string;
    password: string;
  },
  options?: {
    batchUrls?: BatchUrlOverrides;
  }
) {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true
    });
    const page = await browser.newPage();
    await login(page, credentials.username, credentials.password);

    // Capture auth cookies once after login — used for direct API calls
    let cookieHeader = "";
    try {
      cookieHeader = await getAuthCookieHeader(page);
      console.log("[lms-scraper] Auth cookies captured for GraphQL API");
    } catch (err) {
      console.warn("[lms-scraper] Could not capture auth cookies:", err instanceof Error ? err.message : err);
    }

    const records: LmsTrackingRecord[] = [];

    for (const lecture of lectures) {
      // ── Lecture resources (preread + notes) ─────────────────────────────
      let lectureResources: LmsTrackingRecord[] | null = null;

      if (cookieHeader) {
        try {
          const apiResult = await checkLectureResourcesViaApi(lecture, cookieHeader, options?.batchUrls);
          if (apiResult) {
            console.log(
              `[lms-scraper] API ✓ lecture resources for "${lecture.lecture_name}" —`,
              `preread=${apiResult[0].found}, notes=${apiResult[1].found}`
            );
            lectureResources = apiResult;
          }
        } catch (err) {
          console.warn(
            `[lms-scraper] API lecture resources failed for "${lecture.lecture_name}":`,
            err instanceof Error ? err.message : err
          );
        }
      }

      if (!lectureResources) {
        console.log(`[lms-scraper] Playwright fallback for lecture resources: "${lecture.lecture_name}"`);
        lectureResources = await scrapeLectures(page, lecture, {
          batchUrls: options?.batchUrls
        });
      }

      // ── Assignment ───────────────────────────────────────────────────────
      let assignmentResource: LmsTrackingRecord | null = null;

      if (cookieHeader) {
        try {
          const apiResult = await checkAssignmentViaApi(lecture, cookieHeader, options?.batchUrls);
          if (apiResult) {
            console.log(
              `[lms-scraper] API ✓ assignment for "${lecture.lecture_name}" — found=${apiResult.found}`
            );
            assignmentResource = apiResult;
          }
        } catch (err) {
          console.warn(
            `[lms-scraper] API assignment failed for "${lecture.lecture_name}":`,
            err instanceof Error ? err.message : err
          );
        }
      }

      if (!assignmentResource) {
        console.log(`[lms-scraper] Playwright fallback for assignment: "${lecture.lecture_name}"`);
        assignmentResource = await scrapeAssignments(page, lecture, {
          batchUrls: options?.batchUrls
        });
      }

      records.push(...lectureResources, assignmentResource);
    }

    return records;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * Scrapes the Summary tab from a Masai LMS lecture detail page.
 * sessionLink: https://experience-admin.masaischool.com/lectures/detail/?id=145613
 */
export async function scrapeLectureSummary(
  sessionLink: string,
  credentials: { username: string; password: string }
): Promise<string> {
  // Strip any existing tab param and force ?tab=summary
  const baseUrl = sessionLink.split("?")[0];
  const idMatch = sessionLink.match(/[?&]id=(\d+)/);
  if (!idMatch) {
    throw new Error("Could not parse lecture ID from session link. Expected URL like …/lectures/detail/?id=145613");
  }
  const summaryUrl = `${baseUrl}?id=${idMatch[1]}&tab=summary`;

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Login first, then navigate to summary URL
    await login(page, credentials.username, credentials.password);

    logLmsDebug("navigating to summary url", summaryUrl);
    await page.goto(summaryUrl, { waitUntil: "domcontentloaded" });

    // Wait for React SPA to hydrate and render the tab content
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(3000);

    // Explicitly click the Summary tab to ensure it is active
    const tabCandidates = [
      page.getByRole("tab", { name: /^summary$/i }),
      page.locator("button").filter({ hasText: /^summary$/i }),
      page.locator("a").filter({ hasText: /^summary$/i }),
      page.locator("[class*='tab']").filter({ hasText: /^summary$/i })
    ];

    for (const candidate of tabCandidates) {
      try {
        const el = candidate.first();
        if (await el.isVisible({ timeout: 2000 })) {
          await el.click();
          logLmsDebug("clicked Summary tab");
          break;
        }
      } catch {
        // try next candidate
      }
    }

    // Wait for content to appear after tab click
    await page.waitForTimeout(3000);

    // Wait until meaningful text is visible on the page
    await page.waitForFunction(
      () => (document.body.innerText?.length ?? 0) > 300,
      { timeout: 10000 }
    ).catch(() => undefined);

    // Extract the summary text — try progressively broader selectors
    const summaryText = await page.evaluate(() => {
      // Remove noisy nav/header/footer/sidebar elements first
      const noise = ["nav", "header", "footer", "aside", "[class*='sidebar']", "[class*='navbar']", "[class*='navigation']"];
      noise.forEach((sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });
      });

      // Priority selectors — try to get the tab content area specifically
      const contentSelectors = [
        "[class*='tabPanel']",
        "[class*='tab-panel']",
        "[class*='tab_panel']",
        "[role='tabpanel']",
        "[class*='TabPanel']",
        "[class*='summary']",
        "[class*='Summary']",
        "article",
        "main"
      ];

      for (const sel of contentSelectors) {
        const els = document.querySelectorAll(sel);
        for (const el of els) {
          const text = (el as HTMLElement).innerText?.trim() ?? "";
          // Must have substantial content — skip tiny panels
          if (text.length > 200) {
            return text;
          }
        }
      }

      // Last resort: full body text, trimmed
      return document.body.innerText?.trim() ?? "";
    });

    logLmsDebug("extracted summary length", summaryText.length);

    if (!summaryText || summaryText.trim().length < 100) {
      throw new Error(
        "Summary not found on the LMS page. " +
        "Make sure the summary has been generated (check the Summary tab manually) " +
        "and the session link points to a lecture detail page."
      );
    }

    return summaryText
      .replace(/\t/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
