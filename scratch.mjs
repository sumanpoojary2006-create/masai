import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("https://experience-admin.masaischool.com/login");
  await page.waitForTimeout(5000); // let it load
  await page.screenshot({ path: "login-page.png" });
  
  await browser.close();
})();
