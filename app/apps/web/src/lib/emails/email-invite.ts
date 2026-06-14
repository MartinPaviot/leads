import { Resend } from "resend";
import { EMAIL_FROM, warnIfUnverifiedSender } from "./from";
import { renderBrandedEmail, getBrandedEmailAttachments, escapeHtml } from "./email-shell";

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
  const html = renderBrandedEmail({
    preheader: `${p.inviterName} invited you to join ${p.workspaceName} on Elevay.`,
    heading: `You've been invited to ${p.workspaceName}`,
    bodyHtml: `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
          <strong>${escapeHtml(p.inviterName)}</strong>${p.inviterEmail ? ` (${escapeHtml(p.inviterEmail)})` : ""} invited you to join <strong>${escapeHtml(p.workspaceName)}</strong> on Elevay as <strong>${escapeHtml(p.role)}</strong>.
        </p>`,
    button: { label: "Accept invitation", url: p.acceptUrl },
    fallback: { text: "Accept your invitation here" },
    footnoteHtml: `This invitation expires on ${expiresStr}. If you didn't expect this email, you can ignore it.`,
  });

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
      // Inline logo (cid:) so it renders without the recipient enabling
      // external images — shared with every other branded email.
      attachments: getBrandedEmailAttachments(),
    });
    if (error) return { sent: false, reason: error.message };
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: e instanceof Error ? e.message : "Unknown send error" };
  }
}
