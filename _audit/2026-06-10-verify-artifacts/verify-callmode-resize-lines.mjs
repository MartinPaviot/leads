// Local-only visual check: the Call Mode resize handles must not draw a second
// line next to the panel borders. Mints a local session, opens /call-mode,
// screenshots the junctions at rest and on hover.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webDir = path.resolve("app/apps/web");
const env = readFileSync(path.join(webDir, ".env.local"), "utf8");
const secret = /^AUTH_SECRET=["']?([^"'\r\n]+)/m.exec(env)?.[1];
if (!secret) { console.error("AUTH_SECRET not found in .env.local"); process.exit(1); }
process.env.AUTH_SECRET = secret;

const require = createRequire(path.join(webDir, "package.json"));
const { encode } = require("next-auth/jwt");
const { chromium } = require("playwright");

// martin.paviot@pilae.ch — the user who owns the active call campaign, so the
// cockpit (not the goal wizard) renders. Read-only browsing.
const token = {
  id: "43dd3110-202e-4bd0-b762-0446ef8da193",
  sub: "43dd3110-202e-4bd0-b762-0446ef8da193",
  tenantId: "47dca783-dac0-45a5-85cb-d217b2a3174d",
  appUserId: "e98c45b9-4080-4000-abaf-e8b4a884ca9b",
  role: "member",
  name: "Martin Paviot",
  email: "martin.paviot@pilae.ch",
};
const cookie = await encode({ token, secret, salt: "authjs.session-token", maxAge: 8 * 60 * 60 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.addCookies([{ name: "authjs.session-token", value: cookie, domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();
const base = process.env.BASE_URL || "http://127.0.0.1:3001";
await page.goto(`${base}/call-mode`, { waitUntil: "domcontentloaded", timeout: 480000 });
await page.waitForSelector('[title="Glisser pour redimensionner"]', { timeout: 120000, state: "attached" });
await page.waitForTimeout(1500);

await page.screenshot({ path: "_tools/callmode-resize-01-full.png" });

// Measure: how many vertical 1px lines around each junction?
const probe = await page.evaluate(() => {
  const handles = [...document.querySelectorAll('[title="Glisser pour redimensionner"]')];
  return handles.map((h) => {
    const r = h.getBoundingClientRect();
    return { width: r.width, x: r.x };
  });
});
console.log("handles:", JSON.stringify(probe));

// Hover the left handle's grab zone to show the highlight + grip
const left = page.locator('[title="Glisser pour redimensionner"]').first();
const box = await left.boundingBox();
if (box) {
  await page.mouse.move(box.x, box.y + box.height / 2);
  await page.waitForTimeout(400);
  await page.screenshot({
    path: "_tools/callmode-resize-02-hover-left.png",
    clip: { x: Math.max(0, box.x - 120), y: 150, width: 280, height: 420 },
  });
}

// Close-up of both junctions at rest
const all = await page.locator('[title="Glisser pour redimensionner"]').all();
for (let i = 0; i < all.length; i++) {
  const b = await all[i].boundingBox();
  if (!b) continue;
  await page.mouse.move(10, 10); // un-hover
  await page.waitForTimeout(300);
  await page.screenshot({
    path: `_tools/callmode-resize-03-junction-${i}.png`,
    clip: { x: Math.max(0, b.x - 60), y: 300, width: 120, height: 200 },
  });
}

// Drag test: resize the left rail by -60px and verify width actually changes
const before = await page.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().width);
const b2 = await left.boundingBox();
if (b2) {
  await page.mouse.move(b2.x, b2.y + 300);
  await page.mouse.down();
  await page.mouse.move(b2.x - 60, b2.y + 300, { steps: 6 });
  await page.mouse.up();
}
await page.waitForTimeout(300);
const after = await page.evaluate(() => document.querySelector("aside")?.getBoundingClientRect().width);
console.log("drag: left rail width", before, "->", after);
await page.screenshot({ path: "_tools/callmode-resize-04-after-drag.png" });

await browser.close();
