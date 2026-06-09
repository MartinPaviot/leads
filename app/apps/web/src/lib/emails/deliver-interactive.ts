/**
 * Owner-aware delivery for INTERACTIVE sends (the composer, a chat-drafted
 * meeting follow-up) — the human-in-the-loop counterpart to the queue
 * crons (processOutboundEmails / dispatchOutboundSmtp).
 *
 * Why this exists: the interactive paths used to call `resend.emails.send`
 * inline, which (a) picked the tenant's FIRST mailbox, not the sender's,
 * (b) skipped the opt-out suppression list, (c) skipped the CAN-SPAM
 * unsubscribe footer, and (d) for an `smtp_custom` owner, sent via Resend
 * (spoofing their domain) instead of their own SMTP. This converges them
 * onto the owner's real mailbox:
 *   - provider "smtp_custom"  → send via the owner's own SMTP (real transport)
 *   - otherwise (OAuth read-only mailbox, or none) → Resend with the owner's
 *     address as From, falling back to the neutral system sender.
 *
 * Gmail/Microsoft API send is intentionally NOT here: those OAuth grants are
 * read-only (gmail.readonly / Mail.Read), so real API send needs added send
 * scopes + user re-consent — a separate product decision.
 */

import { db } from "@/db";
import {
  activities,
  connectedMailboxes,
  emailOptouts,
  outboundEmails,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Resend } from "resend";
import { appToAuthUserId } from "@/lib/auth/user-id";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { sendViaSmtp } from "@/lib/integrations/smtp-send";
import { buildUnsubscribeUrl } from "@/lib/emails/unsubscribe-token";
import { shouldUseOwnerSmtp } from "@/lib/emails/owner-smtp-decision";
import { checkPlanLimit } from "@/lib/billing/plan-limits";
import { trackUsage } from "@/lib/billing/billing";
import { logger } from "@/lib/observability/logger";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FALLBACK_FROM = process.env.INVITE_FROM_ADDRESS || "Elevay <outbound@resend.dev>";

export interface DeliverInteractiveInput {
  tenantId: string;
  /** The sending user (APP users.id, i.e. authCtx.appUserId). Their connected
   *  mailbox is used as the sender when present. */
  ownerAppUserId: string | null | undefined;
  to: string;
  cc?: string[];
  subject: string;
  /** Plain-text body (the composer + follow-up drafts are plain text). */
  body: string;
  contactId?: string | null;
  dealId?: string | null;
  /** Tag for the activity record, e.g. "composer" | "meeting_follow_up". */
  source?: string;
}

export type DeliverInteractiveResult =
  | { ok: true; messageId: string; via: "smtp" | "resend"; fromAddress: string }
  | {
      ok: false;
      code: "opted_out" | "plan_limit" | "not_configured" | "send_failed";
      error: string;
    };

interface OwnerMailbox {
  id: string;
  emailAddress: string;
  displayName: string | null;
  provider: string;
  smtpHost: string | null;
  smtpPort: number | null;
  secretEncrypted: string | null;
}

async function resolveOwnerMailbox(
  tenantId: string,
  ownerAppUserId: string | null | undefined,
): Promise<OwnerMailbox | null> {
  const authUserId = await appToAuthUserId(ownerAppUserId);
  if (!authUserId) return null;
  const [mb] = await db
    .select({
      id: connectedMailboxes.id,
      emailAddress: connectedMailboxes.emailAddress,
      displayName: connectedMailboxes.displayName,
      provider: connectedMailboxes.provider,
      smtpHost: connectedMailboxes.smtpHost,
      smtpPort: connectedMailboxes.smtpPort,
      secretEncrypted: connectedMailboxes.secretEncrypted,
    })
    .from(connectedMailboxes)
    .where(
      and(
        eq(connectedMailboxes.tenantId, tenantId),
        eq(connectedMailboxes.status, "active"),
        eq(connectedMailboxes.userId, authUserId),
      ),
    )
    .limit(1);
  return mb ?? null;
}

/** Append the CAN-SPAM unsubscribe footer (plain text) to a body. */
function withFooter(body: string, unsubUrl: string): string {
  return `${body}\n\n---\nSent via Elevay\nUnsubscribe: ${unsubUrl}`;
}

/**
 * Send one interactive email as the owner. Honours opt-outs + plan limits,
 * appends the unsubscribe footer, records the outbound email + activity.
 */
export async function deliverInteractiveEmail(
  input: DeliverInteractiveInput,
): Promise<DeliverInteractiveResult> {
  const { tenantId, to, subject, body } = input;
  const toLower = to.toLowerCase().trim();

  // 1. Opt-out suppression — never send to a recipient who unsubscribed.
  const [optout] = await db
    .select({ id: emailOptouts.id })
    .from(emailOptouts)
    .where(and(eq(emailOptouts.tenantId, tenantId), eq(emailOptouts.emailAddress, toLower)))
    .limit(1);
  if (optout) {
    return { ok: false, code: "opted_out", error: `${to} has unsubscribed and can't be emailed.` };
  }

  // 2. Plan limit (monthly emails).
  const planCheck = await checkPlanLimit(tenantId, "emails");
  if (!planCheck.allowed) {
    return {
      ok: false,
      code: "plan_limit",
      error: `Monthly email limit reached (${planCheck.current}/${planCheck.limit}). Upgrade your plan to send more.`,
    };
  }

  // 3. Resolve the sender's own mailbox.
  const mailbox = await resolveOwnerMailbox(tenantId, input.ownerAppUserId);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elevay.dev";
  const unsubUrl = buildUnsubscribeUrl(appUrl, tenantId, to);
  const text = withFooter(body, unsubUrl);

  const useSmtp = shouldUseOwnerSmtp(mailbox);
  const fromAddress =
    mailbox && mailbox.emailAddress
      ? mailbox.displayName
        ? `${mailbox.displayName} <${mailbox.emailAddress}>`
        : mailbox.emailAddress
      : FALLBACK_FROM;

  // 4. Send via the right transport.
  let messageId: string;
  let via: "smtp" | "resend";
  try {
    if (useSmtp && mailbox) {
      const password = decryptSecret(mailbox.secretEncrypted!);
      const res = await sendViaSmtp(
        {
          emailAddress: mailbox.emailAddress,
          smtpHost: mailbox.smtpHost!,
          smtpPort: mailbox.smtpPort,
          password,
          displayName: mailbox.displayName,
        },
        { to, subject, text, cc: input.cc && input.cc.length > 0 ? input.cc.join(", ") : undefined },
      );
      messageId = res.messageId;
      via = "smtp";
    } else {
      if (!resend) {
        return { ok: false, code: "not_configured", error: "Email sending is not configured." };
      }
      const { data, error } = await resend.emails.send({
        from: fromAddress,
        to: [to],
        cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
        subject,
        text,
        headers: { "List-Unsubscribe": `<${unsubUrl}>` },
      });
      if (error) return { ok: false, code: "send_failed", error: error.message };
      messageId = data?.id || crypto.randomUUID();
      via = "resend";
    }
  } catch (err) {
    return {
      ok: false,
      code: "send_failed",
      error: err instanceof Error ? err.message : "Failed to send email.",
    };
  }

  // 5. Record outbound + activity + usage (best-effort, never fails the send).
  await trackUsage(tenantId, "email_sent").catch(() => {});
  try {
    await db.insert(outboundEmails).values({
      tenantId,
      contactId: input.contactId || null,
      campaignId: input.dealId || null,
      mailboxId: mailbox?.id || null,
      fromAddress,
      toAddress: to,
      subject,
      bodyHtml: body,
      bodyText: body,
      messageId,
      status: "sent",
      sentAt: new Date(),
    });
  } catch (err) {
    logger.warn?.("deliver-interactive: outbound record failed (non-fatal)", { err });
  }
  if (input.contactId) {
    try {
      await db.insert(activities).values({
        tenantId,
        actorType: "user",
        entityType: "contact",
        entityId: input.contactId,
        activityType: "email_sent",
        channel: "email",
        direction: "outbound",
        summary: `Email sent: ${subject}`,
        metadata: {
          messageId,
          to,
          subject,
          via,
          source: input.source || "interactive",
          ...(input.dealId ? { dealId: input.dealId } : {}),
        },
      });
    } catch (err) {
      logger.warn?.("deliver-interactive: activity record failed (non-fatal)", { err });
    }
  }

  return { ok: true, messageId, via, fromAddress };
}
