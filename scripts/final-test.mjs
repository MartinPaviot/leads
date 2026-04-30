import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });

  await p.goto("http://localhost:3002/sign-in", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForTimeout(3000);
  await p.fill('input[name="email"]', "contact@elevay.app");
  await p.fill('input[name="password"]', "elevay2026");
  await p.click('button:has-text("Sign in")');
  await p.waitForURL("**/home", { timeout: 30000 });
  console.log("Logged in");

  await p.goto("http://localhost:3002/accounts", { waitUntil: "domcontentloaded", timeout: 30000 });

  for (let i = 0; i < 15; i++) {
    await p.waitForTimeout(3000);
    const count = await p.evaluate(() => {
      const rows = document.querySelectorAll("table tbody tr");
      const skeletons = document.querySelectorAll('[class*="animate-pulse"], [class*="skeleton"]');
      const headerEl = document.querySelector("header");
      return {
        rows: rows.length,
        skeletons: skeletons.length,
        header: headerEl?.textContent?.substring(0, 80) || "no header",
      };
    });
    console.log(`Check ${i + 1}: rows=${count.rows} skeletons=${count.skeletons} header="${count.header}"`);
    if (count.rows > 0 && count.skeletons === 0) {
      console.log("DATA LOADED!");
      break;
    }
  }

  await p.screenshot({ path: "REAL-accounts.png" });
  console.log("accounts screenshot saved");

  await p.goto("http://localhost:3002/contacts", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForTimeout(8000);
  await p.screenshot({ path: "REAL-contacts.png" });
  console.log("contacts screenshot saved");

  await b.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
