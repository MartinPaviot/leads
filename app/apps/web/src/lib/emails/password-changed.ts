import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";
import { EMAIL_FROM } from "./from";
import { renderBrandedEmail, getBrandedEmailAttachments, escapeHtml } from "./email-shell";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export interface SendPasswordChangedEmailResult {
  sent: boolean;
  reason?: string;
}

/**
 * Notify a user that their password was successfully reset. Best-effort —
 * we never block the reset on the email succeeding, but we DO log
 * failures so security-sensitive drops can be audited later.
 */
export async function sendPasswordChangedEmail(
  to: string,
  ip?: string | null
): Promise<SendPasswordChangedEmailResult> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const subject = "Your Elevay password was changed";
  const ipLine = ip
    ? `This reset was requested from IP <strong>${escapeHtml(ip)}</strong>.`
    : `This reset was requested from your browser session.`;

  const html = renderBrandedEmail({
    preheader: "Your Elevay account password was just changed.",
    heading: "Your password has been changed",
    bodyHtml: `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      Your Elevay account password was just reset. ${ipLine}
    </p>
    <p style="margin: 16px 0 0; color:#71717a; font-size: 13px; line-height: 1.6;">
      If this wasn't you, reply to this email immediately so we can lock the account — an attacker may have access to your inbox.
    </p>`,
  });

  const text = `Your Elevay password has been changed.

If this wasn't you, reply to this email immediately so we can lock the account.`;

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
      text,
      attachments: getBrandedEmailAttachments(),
    });
    if (error) {
      logger.error("password-changed email: resend returned error", {
        err: error.message,
      });
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (e) {
    logger.error("password-changed email: send threw", { err: e });
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "Unknown send error",
    };
  }
}
