import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const FROM_ADDRESS =
  process.env.INVITE_FROM_ADDRESS || "Elevay <no-reply@resend.dev>";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.elevay.com";

export interface SendPasswordResetEmailResult {
  sent: boolean;
  reason?: string;
}

/**
 * Send a reset-password link to the user. Never throws — returns
 * `{ sent, reason }` so the caller (the forgot-password route) can log
 * failures without leaking the outcome back to the user (which would
 * enable account enumeration).
 */
export async function sendPasswordResetEmail(
  to: string,
  token: string
): Promise<SendPasswordResetEmailResult> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  const subject = "Reset your Elevay password";
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e4e4e7;">
    <h1 style="margin: 0 0 16px; font-size: 20px; color:#18181b;">Reset your Elevay password</h1>
    <p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      We received a request to reset the password for this account. Click the button below to choose a new one — the link is valid for 1 hour.
    </p>
    <p style="margin: 24px 0;">
      <a href="${resetUrl}" style="display:inline-block; background:#6366f1; color:#ffffff; text-decoration:none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Reset password
      </a>
    </p>
    <p style="margin: 16px 0 0; color:#71717a; font-size: 13px; line-height: 1.5;">
      Or paste this link in your browser:<br />
      <span style="color:#6366f1; word-break: break-all;">${resetUrl}</span>
    </p>
    <p style="margin: 24px 0 0; color:#a1a1aa; font-size: 12px;">
      If you didn't request a password reset you can safely ignore this email — your current password will stay unchanged.
    </p>
  </div>
</body></html>`;

  const text = `Reset your Elevay password.

We received a request to reset the password for this account. Open the link below (valid for 1 hour) to choose a new one:

${resetUrl}

If you didn't request a password reset you can safely ignore this email.`;

  try {
    const { error } = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [to],
      subject,
      html,
      text,
    });
    if (error) {
      logger.error("password-reset email: resend returned error", {
        err: error.message,
      });
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (e) {
    logger.error("password-reset email: send threw", { err: e });
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "Unknown send error",
    };
  }
}
