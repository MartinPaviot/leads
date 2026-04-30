import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto("http://localhost:3002/sign-in", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "contact@elevay.app");
  await page.fill('input[name="password"]', "elevay2026");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 10000 }).catch(() => null),
    page.click('button:has-text("Sign in")'),
  ]);
  await page.waitForTimeout(3000);

  // Get cookies
  const cookies = await page.context().cookies();
  const sessionCookie = cookies.find(c => c.name.includes("session") || c.name.includes("auth"));
  console.log("Session cookies:", cookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`));

  // Try simple fetch
  const result = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/auth/session", { credentials: "include" });
      const text = await r.text();
      return { status: r.status, body: text.substring(0, 500) };
    } catch(e) { return { error: e.message }; }
  });
  console.log("Session:", result.body || result.error);

  // Try contacts count
  const contacts = await page.evaluate(async () => {
    try {
      const r = await fetch("/api/contacts?limit=1", { credentials: "include" });
      const text = await r.text();
      return { status: r.status, body: text.substring(0, 500) };
    } catch(e) { return { error: e.message }; }
  });
  console.log("Contacts:", contacts.status, contacts.body?.substring(0, 300) || contacts.error);

  await browser.close();
}

main().catch(e => { console.error(e.message); process.exit(1); });
