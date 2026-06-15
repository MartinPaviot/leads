/** Capture full page errors on the landing WITHOUT reducedMotion emulation. */
import { chromium } from "playwright";
const BASE = `http://127.0.0.1:${process.env.PORT || "3000"}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 940 } });
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERR " + String(e.stack || e).slice(0, 900)));
await page.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 200000 });
await page.waitForTimeout(2000);
const total = await page.evaluate(() => document.body.scrollHeight);
for (let y = 0; y <= total; y += 520) { await page.evaluate((yy) => window.scrollTo(0, yy), y); await page.waitForTimeout(160); }
await page.waitForTimeout(3000);
console.log("PAGEERRORS", errs.length);
for (const e of errs) console.log("----\n" + e);
await browser.close();
console.log("DONE");
