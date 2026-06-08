import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";
import { EMAIL_FROM, warnIfUnverifiedSender } from "./from";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.elevay.dev";

export interface SendVerifyEmailResult {
  sent: boolean;
  reason?: string;
}

/**
 * Send the email-verification link. Never throws — returns `{ sent, reason }`
 * so the caller (sign-up server action / resend endpoint) can log failures
 * without leaking the outcome to the user (which would enable enumeration).
 */
export async function sendVerifyEmail(
  to: string,
  token: string
): Promise<SendVerifyEmailResult> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  warnIfUnverifiedSender();
  const verifyUrl = `${APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  const subject = "Confirm your Elevay email";
  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e4e4e7;">
    <h1 style="margin: 0 0 16px; font-size: 20px; color:#18181b;">Confirm your Elevay email</h1>
    <p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      Welcome aboard. Click the button below to confirm this is your email — the link is valid for 24 hours.
    </p>
    <p style="margin: 24px 0;">
      <a href="${verifyUrl}" style="display:inline-block; background:#6366f1; color:#ffffff; text-decoration:none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px;">
        Confirm email
      </a>
    </p>
    <p style="margin: 16px 0 0; color:#71717a; font-size: 13px; line-height: 1.5;">
      Or paste this link in your browser:<br />
      <span style="color:#6366f1; word-break: break-all;">${verifyUrl}</span>
    </p>
    <p style="margin: 24px 0 0; color:#a1a1aa; font-size: 12px;">
      If you didn't sign up for Elevay, you can safely ignore this email — no account will be created on your behalf.
    </p>
  </div>
</body></html>`;

  const text = `Confirm your Elevay email.

Welcome aboard. Open the link below (valid for 24 hours) to confirm this is your email:

${verifyUrl}

If you didn't sign up for Elevay, you can safely ignore this email.`;

  try {
    const { error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [to],
      subject,
      html,
      text,
    });
    if (error) {
      logger.error("verify-email: resend returned error", {
        err: error.message,
      });
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (e) {
    logger.error("verify-email: send threw", { err: e });
    return {
      sent: false,
      reason: e instanceof Error ? e.message : "Unknown send error",
    };
  }
}
