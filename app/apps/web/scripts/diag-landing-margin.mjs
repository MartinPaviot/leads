/**
 * Landing margin diagnostic — measures across multiple viewport widths.
 */
import { chromium } from "@playwright/test";

const browser = await chromium.launch({ headless: true });

const widths = [1280, 1366, 1440, 1536, 1680, 1920];

for (const w of widths) {
  const context = await browser.newContext({
    viewport: { width: w, height: 900 },
  });
  const page = await context.newPage();

  await page.goto("http://localhost:3002/", { waitUntil: "networkidle", timeout: 60_000 });
  await page.waitForTimeout(800);

  const r = await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;

    const findWidth = (selector) => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      return {
        left: rect.left,
        right: rect.right,
        width: rect.width,
        rightSpace: window.innerWidth - rect.right,
        asymmetry: window.innerWidth - rect.right - rect.left,
      };
    };

    return {
      viewport: {
        innerWidth: window.innerWidth,
        clientWidth: html.clientWidth,
        scrollWidth: html.scrollWidth,
        scrollHeight: html.scrollHeight,
        hasVerticalScrollbar: html.scrollHeight > html.clientHeight,
        scrollbarWidth: window.innerWidth - html.clientWidth,
      },
      bodyWidth: body.clientWidth,
      bodyComputedWidth: window.getComputedStyle(body).width,
      navInner: findWidth("nav > div"),
      hero: findWidth('section .relative.mx-auto.max-w-\\[1400px\\]'),
      faq: findWidth('section .mx-auto.max-w-3xl'),
      footerInner: findWidth("footer > div"),
    };
  });

  console.log(`\n=== Viewport ${w}px ===`);
  console.log(JSON.stringify(r, null, 2));

  await context.close();
}

await browser.close();
