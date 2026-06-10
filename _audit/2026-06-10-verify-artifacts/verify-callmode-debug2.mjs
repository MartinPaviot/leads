import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const webDir = path.resolve("app/apps/web");
const env = readFileSync(path.join(webDir, ".env.local"), "utf8");
const secret = /^AUTH_SECRET=["']?([^"'\r\n]+)/m.exec(env)[1];
process.env.AUTH_SECRET = secret;
const require = createRequire(path.join(webDir, "package.json"));
const { encode } = require("next-auth/jwt");
const { chromium } = require("playwright");

const token = {
  id: "890bac78-0347-47f0-a36c-9cbafeed4348",
  sub: "890bac78-0347-47f0-a36c-9cbafeed4348",
  tenantId: "47dca783-dac0-45a5-85cb-d217b2a3174d",
  appUserId: "82aa3dc3-3f03-48d9-bcc8-96ce8ea52d46",
  role: "member",
  name: "Martin Paviot",
  email: "martin@elevay.dev",
};
const cookie = await encode({ token, secret, salt: "authjs.session-token", maxAge: 28800 });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
await ctx.addCookies([{ name: "authjs.session-token", value: cookie, domain: "127.0.0.1", path: "/" }]);
const page = await ctx.newPage();
page.on("console", (m) => { if (m.type() === "error") console.log("console.error:", m.text().slice(0, 200)); });
page.on("response", (r) => { if (r.status() >= 400) console.log("HTTP", r.status(), r.url().slice(0, 120)); });
await page.goto("http://127.0.0.1:3001/call-mode", { waitUntil: "domcontentloaded", timeout: 300000 });
await page.waitForTimeout(15000);
console.log("url:", page.url());
console.log("body:", JSON.stringify(await page.evaluate(() => document.body.innerText.slice(0, 500))));
await page.screenshot({ path: "_tools/callmode-debug2.png" });
await browser.close();
