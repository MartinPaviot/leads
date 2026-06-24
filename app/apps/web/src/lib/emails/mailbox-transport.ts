/**
 * Shared outbound transport for the QUEUE/autonomous path (cron send worker).
 *
 * The interactive composer (deliver-interactive.ts) already sends via the
 * owner's real SMTP for `smtp_custom` mailboxes — so a manual send rides the
 * founder's own domain. The cron worker, however, was Resend-ONLY: an
 * smtp_custom (OVH/Gandi/…) founder's AUTONOMOUS sends never went through their
 * mailbox, and would fail or fall back to a generic sender unless their domain
 * was verified in Resend. This converges the worker onto the SAME rule:
 *   - provider "smtp_custom" with stored creds → the owner's own SMTP,
 *   - otherwise (OAuth read-only mailbox)       → Resend with the owner's From.
 */

import { Resend } from "resend";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { sendViaSmtp } from "@/lib/integrations/smtp-send";
import { shouldUseOwnerSmtp } from "@/lib/emails/owner-smtp-decision";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export interface TransportMailbox {
  emailAddress: string;
  displayName: string | null;
  provider: string;
  smtpHost: string | null;
  smtpPort: number | null;
  secretEncrypted: string | null;
}

export interface OutboundPayload {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

export type TransportResult =
  | { ok: true; messageId: string; via: "smtp" | "resend" }
  | { ok: false; error: string };

/** Send one already-composed outbound (footer/tracking applied by the caller). */
export async function sendViaMailbox(
  mailbox: TransportMailbox,
  payload: OutboundPayload,
): Promise<TransportResult> {
  const from = mailbox.displayName
    ? `${mailbox.displayName} <${mailbox.emailAddress}>`
    : mailbox.emailAddress;
  try {
    if (shouldUseOwnerSmtp(mailbox) && mailbox.secretEncrypted) {
      const password = decryptSecret(mailbox.secretEncrypted);
      const res = await sendViaSmtp(
        {
          emailAddress: mailbox.emailAddress,
          smtpHost: mailbox.smtpHost!,
          smtpPort: mailbox.smtpPort ?? null,
          password,
          displayName: mailbox.displayName,
        },
        {
          to: payload.to,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          headers: payload.headers,
        },
      );
      return { ok: true, messageId: res.messageId, via: "smtp" };
    }

    if (!resend) {
      return { ok: false, error: "Email sending is not configured (no owner SMTP, no Resend)." };
    }
    const { data, error } = await resend.emails.send({
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      headers: payload.headers,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true, messageId: data?.id || crypto.randomUUID(), via: "resend" };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}
