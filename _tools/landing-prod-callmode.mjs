/** Confirm the Call Mode consistency fix is LIVE on prod: heading left-aligned
 * and sharing the same left edge (x) as the Campaigns step heading. */
import { chromium } from "playwright";
import fs from "node:fs";
const OUT = "_research/raw/landing-v3";
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1380, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));

await page.goto("https://www.elevay.dev/", { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForTimeout(2500);

const cockpit = page.getByText("A cold-call cockpit that preps you", { exact: false }).first();
await cockpit.scrollIntoViewIfNeeded();
await page.waitForTimeout(1400);
await page.screenshot({ path: `${OUT}/prod-03-callmode-aligned.png` });

const aligns = await page.evaluate(() => {
  const find = (t) => [...document.querySelectorAll("h3")].find((h) => h.textContent?.includes(t));
  const a = find("Outreach drafted from real context");
  const b = find("A cold-call cockpit that preps you");
  return {
    campaignsLeft: a ? Math.round(a.getBoundingClientRect().left) : null,
    callmodeLeft: b ? Math.round(b.getBoundingClientRect().left) : null,
    callmodeTextAlign: b ? getComputedStyle(b).textAlign : null,
  };
});
console.log("PROD_ALIGN", JSON.stringify(aligns));
console.log("ALIGNED", aligns.campaignsLeft === aligns.callmodeLeft ? "YES" : "NO");

await page.waitForTimeout(4500);
await page.screenshot({ path: `${OUT}/prod-04-callmode-live.png` });

const overflow = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
console.log("OVERFLOW", JSON.stringify(overflow), overflow.sw <= overflow.cw ? "OK" : "FAIL");
console.log("PAGEERRORS", errors.length, JSON.stringify(errors.slice(0, 3)));
await browser.close();
console.log("DONE");
