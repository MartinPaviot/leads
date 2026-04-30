import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch({ headless: false });
  const p = await b.newPage({ viewport: { width: 1280, height: 800 } });

  console.log("1. Going to sign-in...");
  await p.goto("http://localhost:3000/sign-in", { waitUntil: "domcontentloaded", timeout: 20000 });
  await p.waitForTimeout(2000);

  console.log("2. Clicking Google...");
  const [nav] = await Promise.all([
    p.waitForEvent("popup", { timeout: 10000 }).catch(() => null),
    p.waitForNavigation({ timeout: 10000 }).catch(() => null),
    p.click('button:has-text("Google")'),
  ]);

  await p.waitForTimeout(3000);
  const url = p.url();
  console.log("3. Current URL after click:", url);

  // Check if we got redirected to Google
  if (url.includes("accounts.google.com") || url.includes("googleapis.com")) {
    console.log("SUCCESS: Redirected to Google OAuth!");
    await p.screenshot({ path: "google-oauth-redirect.png" });

    // Try to complete the OAuth with contact@elevay.app
    // Look for email input
    const emailInput = await p.$('input[type="email"]');
    if (emailInput) {
      console.log("4. Filling email...");
      await emailInput.fill("contact@elevay.app");
      await p.click("#identifierNext, button:has-text('Next'), button:has-text('Suivant')");
      await p.waitForTimeout(3000);
      await p.screenshot({ path: "google-oauth-password.png" });
      console.log("5. At password step. URL:", p.url());
    }
  } else if (url.includes("error") || url.includes("sign-in")) {
    console.log("FAILED: Still on sign-in or error page");
    await p.screenshot({ path: "google-oauth-failed.png" });
    // Check for error message
    const errorEl = await p.$("[role='alert']");
    if (errorEl) console.log("Error:", await errorEl.textContent());
  } else {
    console.log("UNKNOWN STATE:", url);
    await p.screenshot({ path: "google-oauth-unknown.png" });
  }

  // Keep browser open for 10s to see what's happening
  await p.waitForTimeout(10000);
  console.log("6. Final URL:", p.url());
  await p.screenshot({ path: "google-oauth-final.png" });

  await b.close();
}

main().catch((e) => { console.error(e.message); process.exit(1); });
