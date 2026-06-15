/**
 * Capture ground truth: log in as Martin (minted authjs cookie) and capture
 * every real product page — full-page screenshot + a DOM structure dump — so
 * the landing mockups can be rebuilt to match the real pages detail-for-detail.
 *
 * Self-healing: the local dev server flaps (a parallel session restarts it), so
 * each route is retried across CONNECTION_REFUSED / nav-interrupted, and a page
 * that loads its chrome but no data is reloaded a couple of times.
 *
 * Usage (from app/apps/web, token in env):
 *   TOKEN=$(node --env-file=.env.local scripts/mint-session.mjs) \
 *   PORT=3000 node ../../../_tools/capture-real-pages.mjs
 */
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = process.env.PORT || "3000";
const BASE = `http://127.0.0.1:${PORT}`;
const TOKEN = (process.env.TOKEN || "").trim();
const OUT = "_research/raw/real-pages-2026-06-14";
fs.mkdirSync(OUT, { recursive: true });
if (!TOKEN) { console.error("TOKEN env missing"); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ROUTES = [
  { path: "/accounts", name: "accounts", needRows: true },
  { path: "/", name: "up-next" },
  { path: "/opportunities", name: "opportunities" },
  { path: "/sequences", name: "campaigns" },
  { path: "/meetings", name: "meetings" },
  { path: "/chat", name: "chat" },
  { path: "/call-mode", name: "call-mode" },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 940 }, deviceScaleFactor: 1.25 });
await ctx.addCookies([{ name: "authjs.session-token", value: TOKEN, url: BASE }]);
const page = await ctx.newPage();

async function waitServer() {
  for (let i = 0; i < 40; i++) {
    try { const r = await page.request.get(BASE + "/api/health", { timeout: 4000 }); if (r.status() < 500) return true; } catch {}
    try { const r = await page.request.get(BASE + "/", { timeout: 4000 }); if (r.status() < 500) return true; } catch {}
    await sleep(2000);
  }
  return false;
}

const dump = {};
for (const r of ROUTES) {
  let ok = false;
  for (let attempt = 1; attempt <= 5 && !ok; attempt++) {
    try {
      await waitServer();
      await page.goto(BASE + r.path, { waitUntil: "domcontentloaded", timeout: 120_000 });
      await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
      await sleep(3500);
      if (r.needRows) {
        let rows = await page.locator("table tbody tr").count().catch(() => 0);
        // data may lag the chrome; reload a couple times before giving up
        for (let k = 0; k < 3 && rows === 0; k++) { await page.reload({ waitUntil: "networkidle" }).catch(() => {}); await sleep(3500); rows = await page.locator("table tbody tr").count().catch(() => 0); }
      }
      await page.screenshot({ path: `${OUT}/${r.name}-viewport.png` });
      await page.screenshot({ path: `${OUT}/${r.name}-full.png`, fullPage: true });
      const info = await page.evaluate(() => {
        const txt = (el) => (el?.textContent || "").replace(/\s+/g, " ").trim();
        const uniq = (a) => [...new Set(a.filter(Boolean))];
        const title = txt(document.querySelector("h1")) || txt(document.querySelector("main h1, header h1"));
        const buttons = uniq([...document.querySelectorAll("main button, main a[role=button]")].map((b) => txt(b)).filter((t) => t && t.length < 32)).slice(0, 45);
        const ths = [...document.querySelectorAll("table thead th")].map((th) => txt(th) || "(icon)");
        const sections = uniq([...document.querySelectorAll("main [class*=uppercase]")].map((s) => txt(s)).filter((t) => t && t.length < 40)).slice(0, 45);
        const firstRowCells = [...(document.querySelector("table tbody tr")?.querySelectorAll("td") || [])].map((td) => txt(td).slice(0, 40));
        const rowCount = document.querySelectorAll("table tbody tr").length;
        return { title, buttons, ths, sections, firstRowCells, rowCount, bodyLen: document.body.innerText.length };
      });
      dump[r.name] = info;
      console.log(`\n=== ${r.path} (attempt ${attempt}) ===`);
      console.log(JSON.stringify(info, null, 1));
      ok = true;
    } catch (e) {
      console.log(`\n=== ${r.path} (attempt ${attempt}) FAIL ${String(e).slice(0, 120)}`);
      await sleep(6000);
    }
  }
  if (!ok) dump[r.name] = { error: "all attempts failed" };
}
fs.writeFileSync(`${OUT}/_dom-dump.json`, JSON.stringify(dump, null, 2));
console.log("\nDONE");
await browser.close();
