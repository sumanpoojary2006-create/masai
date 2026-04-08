import { DateTime } from "luxon";
import { Browser, chromium, Locator, Page } from "playwright";

import { getScopedLmsUrl } from "@/lib/lms-batch-urls";
import { getAppTimezone } from "@/lib/env";
import { AutomationLecture, LmsTrackingRecord, TaskType } from "@/lib/types";

const LMS_URL = "https://experience-admin.masaischool.com";

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

function logLmsDebug(...args: unknown[]) {
  if (process.env.LMS_DEBUG === "1") {
    console.log("[lms-debug]", ...args);
  }
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
      normalized.includes(normalizeText(lectureName)) &&
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
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) {
      await locator.fill("");
      await locator.fill(value);
      return true;
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
  const notesNeedles = [/\bnotes?\b/i, /\blecture\s+notes?\b/i];

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
      const matchesLecture = normalizedText.includes(normalizedLectureName);
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
            normalizedLine.includes(normalizeText(lecture.lecture_name)) &&
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
  }
) {
  const scopedLectureUrl = getScopedLmsUrl("lectures", lecture.batch_name);
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
      : detectResourceFromPageText(page, lecture, /\bnotes?\b/i, "notes", {
          batchScoped
        })
  ]);
}

async function login(page: Page, username: string, password: string) {
  await page.goto(LMS_URL, {
    waitUntil: "domcontentloaded"
  });
  await page.waitForTimeout(1500);

  await fillFirstMatching(
    page,
    [
      'input[type="email"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[placeholder*="gmail.com"]'
    ],
    username
  );
  await fillFirstMatching(
    page,
    ['input[type="password"]', 'input[name="password"]', 'input[placeholder="password"]'],
    password
  );

  const submitCandidates = [
    page.getByRole("button", { name: /log in|login|sign in/i }),
    page.locator("button").filter({ hasText: /log in|login|sign in/i }),
    page.locator("button"),
    page.locator('input[type="submit"]')
  ];

  let submitButton: Locator | null = null;
  for (const candidate of submitCandidates) {
    submitButton = await firstVisible(candidate);
    if (submitButton) {
      break;
    }
  }

  if (!submitButton) {
    throw new Error("Unable to find the LMS login button");
  }

  await submitButton.click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(3000);
}

async function scrapeLectures(page: Page, lecture: AutomationLecture) {
  if (getScopedLmsUrl("lectures", lecture.batch_name)) {
    return scrapeLectureResourcesOnce(page, lecture);
  }

  const searchAttempt = await scrapeLectureResourcesOnce(page, lecture, {
    useDirectTitleUrl: false
  });

  if (searchAttempt.some((resource) => resource.found)) {
    return searchAttempt;
  }

  return scrapeLectureResourcesOnce(page, lecture, {
    useDirectTitleUrl: true
  });
}

async function scrapeAssignments(page: Page, lecture: AutomationLecture) {
  const scopedAssignmentUrl = getScopedLmsUrl("assignments", lecture.batch_name);

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

  await searchByLectureName(page, lecture.lecture_name);
  await waitForBodyText(page, lecture.lecture_name).catch(() => undefined);
  await waitForTableRows(page);

  const normalizedLectureName = normalizeText(lecture.lecture_name);
  const normalizedBatchName = normalizeText(lecture.batch_name);
  const batchScoped = Boolean(scopedAssignmentUrl);
  let objectiveMatch: { text: string; uploadedAt: string | null } | null = null;
  let subjectiveMatch: { text: string; uploadedAt: string | null } | null = null;
  const seenPages = new Set<string>();

  for (let attempts = 0; attempts < 15; attempts += 1) {
    const rows = await readTableRows(page);

    for (const associatedText of rows) {
      const normalizedText = normalizeText(associatedText);

      if (
        !normalizedText.includes(normalizedLectureName) ||
        (!batchScoped && !normalizedText.includes(normalizedBatchName))
      ) {
        continue;
      }

      const uploadedAt = extractTimestampFromText(associatedText);

      if (!objectiveMatch && /\bobjective\b/i.test(associatedText)) {
        objectiveMatch = {
          text: associatedText,
          uploadedAt
        };
      }

      if (!subjectiveMatch && /\bsubjective\b/i.test(associatedText)) {
        subjectiveMatch = {
          text: associatedText,
          uploadedAt
        };
      }
    }

    if (objectiveMatch && subjectiveMatch) {
      break;
    }

    if (!(await paginateNext(page, attempts, seenPages))) {
      break;
    }
  }

  const found = Boolean(objectiveMatch && subjectiveMatch);

  return {
    lectureId: lecture.id,
    resourceType: "assignment" as const,
    found,
    uploadedAt: found
      ? latestTimestamp([objectiveMatch?.uploadedAt, subjectiveMatch?.uploadedAt])
      : null,
    rawPayload: {
      objectiveFound: Boolean(objectiveMatch),
      subjectiveFound: Boolean(subjectiveMatch),
      objectiveText: objectiveMatch?.text ?? null,
      subjectiveText: subjectiveMatch?.text ?? null
    }
  };
}

export async function scrapeLmsResources(
  lectures: AutomationLecture[],
  credentials: {
    username: string;
    password: string;
  }
) {
  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: true
    });
    const page = await browser.newPage();
    await login(page, credentials.username, credentials.password);

    const records: LmsTrackingRecord[] = [];

    for (const lecture of lectures) {
      const lectureResources = await scrapeLectures(page, lecture);
      const assignmentResource = await scrapeAssignments(page, lecture);
      records.push(...lectureResources, assignmentResource);
    }

    return records;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
