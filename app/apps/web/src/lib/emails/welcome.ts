import { Resend } from "resend";
import { logger } from "@/lib/observability/logger";
import { WELCOME_FROM } from "./from";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * O9 — welcome email after onboarding completion.
 *
 * Resend FROM defaults to the founder personal email so replies land in
 * the founder inbox (higher open + reply rate than `no-reply@`). In dev
 * we fall back to the invite domain so the env doesn't need to be set.
 */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://www.elevay.dev";

export interface SendWelcomeEmailResult {
  sent: boolean;
  reason?: string;
}

export interface WelcomeEmailParams {
  to: string;
  /** Optional first name so the greeting feels human; falls back to "there". */
  firstName?: string | null;
  /** Optional company name to personalise the body. */
  companyName?: string | null;
}

/**
 * Send the welcome email. Never throws — returns `{ sent, reason }` so
 * the caller (the onboarding save route) can log without holding up the
 * completion flow.
 */
export async function sendWelcomeEmail(
  p: WelcomeEmailParams
): Promise<SendWelcomeEmailResult> {
  if (!resend) {
    return { sent: false, reason: "RESEND_API_KEY not configured" };
  }

  const greeting = p.firstName?.trim()
    ? `Hi ${escapeHtml(p.firstName.trim().split(/\s+/)[0])},`
    : "Hi there,";
  const companyLine = p.companyName?.trim()
    ? `Your ${escapeHtml(p.companyName.trim())} workspace is live`
    : "Your Elevay workspace is live";
  const subject = `Welcome to Orion${p.companyName?.trim() ? ` — ${p.companyName.trim()} is set up` : ""}`;

  const links = [
    { href: `${APP_URL}/accounts?sort=score`, label: "Review your top accounts" },
    { href: `${APP_URL}/sequences`, label: "Launch your first sequence" },
    { href: `${APP_URL}/settings/mailboxes`, label: "Connect a sending mailbox" },
    { href: `${APP_URL}/settings/data-model`, label: "Customise your data model" },
    { href: `${APP_URL}/chat`, label: "Ask Orion anything in chat" },
  ];

  const linksHtml = links
    .map(
      (l) =>
        `<li style="margin: 0 0 6px;"><a href="${l.href}" style="color:#6366f1; text-decoration: underline;">${escapeHtml(l.label)}</a></li>`
    )
    .join("");
  const linksText = links.map((l) => `  • ${l.label}: ${l.href}`).join("\n");

  const html = `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background:#f4f4f5; padding: 24px; margin: 0;">
  <div style="max-width: 560px; margin: 0 auto; background:#ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e4e4e7;">
    <h1 style="margin: 0 0 16px; font-size: 20px; color:#18181b;">${companyLine}</h1>
    <p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      ${greeting}
    </p>
    <p style="margin: 0 0 12px; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      Thanks for setting up Elevay. Your TAM, ICP and prospect list are
      built. Here are five things that take 5 minutes each and turn the
      setup into pipeline:
    </p>
    <ol style="padding-left: 20px; color:#3f3f46; font-size: 14px; line-height: 1.7;">
      ${linksHtml}
    </ol>
    <p style="margin: 24px 0 0; color:#3f3f46; font-size: 15px; line-height: 1.6;">
      Reply to this email if anything's confusing — it goes straight to
      me, and I read every one.
    </p>
    <p style="margin: 16px 0 0; color:#3f3f46; font-size: 14px;">
      — Martin, founder of Elevay
    </p>
  </div>
</body></html>`;

  const text = `${companyLine}.

${greeting.replace(/<[^>]+>/g, "")}

Thanks for setting up Elevay. Your TAM, ICP and prospect list are built.
Here are five things that take 5 minutes each and turn the setup into pipeline:

${linksText}

Reply to this email if anything's confusing — it goes straight to me, and I read every one.

— Martin, founder of Elevay`;

  try {
    const { error } = await resend.emails.send({
      from: WELCOME_FROM,
      to: [p.to],
      subject,
      html,
      text,
    });
    if (error) {
      logger.error("welcome email: resend returned error", {
        err: error.message,
      });
      return { sent: false, reason: error.message };
    }
    return { sent: true };
  } catch (e) {
    logger.error("welcome email: send threw", { err: e });
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
