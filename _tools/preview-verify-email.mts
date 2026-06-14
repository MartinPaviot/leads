/* Visual proof for the verify-email work:
 *  1) the /verify-email-sent provider buttons (light + dark) with brand icons
 *  2) the verify email rendered next to the invite email (same branded shell)
 * Renders the REAL shell output + REAL provider SVGs to one PNG.
 * Run from app/apps/web:  pnpm exec tsx ../../../_tools/preview-verify-email.mts
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  renderBrandedEmail,
  getBrandedEmailAttachments,
} from "../app/apps/web/src/lib/emails/email-shell.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(repoRoot, "_research/raw/verify-email-2026-06-14");
fs.mkdirSync(OUT, { recursive: true });

// Inline the logo so cid: resolves in a browser.
const logo = getBrandedEmailAttachments()[0];
const dataUri = `data:image/png;base64,${logo.content}`;
const inline = (html: string) =>
  html.replaceAll(`cid:${logo.contentId}`, dataUri);

// ---- The two emails (same option objects the send functions use) ----------
const verifyHtml = inline(
  renderBrandedEmail({
    preheader:
      "Confirm your email to finish setting up Elevay — the link is valid for 24 hours.",
    heading: "Confirm your Elevay email",
    bodyHtml: `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      Welcome aboard. Click the button below to confirm this is your email — the link is valid for 24 hours.
    </p>`,
    button: { label: "Confirm email", url: "https://www.elevay.dev/verify-email?token=demo" },
    fallback: { text: "confirm your email here" },
    footnoteHtml:
      "If you didn't sign up for Elevay, you can safely ignore this email — no account will be created on your behalf.",
  })
);

const inviteHtml = inline(
  renderBrandedEmail({
    preheader: "Martin Paviot invited you to join Pilae on Elevay.",
    heading: "You've been invited to Pilae",
    bodyHtml: `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
          <strong>Martin Paviot</strong> (martin.paviot@pilae.ch) invited you to join <strong>Pilae</strong> on Elevay as <strong>member</strong>.
        </p>`,
    button: { label: "Accept invitation", url: "https://www.elevay.dev/accept-invite?token=demo" },
    fallback: { text: "Accept your invitation here" },
    footnoteHtml:
      "This invitation expires on June 28, 2026. If you didn't expect this email, you can ignore it.",
  })
);

// Notification email — same inputs notifications.ts buildEmailParts passes.
const notifHtml = inline(
  renderBrandedEmail({
    preheader: "Deal at risk: no reply from Migros in 14 days.",
    heading: "Deal at risk: Migros",
    bodyHtml: `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">No reply from Migros in 14 days — the deal has gone quiet. Worth a nudge.</p>`,
    button: { label: "View in Elevay", url: "https://www.elevay.dev/deals/demo" },
    footnoteHtml: "You're receiving this because you have deal risk notifications enabled.",
  })
);

// ---- The provider buttons (same SVGs as provider-icon.tsx) -----------------
const gmailSvg = `<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4caf50" d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z"/><path fill="#1e88e5" d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z"/><polygon fill="#e53935" points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"/><path fill="#c62828" d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8 C4.924,8,3,9.924,3,12.298z"/><path fill="#fbc02d" d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8 C43.076,8,45,9.924,45,12.298z"/></svg>`;
const outlookSvg = `<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="6" width="36" height="36" rx="8" fill="#0F6CBD"/><ellipse cx="24" cy="24" rx="8" ry="9" fill="none" stroke="#ffffff" stroke-width="4.4"/></svg>`;
const tile = (color: string) =>
  `<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="6" width="36" height="36" rx="9" fill="${color}"/><rect x="13" y="17" width="22" height="15" rx="2.5" fill="#ffffff"/><path d="M13.8 19 L24 26 L34.2 19" fill="none" stroke="${color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PROVIDERS: Array<[string, string]> = [
  ["Open Gmail", gmailSvg],
  ["Open Outlook", outlookSvg],
  ["Open Yahoo Mail", tile("#6001D2")],
  ["Open iCloud Mail", tile("#3D8EFF")],
  ["Open Fastmail", tile("#0067B9")],
  ["Open Proton Mail", tile("#6D4AFF")],
];

function buttonsCard(theme: "light" | "dark") {
  const t =
    theme === "light"
      ? { page: "#f4f4f5", card: "#ffffff", text: "#18181b", sub: "#52525b", border: "#e4e4e7" }
      : { page: "#09090b", card: "#161618", text: "#fafafa", sub: "#a1a1aa", border: "#2a2a2e" };
  const btns = PROVIDERS.map(
    ([label, svg]) => `
      <a style="display:flex;align-items:center;justify-content:center;gap:8px;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:500;text-decoration:none;background:${t.card};color:${t.text};border:1px solid ${t.border};">
        <span style="display:inline-flex;flex-shrink:0;">${svg}</span>${label}
      </a>`
  ).join("");
  return `
    <div style="background:${t.page};border-radius:14px;padding:28px;width:340px;">
      <div style="font:600 11px system-ui;letter-spacing:.5px;color:${t.sub};text-transform:uppercase;margin-bottom:14px;">${theme}</div>
      <div style="background:${t.card};border:1px solid ${t.border};border-radius:12px;padding:24px;box-shadow:0 8px 30px rgba(0,0,0,.08);">
        <div style="font:600 16px system-ui;color:${t.text};text-align:center;margin-bottom:4px;">Check your inbox</div>
        <div style="font:400 13px system-ui;color:${t.sub};text-align:center;margin-bottom:18px;">We sent a verification link to you@company.com</div>
        <div style="display:flex;flex-direction:column;gap:8px;">${btns}</div>
      </div>
    </div>`;
}

const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#d4d4d8;font-family:system-ui;padding:32px;}
  h2{font:600 14px system-ui;color:#3f3f46;margin:8px 0 12px;}
  .row{display:flex;gap:24px;flex-wrap:wrap;align-items:flex-start;}
  .frame{background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 8px 30px rgba(0,0,0,.12);width:600px;}
</style></head><body>
  <h2>1 — /verify-email-sent provider buttons (Gmail + Outlook = corporate fallback; rare providers shown individually)</h2>
  <div class="row">${buttonsCard("light")}${buttonsCard("dark")}</div>
  <h2 style="margin-top:28px;">2 — Every no-reply email now shares one shell: verification · workspace invite · notification</h2>
  <div class="row">
    <div class="frame">${verifyHtml}</div>
    <div class="frame">${inviteHtml}</div>
    <div class="frame">${notifHtml}</div>
  </div>
</body></html>`;

const htmlPath = path.join(OUT, "preview.html");
fs.writeFileSync(htmlPath, doc);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1960, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(OUT, "preview.png"), fullPage: true });
await browser.close();
console.log("WROTE", path.join(OUT, "preview.png"));
