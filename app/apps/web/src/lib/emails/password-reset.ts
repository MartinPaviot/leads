import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";
import { EMAIL_FROM } from "./from";
import { renderBrandedEmail, getBrandedEmailAttachments } from "./email-shell";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.elevay.dev";

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
  const html = renderBrandedEmail({
    preheader: "Reset your Elevay password — the link is valid for 1 hour.",
    heading: "Reset your Elevay password",
    bodyHtml: `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      We received a request to reset the password for this account. Click the button below to choose a new one — the link is valid for 1 hour.
    </p>`,
    button: { label: "Reset password", url: resetUrl },
    fallback: { text: "reset your password here" },
    footnoteHtml:
      "If you didn't request a password reset you can safely ignore this email — your current password will stay unchanged.",
  });

  const text = `Reset your Elevay password.

We received a request to reset the password for this account. Open the link below (valid for 1 hour) to choose a new one:

${resetUrl}

If you didn't request a password reset you can safely ignore this email.`;

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
