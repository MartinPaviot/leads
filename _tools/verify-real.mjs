/** Verify the landing's real-component surfaces: element-shot each + content
 * check + page errors. Reduced motion so reveals are instant. Repo root:
 *   PORT=3000 node _tools/verify-real.mjs */
import { chromium } from "playwright";
import fs from "node:fs";
const BASE = `http://127.0.0.1:${process.env.PORT || "3000"}`;
const OUT = "_research/raw/landing-rebuild-2026-06-14";
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERR " + String(e).slice(0, 200)));
page.on("console", (m) => { if (m.type() === "error") { const t = m.text(); if (!/ERR_NAME_NOT_RESOLVED|ERR_SOCKET|ERR_CONNECTION|favicon|s2\/favicons|icon\.horse/.test(t)) errs.push("ERR " + t.slice(0, 160)); } });

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 200000 });
await page.waitForTimeout(1800);
// Hero (top of page): the real surfaces cycle in the shell; reduced motion
// pauses the cycle on phase 0 (real Accounts). Give it time to load + fetch.
await page.waitForTimeout(6000);
try { const hero = page.locator("div.rounded-2xl").first(); await hero.screenshot({ path: `${OUT}/real-hero.png` }); console.log("SHOT real-hero"); } catch (e) { console.log("MISS real-hero", String(e).slice(0, 120)); }
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= total; y += 520) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(140); }

const steps = [
  ["Your target list builds itself", "real-accounts", "Find more accounts"],
  ["Open on who is ready now", "real-upnext", "Good morning"],
  ["Outreach drafted from real context", "real-campaigns", "Re-engage"],
  ["Your CRM fills itself", "real-opportunities", "Proposal"],
  ["Every meeting captured for you", "real-meetings", "Notion"],
  ["Ask your pipeline anything", "real-chat", null],
];

for (const [heading, name, needle] of steps) {
  try {
    const h = page.getByText(heading, { exact: false }).first();
    await h.scrollIntoViewIfNeeded({ timeout: 8000 });
    await page.waitForTimeout(6500);
    const frame = h.locator("xpath=following::div[contains(@class,'rounded-2xl')][1]");
    await frame.screenshot({ path: `${OUT}/${name}.png` });
    const present = needle ? await page.evaluate((n) => document.body.innerText.includes(n), needle) : "n/a";
    console.log("SHOT", name, "needle:", present);
  } catch (e) { console.log("MISS", name, String(e).slice(0, 120)); }
}

const ov = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log("OVERFLOW", JSON.stringify(ov), ov.sw <= ov.cw + 1 ? "OK" : "FAIL");
console.log("ERRORS(non-network)", errs.length);
for (const e of errs.slice(0, 8)) console.log("  " + e);
await browser.close();
console.log("DONE");
