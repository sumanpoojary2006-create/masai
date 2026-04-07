import { chromium } from "playwright";
import path from "node:path";

const LMS_URL = "https://experience-admin.masaischool.com";

async function firstVisible<T extends { count(): Promise<number>; nth(index: number): T; isVisible(): Promise<boolean> }>(
  locator: T
) {
  const count = await locator.count();

  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible().catch(() => false)) {
      return item;
    }
  }

  return null;
}

async function waitForPageRefresh(page: import("playwright").Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(800);
}

async function fillFirstMatching(
  page: import("playwright").Page,
  selectors: string[],
  value: string
) {
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

async function openFiltersPanel(page: import("playwright").Page) {
  const triggerCandidates = [
    page.getByRole("button", { name: /filters?/i }),
    page.locator("button").filter({ hasText: /filters?/i }),
    page.locator("[role='button']").filter({ hasText: /filters?/i })
  ];

  for (const candidate of triggerCandidates) {
    const trigger = await firstVisible(candidate);
    if (!trigger) {
      continue;
    }

    await trigger.click().catch(() => undefined);
    await page.waitForTimeout(500);
    return;
  }
}

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const username = process.env.LMS_USERNAME;
  const password = process.env.LMS_PASSWORD;
  const batchName = process.env.INSPECT_BATCH;
  const lectureName = process.env.INSPECT_LECTURE;
  const skipTitleSearch = process.env.INSPECT_SKIP_TITLE_SEARCH === "1";

  if (!username || !password) {
    throw new Error("LMS_USERNAME and LMS_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
    const networkResponses: Array<{ url: string; status: number }> = [];

    page.on("response", (response) => {
      const url = response.url();
      if (/lecture|batch|section|assignment|resource/i.test(url)) {
        networkResponses.push({
          url,
          status: response.status()
        });
      }
    });

    await page.goto("https://experience-admin.masaischool.com", {
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(1500);

    await page
      .locator('input[type="email"], input[placeholder*="gmail.com"]')
      .first()
      .fill(username);
    await page
      .locator('input[type="password"], input[placeholder="password"]')
      .first()
      .fill(password);
    await page.locator("button").filter({ hasText: /sign in|log in|login/i }).first().click();

    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.waitForTimeout(3000);

    if (batchName || lectureName) {
      await page.goto(`${LMS_URL}/lectures/?page=0`, {
        waitUntil: "domcontentloaded"
      });
      await waitForPageRefresh(page);

      await openFiltersPanel(page);
      const screenshotPath = path.join("/tmp", "inspect-lms-filters.png");
      await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => undefined);

      if (batchName) {
        await fillFirstMatching(
          page,
          [
            'input[placeholder*="Batch"]',
            'input[aria-label*="Batch"]',
            'input[name*="batch"]'
          ],
          batchName
        );
        await page.waitForTimeout(700);

        const batchOption = await firstVisible(
          page.locator("[role='option'], li, button, div").filter({ hasText: new RegExp(batchName, "i") })
        );
        if (batchOption) {
          await batchOption.click().catch(() => undefined);
        }
      }

      const applyButton = await firstVisible(
        page.locator("button").filter({ hasText: /apply|update|search|done|submit/i })
      );
      if (applyButton) {
        await applyButton.click().catch(() => undefined);
        await waitForPageRefresh(page);
      }

      if (lectureName && !skipTitleSearch) {
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
    }

    const tableRows = await page
      .locator("tr, [role='row'], article, section, .table-row, .card")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
          .filter(Boolean)
          .slice(0, 30)
      );

    const pageScanMatches: Array<{ page: string; row: string }> = [];

    if (lectureName) {
      const lectureNeedle = normalizeText(lectureName);
      const seenPages = new Set<string>();

      for (let attempts = 0; attempts < 15; attempts += 1) {
        const pageKey = new URL(page.url()).searchParams.get("page") ?? `${attempts}`;
        if (seenPages.has(pageKey)) {
          break;
        }

        seenPages.add(pageKey);

        const rows = await page
          .locator("tr, [role='row'], article, section, .table-row, .card")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => (node.textContent || "").trim().replace(/\s+/g, " "))
              .filter(Boolean)
          );

        for (const row of rows) {
          if (normalizeText(row).includes(lectureNeedle)) {
            pageScanMatches.push({
              page: pageKey,
              row
            });
          }
        }

        const nextButton =
          (await firstVisible(page.locator("button[aria-label*='next page' i]"))) ??
          (await firstVisible(page.locator("button, a").filter({ hasText: /next|›|»|→/i })));

        if (!nextButton) {
          break;
        }

        const disabled = await nextButton.isDisabled().catch(() => false);
        if (disabled) {
          break;
        }

        await nextButton.click().catch(() => undefined);
        await waitForPageRefresh(page);
      }
    }

    const inputs = await page
      .locator("input, [role='combobox'], button")
      .evaluateAll((nodes) =>
        nodes
          .map((node) => ({
            tag: node.tagName,
            text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
            placeholder: node.getAttribute("placeholder"),
            ariaLabel: node.getAttribute("aria-label"),
            name: node.getAttribute("name"),
            value: (node as HTMLInputElement).value ?? null
          }))
          .filter(
            (item) => item.text || item.placeholder || item.ariaLabel || item.name || item.value
          )
          .slice(0, 80)
      );

    const selects = await page
      .locator("select")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const select = node as HTMLSelectElement;
          return {
            value: select.value,
            options: Array.from(select.options)
              .slice(0, 12)
              .map((option) => ({
                value: option.value,
                label: (option.textContent || "").trim()
              })),
            parentText: (select.parentElement?.textContent || "")
              .trim()
              .replace(/\s+/g, " ")
              .slice(0, 180)
          };
        })
      );

    const batchFieldHtml = await page
      .locator("text=/^Batch$/i")
      .first()
      .evaluate((node) => node.parentElement?.outerHTML || node.outerHTML)
      .catch(() => null);

    const batchTextMatches = await page.evaluate(() =>
      Array.from(document.querySelectorAll("*"))
        .map((node) => ({
          tag: node.tagName,
          text: (node.textContent || "").trim().replace(/\s+/g, " "),
          html: (node as HTMLElement).outerHTML?.slice(0, 300) ?? ""
        }))
        .filter((item) => item.text.includes("Batch"))
        .slice(0, 20)
    );

    const selectLikeElements = await page
      .locator("text=/Select\\.\\.\\./")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          tag: node.tagName,
          text: (node.textContent || "").trim().replace(/\s+/g, " "),
          html: (node as HTMLElement).outerHTML?.slice(0, 240) ?? ""
        }))
      )
      .catch(() => []);

    console.log(
      JSON.stringify(
        {
          url: page.url(),
          title: await page.title(),
          batchName,
          lectureName,
          skipTitleSearch,
          screenshotPath: "/tmp/inspect-lms-filters.png",
          inputs,
          selects,
          batchFieldHtml,
          batchTextMatches,
          selectLikeElements,
          tableRows,
          pageScanMatches,
          networkResponses: networkResponses.slice(-50)
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
