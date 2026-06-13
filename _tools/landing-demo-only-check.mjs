/** Confirm the landing funnels only to the demo: no /sign-up anchors anywhere,
 * Log in preserved, primary CTAs point at Calendly. Captures hero + final CTA. */
import { chromium } from "playwright";
import fs from "node:fs";
const PORT = process.argv[2] || "3000";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "_research/raw/landing-v3";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2200);
await page.screenshot({ path: `${OUT}/demo-01-hero.png` });

const audit = await page.evaluate(() => {
  const anchors = [...document.querySelectorAll("a, [href]")];
  const signupHrefs = anchors.map((a) => a.getAttribute("href")).filter((h) => h && h.includes("/sign-up"));
  const signinHrefs = anchors.map((a) => a.getAttribute("href")).filter((h) => h && h.includes("/sign-in"));
  const calendly = anchors.map((a) => a.getAttribute("href")).filter((h) => h && h.includes("calendly")).length;
  const bodyText = document.body.innerText;
  return {
    signupCount: signupHrefs.length,
    signinCount: signinHrefs.length,
    calendlyCount: calendly,
    hasTryFree: bodyText.includes("Try free"),
    hasBuildMyList: bodyText.includes("Build my target list"),
    hasBookDemo: bodyText.includes("Book a demo"),
    hasLogin: bodyText.includes("Log in"),
    hasTrial: /14-day|free trial|credit card/i.test(bodyText),
  };
});
console.log("AUDIT", JSON.stringify(audit, null, 0));

// Final CTA shot
await page.getByText("Run your whole pipeline", { exact: false }).first().scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/demo-02-final-cta.png` });

await browser.close();
const pass = audit.signupCount === 0 && audit.signinCount >= 1 && !audit.hasTryFree && !audit.hasBuildMyList && audit.hasBookDemo && audit.hasLogin && !audit.hasTrial;
console.log("RESULT", pass ? "PASS" : "FAIL");
