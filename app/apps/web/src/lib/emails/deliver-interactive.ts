/**
 * Owner-aware delivery for INTERACTIVE sends (the composer, a chat-drafted
 * meeting follow-up) — the human-in-the-loop counterpart to the queue
 * crons (processOutboundEmails / dispatchOutboundSmtp).
 *
 * Why this exists: the interactive paths used to call `resend.emails.send`
 * inline, which (a) picked the tenant's FIRST mailbox, not the sender's,
 * (b) skipped the opt-out suppression list, (c) skipped the CAN-SPAM
 * unsubscribe footer, and (d) for any connected mailbox, sent via Resend
 * (spoofing the user's domain) instead of their own account.
 *
 * Transport, in order — the owner's REAL account first, Resend as the floor:
 *   - provider "smtp_custom"           → the owner's own SMTP
 *   - Google grant w/ gmail.send scope → the owner's Gmail (API)
 *   - Microsoft grant w/ Mail.Send     → the owner's Outlook (Graph)
 *   - otherwise                        → Resend, From the owner's address
 *
 * The OAuth paths are SCOPE-GATED on the stored grant (auth_account.scope),
 * so users who connected before send scopes were requested keep sending via
 * Resend — no failed sends — until they reconnect. An OAuth send that fails
 * on a stale/insufficient token flags needs_reauth (surfacing the existing
 * "Reconnect" CTA) and falls back to Resend so the message still goes out.
 */

import { db } from "@/db";
import {
  activities,
  authAccounts,
  authUsers,
  connectedMailboxes,
  emailOptouts,
  outboundEmails,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { Resend } from "resend";
import { appToAuthUserId } from "@/lib/auth/user-id";
import { decryptSecret } from "@/lib/crypto/settings-encryption";
import { sendViaSmtp } from "@/lib/integrations/smtp-send";
import { sendViaGmail } from "@/lib/integrations/gmail";
import { sendViaGraph } from "@/lib/integrations/outlook";
import { buildUnsubscribeUrl } from "@/lib/emails/unsubscribe-token";
import { shouldUseOwnerSmtp } from "@/lib/emails/owner-smtp-decision";
import { scopeAllowsGoogleSend, scopeAllowsMicrosoftSend } from "@/lib/emails/oauth-send-scope";
import { markNeedsReauth } from "@/lib/integrations/sync-health";
import { checkPlanLimit } from "@/lib/billing/plan-limits";
import { trackUsage } from "@/lib/billing/billing";
import { logger } from "@/lib/observability/logger";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FALLBACK_FROM = process.env.INVITE_FROM_ADDRESS || "Elevay <outbound@resend.dev>";

export type SendTransport = "smtp" | "gmail" | "graph" | "resend";

export interface DeliverInteractiveInput {
  tenantId: string;
  /** The sending user (APP users.id, i.e. authCtx.appUserId). Their connected
   *  mailbox / OAuth grant is used as the sender when present. */
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
  | { ok: true; messageId: string; via: SendTransport; fromAddress: string }
  | {
      ok: false;
      code: "opted_out" | "plan_limit" | "not_configured" | "send_failed";
      error: string;
    };

interface OwnerMailbox {
  emailAddress: string;
  displayName: string | null;
  provider: string;
  smtpHost: string | null;
  smtpPort: number | null;
  secretEncrypted: string | null;
  id: string;
}

/** The owner's active connected mailbox (smtp creds + from-address), if any. */
async function loadOwnerMailbox(tenantId: string, authUserId: string): Promise<OwnerMailbox | null> {
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

/** The owner's OAuth grant that's allowed to SEND, if any (scope-gated). */
async function loadOwnerOAuthSend(
  authUserId: string,
): Promise<{ provider: "google" | "microsoft-entra-id" } | null> {
  const accounts = await db
    .select({ provider: authAccounts.provider, scope: authAccounts.scope })
    .from(authAccounts)
    .where(eq(authAccounts.userId, authUserId));
  for (const a of accounts) {
    if (a.provider === "google" && scopeAllowsGoogleSend(a.scope)) return { provider: "google" };
    if (a.provider === "microsoft-entra-id" && scopeAllowsMicrosoftSend(a.scope))
      return { provider: "microsoft-entra-id" };
  }
  return null;
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

  // 3. Resolve the sender identity: their auth-user id (bridges the
  //    connected-mailbox + OAuth-account owner space), connected mailbox,
  //    and OAuth send grant.
  const authUserId = await appToAuthUserId(input.ownerAppUserId);
  const mailbox = authUserId ? await loadOwnerMailbox(tenantId, authUserId) : null;
  const oauth = authUserId ? await loadOwnerOAuthSend(authUserId) : null;

  // From-address (for Resend + the outbound record). For Gmail/Graph the API
  // sends AS the authenticated user, so this is only the recorded sender.
  let ownerEmail: string | null = mailbox?.emailAddress ?? null;
  if (!ownerEmail && oauth && authUserId) {
    const [u] = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, authUserId)).limit(1);
    ownerEmail = u?.email ?? null;
  }
  const fromAddress = mailbox?.emailAddress
    ? mailbox.displayName
      ? `${mailbox.displayName} <${mailbox.emailAddress}>`
      : mailbox.emailAddress
    : ownerEmail || FALLBACK_FROM;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.elevay.dev";
  const unsubUrl = buildUnsubscribeUrl(appUrl, tenantId, to);
  const text = withFooter(body, unsubUrl);

  // Resend send — the floor, used directly and as the OAuth fallback.
  async function sendViaResendNow(): Promise<
    { ok: true; messageId: string } | { ok: false; code: "not_configured" | "send_failed"; error: string }
  > {
    if (!resend) return { ok: false, code: "not_configured", error: "Email sending is not configured." };
    const { data, error } = await resend.emails.send({
      from: fromAddress,
      to: [to],
      cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
      subject,
      text,
      headers: { "List-Unsubscribe": `<${unsubUrl}>` },
    });
    if (error) return { ok: false, code: "send_failed", error: error.message };
    return { ok: true, messageId: data?.id || crypto.randomUUID() };
  }

  // 4. Send via the right transport (owner's real account first).
  let messageId: string;
  let via: SendTransport;
  try {
    if (shouldUseOwnerSmtp(mailbox) && mailbox) {
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
    } else if (oauth && authUserId) {
      try {
        const r =
          oauth.provider === "google"
            ? await sendViaGmail(authUserId, { to, cc: input.cc, subject, text })
            : await sendViaGraph(authUserId, { to, cc: input.cc, subject, text });
        messageId = r.messageId;
        via = oauth.provider === "google" ? "gmail" : "graph";
      } catch (err) {
        // Stale/insufficient token — flag for reconnect, then fall back to
        // Resend so the message still goes out.
        const msg = err instanceof Error ? err.message : String(err);
        await markNeedsReauth(tenantId, authUserId, oauth.provider, msg).catch(() => {});
        logger.warn?.("deliver-interactive: OAuth send failed, falling back to Resend", {
          provider: oauth.provider,
          err: msg,
        });
        const fb = await sendViaResendNow();
        if (!fb.ok) return fb;
        messageId = fb.messageId;
        via = "resend";
      }
    } else {
      const r = await sendViaResendNow();
      if (!r.ok) return r;
      messageId = r.messageId;
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
