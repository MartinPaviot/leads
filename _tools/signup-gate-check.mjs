/** Verify the invitation-only sign-up gate on a real browser (prod).
 * No token / bogus token must land on the marketing page (not the form). */
import { chromium } from "playwright";

const BASE = process.argv[2] || "https://www.elevay.dev";
const browser = await chromium.launch();

async function check(path, label) {
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(1500);
  const url = page.url();
  const text = await page.evaluate(() => document.body.innerText);
  const hasSignupForm = /Create your account|Create account/.test(text) && /password/i.test(text);
  const onLanding = /runs your pipeline|Book a demo/.test(text);
  console.log(`${label}: finalURL=${url.replace(BASE, "")} signupForm=${hasSignupForm} landing=${onLanding}`);
  await page.close();
  return { url, hasSignupForm, onLanding };
}

const noTok = await check("/sign-up", "no-token");
const bogus = await check("/sign-up?invite=bogus123", "bogus-token");
// Control: the sign-in page should still render normally (login stays open).
const signin = await browser.newPage();
await signin.goto(BASE + "/sign-in", { waitUntil: "networkidle", timeout: 60000 });
const signinText = await signin.evaluate(() => document.body.innerText);
console.log(`sign-in control: hasLoginForm=${/password/i.test(signinText)} url=${signin.url().replace(BASE, "")}`);
await signin.close();

await browser.close();
const pass = !noTok.hasSignupForm && !bogus.hasSignupForm && noTok.onLanding && bogus.onLanding;
console.log("RESULT", pass ? "PASS — sign-up closed without invite" : "FAIL");
