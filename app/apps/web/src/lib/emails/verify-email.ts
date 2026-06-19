import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";
import { EMAIL_FROM, warnIfUnverifiedSender } from "./from";
import { renderBrandedEmail, getBrandedEmailAttachments } from "./email-shell";

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
  const html = renderBrandedEmail({
    preheader: "Confirm your email to finish setting up Elevay — the link is valid for 24 hours.",
    heading: "Confirm your Elevay email",
    bodyHtml: `<p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      Welcome aboard. Click the button below to confirm this is your email — the link is valid for 24 hours.
    </p>`,
    button: { label: "Confirm email", url: verifyUrl },
    fallback: { text: "confirm your email here" },
    footnoteHtml:
      "If you didn't sign up for Elevay, you can safely ignore this email — no account will be created on your behalf.",
  });

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
      attachments: getBrandedEmailAttachments(),
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
