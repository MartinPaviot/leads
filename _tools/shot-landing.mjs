/** Screenshot the rebuilt landing surfaces (own chromium — MCP browser is busy).
 * Does a full scroll-through first so every RevealOnView surface goes live
 * (IntersectionObserver fires), then captures targets. Run from repo root:
 *   PORT=3000 node _tools/shot-landing.mjs */
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = `http://127.0.0.1:${process.env.PORT || "3000"}`;
const OUT = "_research/raw/landing-rebuild-2026-06-14";
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.5 });
const errs = [];
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errs.push("PAGEERR " + String(e).slice(0, 200)));

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 180000 });
await sleep(2500);
await page.screenshot({ path: `${OUT}/01-hero-accounts.png` }); // hero phase 0 = Accounts

// Scroll-through pass: walk the whole page so every IntersectionObserver fires
// and every RevealOnView surface flips live.
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= total; y += 560) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(160); }
await page.evaluate(() => window.scrollTo(0, 0));
await sleep(500);

async function shoot(text, name, settle = 1400) {
  try {
    const loc = page.getByText(text, { exact: false }).first();
    await loc.scrollIntoViewIfNeeded({ timeout: 8000 });
    await page.evaluate(() => window.scrollBy(0, 130));
    await sleep(settle);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    // tight crop of the nearest app window (chrome + content)
    const win = loc.locator("xpath=following::div[contains(@class,'rounded-2xl')][1]");
    const box = await win.boundingBox().catch(() => null);
    if (box) await page.screenshot({ path: `${OUT}/${name}-window.png`, clip: { x: Math.max(0, box.x), y: Math.max(0, box.y), width: Math.min(1440, box.width), height: Math.min(940 * 1.5, box.height) } });
    console.log("SHOT", name, box ? "(+window)" : "");
  } catch (e) { console.log("MISS", name, String(e).slice(0, 120)); }
}
await shoot("Your target list builds itself", "02-step-accounts");
await shoot("Open on who is ready now", "03-step-upnext");
await shoot("Your CRM fills itself", "04-step-opportunities");
await shoot("Outreach drafted from real context", "05-step-campaigns");
await shoot("Every meeting captured for you", "06-step-meetings");
await shoot("Ask your pipeline anything", "07-step-chat");

const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log("OVERFLOW", JSON.stringify(ov), ov.sw <= ov.cw + 1 ? "OK" : "FAIL");
console.log("CONSOLE_ERRORS", errs.length, JSON.stringify(errs.slice(0, 6)));
await browser.close();
console.log("DONE");
