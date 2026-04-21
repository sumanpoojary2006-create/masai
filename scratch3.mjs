import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("https://experience-admin.masaischool.com/login");
  await page.waitForTimeout(3000);
  
  // Use a different selector for login
  await page.fill('input', process.env.LMS_USERNAME); // Assuming email is first input
  await page.fill('input[type="password"]', process.env.LMS_PASSWORD);
  await page.click('button:has-text("Login")');
  await page.waitForNavigation().catch(() => {});
  
  await page.goto("https://experience-admin.masaischool.com/lectures/detail/?id=143666&tab=summary", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.slice(0, 500));
  
  await browser.close();
})();
