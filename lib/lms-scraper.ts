import { Browser, chromium, Locator, Page } from "playwright";

import { AutomationLecture, LmsTrackingRecord, TaskType } from "@/lib/types";

const LMS_URL = "https://experience-admin.masaischool.com";

function timestampPatterns() {
  return [
    /\b\d{1,2}[-/]\d{1,2}[-/]\d{2,4}[,\s]+\d{1,2}:\d{2}\s*(AM|PM)?\b/i,
    /\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?\b/i,
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},\s+\d{4}.*\d{1,2}:\d{2}\s*(AM|PM)?\b/i
  ];
}

function toIsoTimestamp(text: string) {
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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

async function filterByBatch(page: Page, batchName: string) {
  const filled = await fillFirstMatching(
    page,
    [
      'input[placeholder*="Batch"]',
      'input[aria-label*="Batch"]',
      'input[name*="batch"]'
    ],
    batchName
  );

  if (!filled) {
    return;
  }

  await page.waitForTimeout(600);
  const option = await firstVisible(page.locator(`text=${batchName}`));
  if (option) {
    await option.click().catch(() => undefined);
  }
}

async function searchByLectureName(page: Page, lectureName: string) {
  await fillFirstMatching(
    page,
    [
      'input[placeholder*="Search"]',
      'input[aria-label*="Search"]',
      'input[type="search"]'
    ],
    lectureName
  );
  await page.keyboard.press("Enter").catch(() => undefined);
  await page.waitForTimeout(800);
}

async function locateLectureContainer(page: Page, lectureName: string) {
  const cards = page
    .locator("tr, [role='row'], article, section, .table-row, .card")
    .filter({ hasText: lectureName });

  const visible = await firstVisible(cards);
  if (visible) {
    return visible;
  }

  return firstVisible(page.locator(`text=${lectureName}`));
}

async function extractTimestamp(container: Locator) {
  const text = await container.innerText().catch(() => "");

  for (const pattern of timestampPatterns()) {
    const match = text.match(pattern);
    if (match) {
      return toIsoTimestamp(match[0]);
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
    uploadedAt: await extractTimestamp(foundNode),
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
  await searchByLectureName(page, lecture.lecture_name);

  const container = await locateLectureContainer(page, lecture.lecture_name);

  if (!container) {
    return [
      {
        lectureId: lecture.id,
        resourceType: "preread" as const,
        found: false,
        uploadedAt: null
      },
      {
        lectureId: lecture.id,
        resourceType: "notes" as const,
        found: false,
        uploadedAt: null
      }
    ];
  }

  return Promise.all([
    detectResourceInLecture(container, /pre[- ]?read/i, "preread", lecture.id),
    detectResourceInLecture(container, /\bnotes?\b/i, "notes", lecture.id)
  ]);
}

async function scrapeAssignments(page: Page, lecture: AutomationLecture) {
  await clickNavigation(page, "Assignments");
  await searchByLectureName(page, lecture.lecture_name);

  const candidates = page
    .locator("tr, [role='row'], article, section, .table-row, .card")
    .filter({ hasText: lecture.lecture_name });

  const container = await firstVisible(candidates);

  if (!container) {
    return {
      lectureId: lecture.id,
      resourceType: "assignment" as const,
      found: false,
      uploadedAt: null
    };
  }

  const associatedText = await container.innerText().catch(() => "");
  const matchedLecture = associatedText
    .toLowerCase()
    .includes(lecture.lecture_name.toLowerCase());

  return {
    lectureId: lecture.id,
    resourceType: "assignment" as const,
    found: matchedLecture,
    uploadedAt: matchedLecture ? await extractTimestamp(container) : null,
    rawPayload: {
      matchedText: associatedText
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
