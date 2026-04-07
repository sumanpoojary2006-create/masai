import { DateTime } from "luxon";
import { Browser, chromium, Locator, Page } from "playwright";

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

function timestampPatterns() {
  return [
    /\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}\b/g,
    /\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}\b/g,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}.*\d{1,2}:\d{2}\s*(AM|PM)?\b/gi,
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}[,\s]+\d{1,2}:\d{2}\s*(AM|PM)?\b/gi
  ];
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

async function locateLectureContainer(
  page: Page,
  lectureName: string,
  batchName: string,
  resourceKeyword: RegExp
) {
  const normalizedLectureName = normalizeText(lectureName);
  const normalizedBatchName = normalizeText(batchName);
  const seenPages = new Set<string>();

  for (let attempts = 0; attempts < 15; attempts += 1) {
    const cards = page.locator("tr, [role='row'], article, section, .table-row, .card");
    const count = await cards.count();

    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      if (!(await card.isVisible().catch(() => false))) {
        continue;
      }

      const text = await card.innerText().catch(() => "");
      const normalizedText = normalizeText(text);

      if (
        normalizedText.includes(normalizedBatchName) &&
        normalizedText.includes(normalizedLectureName) &&
        resourceKeyword.test(text.toLowerCase())
      ) {
        return card;
      }
    }

    if (!(await paginateNext(page, attempts, seenPages))) {
      break;
    }
  }

  return null;
}

async function extractTimestamp(container: Locator) {
  const text = await container.innerText().catch(() => "");

  for (const pattern of timestampPatterns()) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length > 0) {
      return latestTimestamp(matches.map((match) => toIsoTimestamp(match[0])));
    }
  }

  return null;
}

async function detectResourceInLecture(
  container: Locator,
  keyword: RegExp,
  type: TaskType,
  lectureId: string
): Promise<LmsTrackingRecord> {
  const containerText = await container.innerText().catch(() => "");

  if (keyword.test(containerText)) {
    return {
      lectureId,
      resourceType: type,
      found: true,
      uploadedAt: await extractTimestamp(container),
      rawPayload: {
        matchedText: containerText
      }
    };
  }

  const nested = container.locator("tr, [role='row'], div, span, p").filter({
    hasText: keyword
  });

  const foundNode = await firstVisible(nested);
  if (!foundNode) {
    return {
      lectureId,
      resourceType: type,
      found: false,
      uploadedAt: null
    };
  }

  return {
    lectureId,
    resourceType: type,
    found: true,
    uploadedAt: (await extractTimestamp(foundNode)) ?? (await extractTimestamp(container)),
    rawPayload: {
      matchedText: await foundNode.innerText().catch(() => "")
    }
  };
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
}

async function scrapeLectures(page: Page, lecture: AutomationLecture) {
  await clickNavigation(page, "Lectures");
  await filterByBatch(page, lecture.batch_name);

  const prereadContainer = await locateLectureContainer(
    page,
    lecture.lecture_name,
    lecture.batch_name,
    /pre[- ]?reads?/i
  );
  const notesContainer = await locateLectureContainer(
    page,
    lecture.lecture_name,
    lecture.batch_name,
    /\bnotes?\b/i
  );

  return Promise.all([
    prereadContainer
      ? detectResourceInLecture(prereadContainer, /pre[- ]?read/i, "preread", lecture.id)
      : Promise.resolve({
          lectureId: lecture.id,
          resourceType: "preread" as const,
          found: false,
          uploadedAt: null
        }),
    notesContainer
      ? detectResourceInLecture(notesContainer, /\bnotes?\b/i, "notes", lecture.id)
      : Promise.resolve({
          lectureId: lecture.id,
          resourceType: "notes" as const,
          found: false,
          uploadedAt: null
        })
  ]);
}

async function scrapeAssignments(page: Page, lecture: AutomationLecture) {
  await clickNavigation(page, "Assignments");
  await filterByBatch(page, lecture.batch_name);
  await searchByLectureName(page, lecture.lecture_name);

  const normalizedLectureName = normalizeText(lecture.lecture_name);
  const normalizedBatchName = normalizeText(lecture.batch_name);
  let objectiveMatch: { text: string; uploadedAt: string | null } | null = null;
  let subjectiveMatch: { text: string; uploadedAt: string | null } | null = null;
  const seenPages = new Set<string>();

  for (let attempts = 0; attempts < 15; attempts += 1) {
    const candidates = page.locator("tr, [role='row'], article, section, .table-row, .card");
    const candidateCount = await candidates.count();

    for (let index = 0; index < candidateCount; index += 1) {
      const container = candidates.nth(index);
      if (!(await container.isVisible().catch(() => false))) {
        continue;
      }

      const associatedText = await container.innerText().catch(() => "");
      const normalizedText = normalizeText(associatedText);

      if (
        !normalizedText.includes(normalizedLectureName) ||
        !normalizedText.includes(normalizedBatchName)
      ) {
        continue;
      }

      const uploadedAt = await extractTimestamp(container);

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
