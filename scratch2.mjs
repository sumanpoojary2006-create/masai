import { chromium } from "playwright";
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  await page.goto("https://experience-admin.masaischool.com/login");
  await page.waitForTimeout(5000); // let it load
  const html = await page.evaluate(() => document.body.innerHTML);
  console.log(html.slice(0, 5000));
  
  await browser.close();
})();
