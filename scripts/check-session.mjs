import { chromium } from "playwright";

async function main() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // Login
  await page.goto("http://localhost:3002/sign-in", { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "contact@elevay.app");
  await page.fill('input[name="password"]', "elevay2026");
  await Promise.all([
    page.waitForURL((u) => !u.pathname.includes("sign-in"), { timeout: 10000 }).catch(() => null),
    page.click('button:has-text("Sign in")'),
  ]);
  await page.waitForTimeout(2000);
  console.log("Logged in. URL:", page.url());

  // Check session API
  const session = await page.evaluate(async () => {
    const r = await fetch("/api/auth/session");
    return r.json();
  });
  console.log("Session:", JSON.stringify(session, null, 2));

  // Check what tenant the accounts API returns
  const accounts = await page.evaluate(async () => {
    const r = await fetch("/api/accounts");
    return { status: r.status, data: await r.json().catch(() => r.text()) };
  });
  console.log("Accounts API:", JSON.stringify(accounts, null, 2));

  // Check contacts
  const contacts = await page.evaluate(async () => {
    const r = await fetch("/api/contacts");
    return { status: r.status, data: await r.json().catch(() => r.text()) };
  });
  console.log("Contacts API:", JSON.stringify(contacts, null, 2));

  await browser.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
