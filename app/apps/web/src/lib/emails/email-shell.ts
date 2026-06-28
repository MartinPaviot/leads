import { ORION_LOGO_PNG_BASE64 } from "./orion-logo";

/** Content-ID for the inline logo; referenced as cid: in every branded email. */
const LOGO_CID = "orion-logo";

export interface BrandedEmailButton {
  label: string;
  url: string;
}

export interface BrandedEmailOptions {
  /** Hidden inbox-preview line most clients show next to the subject. */
  preheader?: string;
  /** Card heading (rendered as the h1). Escaped for you. */
  heading: string;
  /** Body HTML — any interpolated value must already be escaped by the caller. */
  bodyHtml: string;
  /** Optional primary call-to-action button. */
  button?: BrandedEmailButton;
  /** Optional "Button not working? <link>." line. url defaults to the button's. */
  fallback?: { text: string; url?: string };
  /** Optional fine-print line at the bottom of the card (raw HTML). */
  footnoteHtml?: string;
}

/**
 * The shared branded shell for transactional emails — the same chrome the
 * workspace-invite email uses: an inline logo + wordmark header, a white card
 * with a gradient top bar, an Outlook-safe CTA button table, and the
 * "autonomous GTM engine" footer. Centralised so every email Orion sends
 * (invite, verify, password reset, password changed) looks identical instead
 * of each template hand-rolling its own markup.
 *
 * Email clients can't render SVG and block external images for unknown
 * senders, so the logo ships as an inline cid: attachment — every caller must
 * pass getBrandedEmailAttachments() so the cid: reference resolves.
 */
export function renderBrandedEmail(opts: BrandedEmailOptions): string {
  const logoSrc = `cid:${LOGO_CID}`;

  const preheader = opts.preheader
    ? `<div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all; font-size:1px; line-height:1px; color:#f4f4f5;">${escapeHtml(
        opts.preheader
      )}</div>`
    : "";

  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
          <tr>
            <td align="center" bgcolor="#2C6BED" style="border-radius: 8px;">
              <a href="${escapeHtml(
                opts.button.url
              )}" style="display:inline-block; padding: 13px 28px; color:#ffffff; text-decoration:none; font-weight: 600; font-size: 14px; border-radius: 8px;">
                ${escapeHtml(opts.button.label)}
              </a>
            </td>
          </tr>
        </table>`
    : "";

  const fallbackUrl = opts.fallback?.url ?? opts.button?.url;
  const fallback =
    opts.fallback && fallbackUrl
      ? `<p style="margin: 16px 0 0; color:#71717a; font-size: 13px; line-height: 1.5;">
          Button not working? <a href="${escapeHtml(
            fallbackUrl
          )}" style="color:#2C6BED; font-weight: 600;">${escapeHtml(
          opts.fallback.text
        )}</a>.
        </p>`
      : "";

  const footnote = opts.footnoteHtml
    ? `<p style="margin: 24px 0 0; color:#a1a1aa; font-size: 12px;">
          ${opts.footnoteHtml}
        </p>`
    : "";

  // Brand palette (matches the app's --gradient-shimmer + --color-accent):
  // teal #17C3B2 → blue #2C6BED → orange #FF7A3D, accent blue #2C6BED.
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; padding: 24px; margin: 0;">
  ${preheader}
  <div style="max-width: 560px; margin: 0 auto;">
    <div style="padding: 4px 4px 18px;">
      <img src="${logoSrc}" width="32" height="32" alt="Orion" style="vertical-align: middle; border-radius: 8px; display: inline-block;" />
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.6px; color:#2C6BED; vertical-align: middle; margin-left: 9px;">Orion</span>
    </div>
    <div style="background:#ffffff; border-radius: 14px; border: 1px solid #e4e4e7; overflow: hidden;">
      <div style="height: 4px; background:#2C6BED; background: linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D);">&nbsp;</div>
      <div style="padding: 32px;">
        <h1 style="margin: 0 0 16px; font-size: 20px; color:#18181b;">${escapeHtml(
          opts.heading
        )}</h1>
        ${opts.bodyHtml}
        ${button}
        ${fallback}
        ${footnote}
      </div>
    </div>
    <div style="text-align:center; padding: 16px 0 0; color:#a1a1aa; font-size: 12px;">
      Orion — the autonomous GTM engine
    </div>
  </div>
</body></html>`;
}

/**
 * The inline logo attachment every branded email must include so the cid:
 * reference in the HTML resolves without the recipient enabling external
 * images. Spread into resend.emails.send({ ..., attachments: ... }).
 */
export function getBrandedEmailAttachments(): Array<{
  filename: string;
  content: string;
  contentType: string;
  contentId: string;
}> {
  return [
    {
      filename: "orion-logo.png",
      content: ORION_LOGO_PNG_BASE64,
      contentType: "image/png",
      contentId: LOGO_CID,
    },
  ];
}

/** HTML-escape a value before interpolating it into an email body. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
