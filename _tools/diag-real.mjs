/** Real accounts render check — reduced motion (no opacity reveal) + wait for rows. */
import { chromium } from "playwright";
const BASE = `http://127.0.0.1:${process.env.PORT || "3000"}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERR " + String(e.stack || e).slice(0, 500)));
page.on("console", (m) => { if (m.type() === "error") errs.push("ERR " + m.text().slice(0, 200)); });

await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(1500);
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= total; y += 540) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(120); }
const head = page.getByText("Your target list builds itself", { exact: false }).first();
try { await head.scrollIntoViewIfNeeded({ timeout: 8000 }); } catch {}
let rows = 0;
try { await page.waitForSelector("table.ls-table tbody tr", { timeout: 20000 }); } catch {}
await page.waitForTimeout(1500);
rows = await page.locator("table.ls-table tbody tr").count();
console.log("ROWS", rows, "ERRORS", errs.length);
for (const e of errs.slice(0, 6)) console.log("  " + e);

try {
  const frame = page.locator("table.ls-table").first().locator("xpath=ancestor::div[contains(@class,'rounded-2xl')][1]");
  await frame.scrollIntoViewIfNeeded({ timeout: 5000 });
  await page.waitForTimeout(600);
  await frame.screenshot({ path: "_research/raw/landing-rebuild-2026-06-14/diag-accounts.png" });
  console.log("SHOT diag-accounts");
} catch (e) { console.log("SHOT-MISS", String(e).slice(0, 140)); }
await browser.close();
console.log("DONE");
