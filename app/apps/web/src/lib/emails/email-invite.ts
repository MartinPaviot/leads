import { Resend } from "resend";
import { EMAIL_FROM, warnIfUnverifiedSender } from "./from";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface InviteEmailParams {
  to: string;
  workspaceName: string;
  inviterName: string;
  inviterEmail?: string;
  role: "admin" | "member" | "viewer";
  acceptUrl: string;
  expiresAt: Date;
}

/**
 * Send a workspace invitation email via Resend.
 * Returns { sent: true } on success, { sent: false, reason } on failure.
 * Never throws — caller decides whether to surface the failure.
 */
export async function sendInviteEmail(p: InviteEmailParams): Promise<{ sent: boolean; reason?: string }> {
  if (!resend) return { sent: false, reason: "RESEND_API_KEY not configured" };
  warnIfUnverifiedSender();

  const subject = `${p.inviterName} invited you to join ${p.workspaceName} on Elevay`;
  const expiresStr = p.expiresAt.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const safeUrl = escapeHtml(p.acceptUrl);
  // Absolute logo URL on the same origin as the accept link (canonical
  // https://www.elevay.dev in prod). Email clients block SVG <img>, so we
  // ship a raster logo-Elevay.png in /public for this.
  let logoUrl = "https://www.elevay.dev/logo-Elevay.png";
  try {
    logoUrl = `${new URL(p.acceptUrl).origin}/logo-Elevay.png`;
  } catch {
    /* keep the canonical default */
  }
  // Brand palette (matches the app's --gradient-shimmer + --color-accent):
  // teal #17C3B2 → blue #2C6BED → orange #FF7A3D, accent blue #2C6BED.
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto;">
    <div style="padding: 4px 4px 18px;">
      <img src="${logoUrl}" width="32" height="32" alt="Elevay" style="vertical-align: middle; border-radius: 8px; display: inline-block;" />
      <span style="font-size: 20px; font-weight: 800; letter-spacing: -0.6px; color:#2C6BED; vertical-align: middle; margin-left: 9px;">Elevay</span>
    </div>
    <div style="background:#ffffff; border-radius: 14px; border: 1px solid #e4e4e7; overflow: hidden;">
      <div style="height: 4px; background:#2C6BED; background: linear-gradient(90deg, #17C3B2, #2C6BED, #FF7A3D);">&nbsp;</div>
      <div style="padding: 32px;">
        <h1 style="margin: 0 0 16px; font-size: 20px; color:#18181b;">You've been invited to ${escapeHtml(p.workspaceName)}</h1>
        <p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
          <strong>${escapeHtml(p.inviterName)}</strong>${p.inviterEmail ? ` (${escapeHtml(p.inviterEmail)})` : ""} invited you to join <strong>${escapeHtml(p.workspaceName)}</strong> on Elevay as <strong>${escapeHtml(p.role)}</strong>.
        </p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
          <tr>
            <td align="center" bgcolor="#2C6BED" style="border-radius: 8px;">
              <a href="${safeUrl}" style="display:inline-block; padding: 13px 28px; color:#ffffff; text-decoration:none; font-weight: 600; font-size: 14px; border-radius: 8px;">
                Accept invitation
              </a>
            </td>
          </tr>
        </table>
        <p style="margin: 16px 0 0; color:#71717a; font-size: 13px; line-height: 1.5;">
          Button not working? <a href="${safeUrl}" style="color:#2C6BED; font-weight: 600;">Accept your invitation here</a>.
        </p>
        <p style="margin: 24px 0 0; color:#a1a1aa; font-size: 12px;">
          This invitation expires on ${expiresStr}. If you didn't expect this email, you can ignore it.
        </p>
      </div>
    </div>
    <div style="text-align:center; padding: 16px 0 0; color:#a1a1aa; font-size: 12px;">
      Elevay — the autonomous GTM engine
    </div>
  </div>
</body></html>`;

  const text = `${p.inviterName} invited you to join ${p.workspaceName} on Elevay as ${p.role}.

Accept the invitation: ${p.acceptUrl}

This invitation expires on ${expiresStr}.`;

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [p.to],
      subject,
      html,
      text,
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Unknown send error" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
