import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS =
  process.env.INVITE_FROM_ADDRESS || "Elevay <no-reply@resend.dev>";

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

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e4e4e7;">
    <h1 style="margin: 0 0 16px; font-size: 20px; color:#18181b;">Your password has been changed</h1>
    <p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      Your Elevay account password was just reset. ${ipLine}
    </p>
    <p style="margin: 16px 0 0; color:#71717a; font-size: 13px; line-height: 1.6;">
      If this wasn't you, reply to this email immediately so we can lock the account — an attacker may have access to your inbox.
    </p>
  </div>
</body></html>`;

  const text = `Your Elevay password has been changed.

If this wasn't you, reply to this email immediately so we can lock the account.`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
      text,
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
