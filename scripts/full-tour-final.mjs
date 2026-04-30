import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });

  await p.goto("http://localhost:3000/sign-in", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.fill('input[name="email"]', "contact@elevay.app");
  await p.fill('input[name="password"]', "elevay2026");
  await p.click('button:has-text("Sign in")');
  await p.waitForURL("**/home", { timeout: 20000 });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: "TOUR-01-home.png" });
  console.log("home OK");

  const routes = [
    ["/accounts", 15000],
    ["/contacts", 10000],
    ["/opportunities", 8000],
    ["/inbox", 8000],
    ["/meetings", 8000],
    ["/campaigns", 8000],
    ["/settings/mail-calendar", 8000],
  ];

  let i = 2;
  for (const [route, wait] of routes) {
    try {
      await p.goto("http://localhost:3000" + route, { waitUntil: "domcontentloaded", timeout: 30000 });
      await p.waitForTimeout(wait);
      const fname = `TOUR-${String(i).padStart(2, "0")}-${route.slice(1).replace(/\//g, "-")}.png`;
      await p.screenshot({ path: fname });
      console.log(route, "OK ->", fname);
    } catch (e) {
      console.log(route, "FAILED:", e.message.substring(0, 80));
    }
    i++;
  }

  await b.close();
  console.log("\nDone.");
}

main().catch((e) => { console.error(e.message); process.exit(1); });
