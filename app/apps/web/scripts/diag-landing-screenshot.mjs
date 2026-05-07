/**
 * Capture full-page screenshots at common viewport widths to visually
 * confirm centering. Also draws a vertical center line marker so any
 * rendering offset is immediately obvious.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "fs";

mkdirSync("./screenshots/landing", { recursive: true });

const browser = await chromium.launch({ headless: true });

for (const w of [1366, 1440, 1920]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3002/", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(1000);

  // Inject a vertical centerline overlay so we can SEE any offset
  await page.evaluate(() => {
    const line = document.createElement("div");
    line.style.cssText = `position:fixed;top:0;left:50%;width:1px;height:100vh;background:red;z-index:99999;pointer-events:none;opacity:0.5`;
    document.body.appendChild(line);

    // Also mark the bounds of the largest container
    const c = document.querySelector('[class*="max-w-\\[1400px\\]"]');
    if (c) {
      const r = c.getBoundingClientRect();
      const leftMark = document.createElement("div");
      leftMark.style.cssText = `position:fixed;top:0;left:${r.left}px;width:1px;height:100vh;background:blue;z-index:99999;pointer-events:none;opacity:0.5`;
      document.body.appendChild(leftMark);
      const rightMark = document.createElement("div");
      rightMark.style.cssText = `position:fixed;top:0;left:${r.right}px;width:1px;height:100vh;background:blue;z-index:99999;pointer-events:none;opacity:0.5`;
      document.body.appendChild(rightMark);
    }
  });

  await page.screenshot({
    path: `./screenshots/landing/landing-${w}px.png`,
    fullPage: false,
  });
  console.log(`[+] ./screenshots/landing/landing-${w}px.png`);

  // Also a screenshot scrolled to FAQ section
  await page.evaluate(() => {
    const faqHeader = Array.from(document.querySelectorAll("h2")).find((h) =>
      h.textContent?.toLowerCase().includes("question"),
    );
    if (faqHeader) faqHeader.scrollIntoView({ block: "start" });
  });
  await page.waitForTimeout(500);
  await page.screenshot({
    path: `./screenshots/landing/landing-faq-${w}px.png`,
    fullPage: false,
  });

  await ctx.close();
}

await browser.close();
