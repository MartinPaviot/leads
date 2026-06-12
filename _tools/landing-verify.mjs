/**
 * Landing v3 verification — drives the live dev server, walks the page to
 * trigger every scroll reveal, captures each section (and the Call Mode
 * cockpit at 4 points of its cycle), then asserts the two historical
 * failure modes: horizontal overflow and content stranded at opacity 0.
 *
 * Run from repo root:  node _tools/landing-verify.mjs [port]
 */
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.argv[2] || "3000";
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = "_research/raw/landing-v3";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });

const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => consoleErrors.push("PAGEERROR " + String(e).slice(0, 200)));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/01-hero-accounts.png` });
await page.waitForTimeout(6200);
await page.screenshot({ path: `${OUT}/02-hero-campaigns.png` });

// Walk the page so IntersectionObservers fire like a real scroll.
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= total; y += 650) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(260);
}

async function shootAt(text, name, settleMs = 1800) {
  const loc = page.getByText(text, { exact: false }).first();
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.mouse.wheel(0, -180); // a little headroom above the anchor
    await page.waitForTimeout(settleMs);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    console.log("SHOT", name);
  } catch (e) {
    console.log("MISS", name, String(e).slice(0, 120));
  }
}

await shootAt("From a cold list to a closed deal", "03-how-it-works-intro", 2200);
await shootAt("Open on who is ready now", "04-step-upnext", 2600);
await shootAt("Outreach drafted from real context", "05-step-campaigns", 2600);

// The cockpit: capture prep / live / disposition / logged along its cycle.
const cockpit = page.getByText("A cold-call cockpit that preps you", { exact: false }).first();
await cockpit.scrollIntoViewIfNeeded();
await page.waitForTimeout(1100);
await page.screenshot({ path: `${OUT}/06-callmode-1-prep.png` });
await page.waitForTimeout(4200); // ~5.3s into the cycle: connected, transcript flowing
await page.screenshot({ path: `${OUT}/06-callmode-2-live.png` });
await page.waitForTimeout(5800); // ~11.1s: disposition modal up
await page.screenshot({ path: `${OUT}/06-callmode-3-disposition.png` });
await page.waitForTimeout(1900); // ~13s: logged + auto-advance
await page.screenshot({ path: `${OUT}/06-callmode-4-logged.png` });

await shootAt("Every meeting captured", "07-step-meetings", 2600);
await shootAt("Ask your pipeline anything", "08-step-chat", 2600);
await shootAt("It does the work. You make the calls.", "09-human-in-the-loop", 1600);
await shootAt("From the founder", "10-founder", 1600);
await shootAt("The alternatives weren", "11-landscape", 1600);

// FAQ: open the first item to verify the height animation.
try {
  await page.getByText("How is this different from a CRM", { exact: false }).first().click();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/12-faq-open.png` });
  console.log("SHOT 12-faq-open");
} catch (e) { console.log("MISS faq", String(e).slice(0, 120)); }

await shootAt("The infrastructure Elevay is built on", "13-built-on", 1600);
await shootAt("Run your whole pipeline", "14-final-cta", 1600);

// ── Assertions ───────────────────────────────────────────────────
const overflow = await page.evaluate(() => ({
  sw: document.documentElement.scrollWidth,
  cw: document.documentElement.clientWidth,
}));
console.log("OVERFLOW", JSON.stringify(overflow), overflow.sw <= overflow.cw ? "OK" : "FAIL");

const stranded = await page.evaluate(() => {
  const bad = [];
  document.querySelectorAll("section, h1, h2, h3, p").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.width > 80 && r.height > 14) {
      const o = parseFloat(getComputedStyle(el).opacity || "1");
      if (o < 0.05) bad.push(el.tagName + ":" + (el.textContent || "").trim().slice(0, 50));
    }
  });
  return bad;
});
console.log("STRANDED", stranded.length, JSON.stringify(stranded.slice(0, 8)));

// Mobile pass — hero + cockpit at 390px (ScaleToFit should shrink both).
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3200);
await page.screenshot({ path: `${OUT}/15-mobile-hero.png` });
try {
  await page.getByText("A cold-call cockpit", { exact: false }).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(4500);
  await page.screenshot({ path: `${OUT}/16-mobile-callmode.png` });
} catch { console.log("MISS mobile cockpit"); }
const mOverflow = await page.evaluate(() => ({
  sw: document.documentElement.scrollWidth,
  cw: document.documentElement.clientWidth,
}));
console.log("MOBILE_OVERFLOW", JSON.stringify(mOverflow), mOverflow.sw <= mOverflow.cw ? "OK" : "FAIL");

console.log("CONSOLE_ERRORS", consoleErrors.length, JSON.stringify(consoleErrors.slice(0, 6)));
await browser.close();
console.log("DONE");
