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
import { recipientBlockReason } from "@/lib/emails/recipient-guardrail";
import { evaluateSend, isInteractiveRecipientSendable } from "@/lib/guardrails/sending-gate";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FALLBACK_FROM = process.env.INVITE_FROM_ADDRESS || "Elevay <outbound@resend.dev>";

export interface DeliverInteractiveInput {
  tenantId: string;
  /** The sending user (APP users.id, i.e. authCtx.appUserId). Their connected
   *  mailbox is used as the sender when present. */
  ownerAppUserId: string | null | undefined;
  /** A2: send from THIS specific owned+active mailbox. Re-resolved server-side
   *  with the user/tenant/status filter — a forged/cross-tenant/inactive id is
   *  refused (code "blocked"), never silently swapped. Absent = first-active. */
  mailboxId?: string | null;
  to: string;
  cc?: string[];
  bcc?: string[];
  subject: string;
  /** Plain-text body (the composer + follow-up drafts are plain text). */
  body: string;
  contactId?: string | null;
  dealId?: string | null;
  /** Tag for the activity record, e.g. "composer" | "meeting_follow_up". */
  source?: string;
  /** Attach an iCalendar part (e.g. an RSVP REPLY) — passed to the transport. */
  icsInvite?: { method: "REQUEST" | "PUBLISH" | "CANCEL" | "REPLY"; content: string; filename?: string };
  /** Skip the CAN-SPAM unsubscribe footer/header — for transactional sends
   *  (an RSVP reply to a meeting organizer is not marketing). */
  skipUnsubscribe?: boolean;
}

export type DeliverInteractiveResult =
  | { ok: true; messageId: string; via: "smtp" | "resend"; fromAddress: string }
  | {
      ok: false;
      code: "opted_out" | "blocked" | "plan_limit" | "not_configured" | "send_failed" | "test_mode";
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
  sentToday: number;
}

/** A2: a pinned mailbox id was supplied but no owned+active row matches it. */
type NotOwnedOrInactive = { notOwnedOrInactive: true };

async function resolveOwnerMailbox(
  tenantId: string,
  ownerAppUserId: string | null | undefined,
  mailboxId?: string | null,
): Promise<OwnerMailbox | null | NotOwnedOrInactive> {
  const authUserId = await appToAuthUserId(ownerAppUserId);
  if (!authUserId) return null;
  const conds = [
    eq(connectedMailboxes.tenantId, tenantId),
    eq(connectedMailboxes.status, "active"),
    eq(connectedMailboxes.userId, authUserId),
  ];
  // A2: pin a SPECIFIC box. The ownership+status filter is the whole tenancy
  // guarantee — a forged/cross-tenant/inactive id simply matches no row.
  if (mailboxId) conds.push(eq(connectedMailboxes.id, mailboxId));
  const [mb] = await db
    .select({
      id: connectedMailboxes.id,
      emailAddress: connectedMailboxes.emailAddress,
      displayName: connectedMailboxes.displayName,
      provider: connectedMailboxes.provider,
      smtpHost: connectedMailboxes.smtpHost,
      smtpPort: connectedMailboxes.smtpPort,
      secretEncrypted: connectedMailboxes.secretEncrypted,
      sentToday: connectedMailboxes.sentToday,
    })
    .from(connectedMailboxes)
    .where(and(...conds))
    .limit(1);
  if (!mb) {
    // A pinned id that didn't resolve = not owned / not active (R4.2/R4.3).
    // An absent id with no active box = today's null (FALLBACK_FROM path, R4.5).
    return mailboxId ? { notOwnedOrInactive: true } : null;
  }
  return mb;
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

  // 0. Test-mode guardrail (defense in depth at the chokepoint). In test mode we
  // block COLD recipients (strangers) so a campaign can't blast real prospects —
  // but a WARM recipient (someone the tenant already corresponds with, e.g. the
  // sender you're replying to) is always allowed, so the founder can answer their
  // own inbox. The autonomous worker keeps the strict allowlist. When test mode
  // is OFF, isRecipientAllowed() returns true and this never blocks.
  if (!(await isInteractiveRecipientSendable(tenantId, to))) {
    return { ok: false, code: "test_mode", error: recipientBlockReason(to) };
  }

  // 1. Opt-out suppression — never send to a recipient who unsubscribed.
  const [optout] = await db
    .select({ id: emailOptouts.id })
    .from(emailOptouts)
    .where(and(eq(emailOptouts.tenantId, tenantId), eq(emailOptouts.emailAddress, toLower)))
    .limit(1);
  if (optout) {
    return { ok: false, code: "opted_out", error: `${to} has unsubscribed and can't be emailed.` };
  }

  // 2. Resolve the sender's own mailbox (needed for the sending-identity cap).
  //    A2: when a specific mailboxId is pinned, refuse with a clean "blocked"
  //    BEFORE any transport if it is not an owned+active box (R4.2/R4.3). All the
  //    downstream guardrails below still apply to the resolved box (R4.4).
  const resolved = await resolveOwnerMailbox(tenantId, input.ownerAppUserId, input.mailboxId);
  if (resolved && "notOwnedOrInactive" in resolved) {
    return {
      ok: false,
      code: "blocked",
      error: "That mailbox is not available to send from — it may be disconnected or paused. Pick another.",
    };
  }
  const mailbox = resolved;

  // 2b. CLE-13 (item 1): sending-identity gate. Opt-out is handled above (and
  // re-checked here idempotently); this enforces the cold-on-primary rail and
  // the primary daily cap that were never applied on the interactive path.
  const interactiveGate = await evaluateSend({
    tenantId,
    toAddress: to,
    sentTodayFromPrimary: mailbox?.sentToday ?? 0,
    contactId: input.contactId, // spec 35 — account-scope suppression
    interactive: true, // human-initiated: exempt from the SAFE_MODE targeting gate (D6)
  });
  if (!interactiveGate.send) {
    return interactiveGate.code === "opted_out"
      ? { ok: false, code: "opted_out", error: interactiveGate.reason }
      : { ok: false, code: "blocked", error: interactiveGate.reason };
  }

  // 3. Plan limit (monthly emails).
  const planCheck = await checkPlanLimit(tenantId, "emails");
  if (!planCheck.allowed) {
    return {
      ok: false,
      code: "plan_limit",
      error: `Monthly email limit reached (${planCheck.current}/${planCheck.limit}). Upgrade your plan to send more.`,
    };
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elevay.dev";
  const unsubUrl = buildUnsubscribeUrl(appUrl, tenantId, to);
  const text = input.skipUnsubscribe ? body : withFooter(body, unsubUrl);

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
        {
          to,
          subject,
          text,
          cc: input.cc && input.cc.length > 0 ? input.cc.join(", ") : undefined,
          bcc: input.bcc && input.bcc.length > 0 ? input.bcc.join(", ") : undefined,
          icsInvite: input.icsInvite,
        },
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
        bcc: input.bcc && input.bcc.length > 0 ? input.bcc : undefined,
        subject,
        text,
        attachments: input.icsInvite
          ? [{ filename: input.icsInvite.filename || "reply.ics", content: Buffer.from(input.icsInvite.content) }]
          : undefined,
        headers: input.skipUnsubscribe ? undefined : { "List-Unsubscribe": `<${unsubUrl}>` },
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
