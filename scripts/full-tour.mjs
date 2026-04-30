import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // Login
  await page.goto("http://localhost:3002/sign-in", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "contact@elevay.app");
  await page.fill('input[name="password"]', "elevay2026");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 10000 }).catch(() => null),
    page.click('button:has-text("Sign in")'),
  ]);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: "tour-01-home.png" });
  console.log("Home:", page.url());

  const routes = [
    ["/accounts", "tour-02-accounts.png", 5000],
    ["/contacts", "tour-03-contacts.png", 4000],
    ["/opportunities", "tour-04-opportunities.png", 3000],
    ["/inbox", "tour-05-inbox.png", 3000],
    ["/meetings", "tour-06-meetings.png", 3000],
    ["/settings/mail-calendar", "tour-07-mail-calendar.png", 3000],
  ];

  for (const [route, file, wait] of routes) {
    await page.goto("http://localhost:3002" + route, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(wait);
    await page.screenshot({ path: file });
    console.log(route, "->", file);
  }

  await browser.close();
  console.log("\nDone. Check tour-*.png files.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
