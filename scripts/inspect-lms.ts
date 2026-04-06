import { chromium } from "playwright";

async function main() {
  const username = process.env.LMS_USERNAME;
  const password = process.env.LMS_PASSWORD;

  if (!username || !password) {
    throw new Error("LMS_USERNAME and LMS_PASSWORD are required.");
  }

  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage();
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

    const items = await page
      .locator('a, button, [role="button"], [role="link"]')
      .evaluateAll((nodes) =>
        nodes
          .map((node) => ({
            tag: node.tagName,
            text: (node.textContent || "").trim().replace(/\s+/g, " ").slice(0, 160),
            href: node.getAttribute("href")
          }))
          .filter((item) => item.text)
      );

    console.log(
      JSON.stringify(
        {
          url: page.url(),
          title: await page.title(),
          items: items.slice(0, 120)
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
