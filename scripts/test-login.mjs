import { chromium } from "playwright";

const BASE = "http://localhost:3002";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  console.log("1. Opening sign-in...");
  await page.goto(`${BASE}/sign-in`, { waitUntil: "networkidle" });

  console.log("2. Filling credentials...");
  await page.fill('input[name="email"]', "contact@elevay.app");
  await page.fill('input[name="password"]', "elevay2026");

  console.log("3. Clicking Sign in...");
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes("sign-in"), { timeout: 15000 }).catch(() => null),
    page.click('button:has-text("Sign in")'),
  ]);
  await page.waitForTimeout(3000);

  const url = page.url();
  console.log("4. URL after login:", url);
  await page.screenshot({ path: "pw-login-result.png" });

  if (!url.includes("sign-in")) {
    console.log("LOGIN SUCCESS!");

    // Navigate through the app
    const pages = ["/home", "/accounts", "/contacts", "/opportunities", "/chat"];
    for (const p of pages) {
      console.log(`\n5. Navigating to ${p}...`);
      await page.goto(`${BASE}${p}`, { waitUntil: "networkidle", timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
      const fname = `pw-app${p.replace(/\//g, "-")}.png`;
      await page.screenshot({ path: fname });
      console.log(`   Screenshot: ${fname}`);

      // Count visible data
      const rows = await page.$$("tr, [data-row], [role='row']");
      const cards = await page.$$("[data-card], .card, [class*='card']");
      console.log(`   Rows: ${rows.length}, Cards: ${cards.length}`);
    }
  } else {
    console.log("LOGIN FAILED. URL:", url);
    const errorEl = await page.$("[role='alert']");
    if (errorEl) console.log("Error:", await errorEl.textContent());
  }

  await browser.close();
}

main().catch((e) => {
  console.error("Error:", e.message);
  process.exit(1);
});
