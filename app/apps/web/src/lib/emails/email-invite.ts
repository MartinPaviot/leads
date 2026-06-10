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
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e4e4e7;">
    <h1 style="margin: 0 0 16px; font-size: 20px; color:#18181b;">You've been invited to ${escapeHtml(p.workspaceName)}</h1>
    <p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      <strong>${escapeHtml(p.inviterName)}</strong>${p.inviterEmail ? ` (${escapeHtml(p.inviterEmail)})` : ""} invited you to join <strong>${escapeHtml(p.workspaceName)}</strong> on Elevay as <strong>${p.role}</strong>.
    </p>
    <p style="margin: 24px 0;">
      <a href="${p.acceptUrl}" style="display:inline-block; background:#6366f1; color:#ffffff; text-decoration:none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Accept invitation
      </a>
    </p>
    <p style="margin: 16px 0 0; color:#71717a; font-size: 13px; line-height: 1.5;">
      Or paste this link in your browser:<br />
      <span style="color:#6366f1; word-break: break-all;">${p.acceptUrl}</span>
    </p>
    <p style="margin: 24px 0 0; color:#a1a1aa; font-size: 12px;">
      This invitation expires on ${expiresStr}. If you didn't expect this email, you can ignore it.
    </p>
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
