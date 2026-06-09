import { inngest } from "./client";
import { db } from "@/db";
import {
  outboundEmails,
  connectedMailboxes,
  activities,
  emailOptouts,
} from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { Resend } from "resend";
import { buildUnsubscribeUrl } from "@/lib/emails/unsubscribe-token";
import { signTrackingId } from "@/lib/emails/tracking-token";
import { isRecipientAllowed, recipientBlockReason } from "@/lib/emails/recipient-guardrail";
import { checkPlanLimit } from "@/lib/billing/plan-limits";
import { trackUsage } from "@/lib/billing/billing";
import { trackPipeline } from "@/lib/analytics/pipeline-tracker";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Fallback from address using Resend test domain
const FALLBACK_FROM = "Elevay <outbound@resend.dev>";

/**
 * Progressive ramp-up schedule for new mailboxes.
 * Returns the effective daily limit based on mailbox age and health.
 */
function getEffectiveDailyLimit(
  configuredLimit: number,
  warmupStartedAt: Date | null,
  createdAt: Date | null,
  bounceCount7d: number,
): number {
  const startDate = warmupStartedAt || createdAt || new Date();
  const ageDays = Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  // Progressive ramp-up schedule
  let rampLimit: number;
  if (ageDays < 3) rampLimit = 5;
  else if (ageDays < 7) rampLimit = 15;
  else if (ageDays < 14) rampLimit = 30;
  else rampLimit = configuredLimit;

  // Auto-slow if bounce rate is high (>5% of 7d sends assumed at ~50/day)
  if (bounceCount7d > 10) rampLimit = Math.min(rampLimit, 5); // severe: throttle hard
  else if (bounceCount7d > 5) rampLimit = Math.min(rampLimit, Math.floor(rampLimit * 0.5));

  return Math.min(rampLimit, configuredLimit);
}

// ── Email tracking ──

/** Inject a 1x1 tracking pixel before </body> */
function injectTrackingPixel(html: string, signedToken: string, appUrl: string): string {
  // M8: use the signed token instead of raw emailId so `/api/track/open`
  // rejects replayed or guessed ids from unauthenticated callers.
  const pixelUrl = `${appUrl}/api/track/open?t=${encodeURIComponent(signedToken)}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none;width:1px;height:1px;" alt="" />`;

  // Insert before </body> if present, otherwise append
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, `${pixel}</body>`);
  }
  return html + pixel;
}

/** Rewrite links in HTML to go through click tracking redirect */
function rewriteLinks(html: string, signedToken: string, appUrl: string): string {
  // Match href="https://..." links but skip unsubscribe and tracking links
  return html.replace(
    /href="(https?:\/\/[^"]+)"/gi,
    (match, url: string) => {
      // Don't rewrite our own tracking/unsubscribe links
      if (url.includes("/api/track/") || url.includes("/api/unsubscribe")) {
        return match;
      }
      const trackUrl = `${appUrl}/api/track/click?t=${encodeURIComponent(signedToken)}&url=${encodeURIComponent(url)}`;
      return `href="${trackUrl}"`;
    }
  );
}

// CAN-SPAM compliant footer — physical address + unsubscribe link
function buildComplianceFooter(unsubUrl: string, companyName?: string): string {
  const name = companyName || "Elevay";
  return `
<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e4e4e7;font-size:11px;color:#a1a1aa;line-height:1.5;">
  <p style="margin:0;">Sent by ${name} via Elevay</p>
  <p style="margin:4px 0 0;">
    <a href="${unsubUrl}" style="color:#6366f1;text-decoration:underline;">Unsubscribe</a>
    &nbsp;·&nbsp; You received this because you are a business contact.
  </p>
</div>`;
}

/**
 * Cron: process queued outbound emails every 2 minutes.
 * Picks up emails with status=queued, resolves sender mailbox, sends via Resend.
 */
export const processOutboundEmails = inngest.createFunction(
  {
    id: "process-outbound-emails",
    name: "Cron: Send Queued Emails",
    retries: 1,
    onFailure: async ({ error }) => {
      console.error("[DEAD LETTER] process-outbound-emails failed:", error.message);
    },
    triggers: [{ cron: "*/2 * * * *" }],
    concurrency: [{ limit: 1 }], // Only one instance at a time
  },
  async ({ step }) => {
    // Step 1: Fetch queued emails (batch of 20)
    const queuedEmails = await step.run("fetch-queued", async () => {
      return db
        .select()
        .from(outboundEmails)
        .where(eq(outboundEmails.status, "queued"))
        .orderBy(outboundEmails.queuedAt)
        .limit(20);
    });

    if (queuedEmails.length === 0) {
      return { processed: 0, sent: 0, failed: 0 };
    }

    // Step 1b: Skip recipients on the opt-out list. Done BEFORE marking
    // anything as "sending" so we can mark them as failed in one go.
    // Inngest's step.run serializes its return value, so we return an array
    // of "tenantId:email" keys and rebuild the Set here.
    const blockedKeys = await step.run("filter-optouts", async () => {
      const byTenant = new Map<string, Set<string>>();
      for (const e of queuedEmails) {
        if (!byTenant.has(e.tenantId)) byTenant.set(e.tenantId, new Set());
        byTenant.get(e.tenantId)!.add(e.toAddress.toLowerCase());
      }
      const blocked: string[] = [];
      for (const [tid, emails] of byTenant) {
        const rows = await db
          .select({ emailAddress: emailOptouts.emailAddress })
          .from(emailOptouts)
          .where(and(
            eq(emailOptouts.tenantId, tid),
            inArray(emailOptouts.emailAddress, [...emails]),
          ));
        for (const r of rows) blocked.push(`${tid}:${r.emailAddress.toLowerCase()}`);
      }
      const blockedSet = new Set(blocked);
      const blockedIds = queuedEmails
        .filter((e) => blockedSet.has(`${e.tenantId}:${e.toAddress.toLowerCase()}`))
        .map((e) => e.id);
      if (blockedIds.length > 0) {
        await db
          .update(outboundEmails)
          .set({
            status: "failed",
            failedAt: new Date(),
            errorMessage: "Recipient is on the opt-out list",
            updatedAt: new Date(),
          })
          .where(inArray(outboundEmails.id, blockedIds));
      }
      return blocked;
    });

    const optOutSet = new Set<string>(blockedKeys as string[]);
    const sendableEmails = queuedEmails.filter(
      (e) => !optOutSet.has(`${e.tenantId}:${e.toAddress.toLowerCase()}`),
    );

    if (sendableEmails.length === 0) {
      return { processed: queuedEmails.length, sent: 0, failed: queuedEmails.length };
    }

    // Step 2: Mark remaining as "sending" to prevent duplicate processing
    await step.run("mark-sending", async () => {
      const ids = sendableEmails.map((e) => e.id);
      await db
        .update(outboundEmails)
        .set({ status: "sending", updatedAt: new Date() })
        .where(inArray(outboundEmails.id, ids));
    });

    // Step 3: Load mailbox info for sender resolution
    const mailboxMap = await step.run("load-mailboxes", async () => {
      const tenantIds = [...new Set(sendableEmails.map((e) => e.tenantId))];
      const map: Record<
        string,
        { id: string; emailAddress: string; displayName: string | null; dailyLimit: number; sentToday: number; status: string | null; sendWindowStart: string; sendWindowEnd: string; sendDays: string[] }
      > = {};

      for (const tid of tenantIds) {
        const mailboxes = await db
          .select()
          .from(connectedMailboxes)
          .where(
            and(
              eq(connectedMailboxes.tenantId, tid),
              eq(connectedMailboxes.status, "active")
            )
          )
          .limit(5);

        for (const mb of mailboxes) {
          const effectiveLimit = getEffectiveDailyLimit(
            mb.dailyLimit, mb.warmupStartedAt, mb.createdAt, mb.bounceCount7d
          );
          map[`${tid}:${mb.id}`] = {
            id: mb.id,
            emailAddress: mb.emailAddress,
            displayName: mb.displayName,
            dailyLimit: effectiveLimit,
            sentToday: mb.sentToday,
            status: mb.status,
            sendWindowStart: mb.sendWindowStart || "08:00",
            sendWindowEnd: mb.sendWindowEnd || "18:00",
            sendDays: (mb.sendDays as string[]) || ["mon", "tue", "wed", "thu", "fri"],
          };
        }

        // Round-robin: pick mailbox with lowest sentToday ratio (most capacity left)
        if (mailboxes.length > 0) {
          const withLimits = mailboxes.map((m) => ({
            ...m,
            effectiveLimit: getEffectiveDailyLimit(m.dailyLimit, m.warmupStartedAt, m.createdAt, m.bounceCount7d),
          }));
          const eligible = withLimits
            .filter((m) => m.sentToday < m.effectiveLimit)
            .sort((a, b) => (a.sentToday / a.effectiveLimit) - (b.sentToday / b.effectiveLimit));
          const best = eligible[0] || withLimits[0];
          map[`${tid}:default`] = {
            id: best.id,
            emailAddress: best.emailAddress,
            displayName: best.displayName,
            dailyLimit: best.effectiveLimit,
            sentToday: best.sentToday,
            status: best.status,
            sendWindowStart: best.sendWindowStart || "08:00",
            sendWindowEnd: best.sendWindowEnd || "18:00",
            sendDays: (best.sendDays as string[]) || ["mon", "tue", "wed", "thu", "fri"],
          };
        }
      }

      return map;
    });

    // Step 4: Send each email
    let sent = 0;
    let failed = optOutSet.size > 0
      ? queuedEmails.length - sendableEmails.length
      : 0;

    for (const email of sendableEmails) {
      await step.run(`send-${email.id}`, async () => {
        // TEST-MODE GUARDRAIL — never let a campaign reach a real prospect
        // while test mode is on. Fail the row with a clear reason instead of
        // sending. Holds regardless of how the email got queued.
        if (!isRecipientAllowed(email.toAddress)) {
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage: recipientBlockReason(email.toAddress),
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, email.id));
          failed++;
          return;
        }

        // Resolve sender address
        let fromAddress = FALLBACK_FROM;
        const mailboxKey = email.mailboxId
          ? `${email.tenantId}:${email.mailboxId}`
          : `${email.tenantId}:default`;
        const mailbox = mailboxMap[mailboxKey];

        // No connected mailbox → do NOT fall back to the unverified
        // resend.dev test sender. That address lands every message in spam
        // and burns domain reputation, with no signal to the user. Fail the
        // send with an actionable reason so they connect a real mailbox
        // first. This is the universal backstop for every outbound path
        // (sequence launch, auto-pipeline, manual) that funnels here.
        if (!mailbox) {
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage:
                "No connected mailbox — connect one in Settings → Mail & Calendar before sending outbound email.",
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, email.id));
          failed++;
          return;
        }

        {
          // Check send window (day of week + time range)
          const now = new Date();
          const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
          const currentDay = dayNames[now.getUTCDay()];
          const currentTime = `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")}`;

          if (!mailbox.sendDays.includes(currentDay) || currentTime < mailbox.sendWindowStart || currentTime > mailbox.sendWindowEnd) {
            await db
              .update(outboundEmails)
              .set({
                status: "queued",
                errorMessage: "Outside send window, will retry",
                updatedAt: new Date(),
              })
              .where(eq(outboundEmails.id, email.id));
            return;
          }

          // Check daily limit
          if (mailbox.sentToday >= mailbox.dailyLimit) {
            await db
              .update(outboundEmails)
              .set({
                status: "queued",
                errorMessage: "Mailbox daily limit reached, will retry",
                updatedAt: new Date(),
              })
              .where(eq(outboundEmails.id, email.id));
            return;
          }

          fromAddress = mailbox.displayName
            ? `${mailbox.displayName} <${mailbox.emailAddress}>`
            : mailbox.emailAddress;
        }

        // Plan limit enforcement: monthly email cap
        const planCheck = await checkPlanLimit(email.tenantId, "emails");
        if (!planCheck.allowed) {
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage: `Monthly email limit reached (${planCheck.current}/${planCheck.limit}). Upgrade plan to send more.`,
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, email.id));
          failed++;
          return;
        }

        if (!resend) {
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage: "RESEND_API_KEY not configured",
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, email.id));
          failed++;
          return;
        }

        try {
          // Build unsubscribe URL with HMAC token (the unsubscribe route
          // requires a valid token, so unsigned URLs would 403)
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://app.elevay.com";
          const unsubUrl = buildUnsubscribeUrl(appUrl, email.tenantId, email.toAddress);

          // CAN-SPAM: append compliance footer to HTML body
          const footer = buildComplianceFooter(unsubUrl);
          let processedHtml = email.bodyHtml.replace(
            /<\/body>/i,
            `${footer}</body>`
          ) || `${email.bodyHtml}${footer}`;

          // Inject tracking: open pixel + click redirect links. M8 —
          // the URL param is a signed token, not the raw id, so
          // `/api/track/{click,open}` can reject replayed guesses.
          const signedToken = signTrackingId(email.id);
          processedHtml = rewriteLinks(processedHtml, signedToken, appUrl);
          processedHtml = injectTrackingPixel(processedHtml, signedToken, appUrl);

          const textWithFooter = (email.bodyText || "") +
            `\n\n---\nSent via Elevay\nUnsubscribe: ${unsubUrl}`;

          const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: [email.toAddress],
            subject: email.subject,
            html: processedHtml,
            text: textWithFooter,
            headers: {
              "List-Unsubscribe": `<${unsubUrl}>`,
              "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
            },
          });

          if (error) {
            await db
              .update(outboundEmails)
              .set({
                status: "failed",
                failedAt: new Date(),
                errorMessage: error.message,
                updatedAt: new Date(),
              })
              .where(eq(outboundEmails.id, email.id));
            failed++;
            return;
          }

          // Success: update status
          await db
            .update(outboundEmails)
            .set({
              status: "sent",
              sentAt: new Date(),
              messageId: data?.id || null,
              fromAddress,
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, email.id));

          // Track usage for plan limits
          await trackUsage(email.tenantId, "email_sent").catch(() => {});

          await trackPipeline({
            traceId: email.enrollmentId || email.id,
            tenantId: email.tenantId,
            contactId: email.contactId,
            enrollmentId: email.enrollmentId,
            outboundEmailId: email.id,
            stage: "email_sent",
            sourceSystem: "inngest",
            metadata: { messageId: data?.id, via: "resend" },
          });

          // Update mailbox sent count
          if (mailbox && email.mailboxId) {
            await db
              .update(connectedMailboxes)
              .set({
                sentToday: sql`${connectedMailboxes.sentToday} + 1`,
                sentTotal: sql`${connectedMailboxes.sentTotal} + 1`,
                updatedAt: new Date(),
              })
              .where(eq(connectedMailboxes.id, email.mailboxId));
          }

          // Update activity log
          if (email.contactId) {
            await db
              .update(activities)
              .set({
                summary: `Email sent: ${email.subject}`,
                metadata: sql`jsonb_set(COALESCE(metadata, '{}')::jsonb, '{sent}', 'true')`,
              })
              .where(
                and(
                  eq(activities.entityId, email.contactId),
                  eq(activities.entityType, "contact"),
                  sql`metadata->>'outboundEmailId' = ${email.id}`
                )
              );
          }

          // Fire coaching analysis event (non-blocking) so the coaching
          // engine can score this email and provide feedback.
          await inngest.send({
            name: "coaching/pre-send-analysis",
            data: {
              tenantId: email.tenantId,
              emailId: email.id,
              dealId: email.campaignId || undefined,
              contactId: email.contactId || undefined,
            },
          }).catch(() => { /* non-blocking */ });

          sent++;
        } catch (err) {
          const errorMsg =
            err instanceof Error ? err.message : "Unknown send error";
          await db
            .update(outboundEmails)
            .set({
              status: "failed",
              failedAt: new Date(),
              errorMessage: errorMsg,
              updatedAt: new Date(),
            })
            .where(eq(outboundEmails.id, email.id));
          failed++;
        }
      });
    }

    return { processed: queuedEmails.length, sent, failed };
  }
);

/**
 * Event-driven: send a single email immediately (for manual sends / one-off).
 */
export const sendSingleEmail = inngest.createFunction(
  {
    id: "send-single-email",
    name: "Send Single Email",
    retries: 3,
    onFailure: async ({ error, event }) => {
      console.error(
        `[DEAD LETTER] send-single-email failed for ${(event as any).data?.emailId}:`,
        error.message
      );
    },
    triggers: [{ event: "email/send-now" }],
  },
  async ({
    event,
    step,
  }: {
    event: { data: { emailId: string } };
    step: any;
  }) => {
    const { emailId } = event.data;

    const email = await step.run("fetch-email", async () => {
      const [e] = await db
        .select()
        .from(outboundEmails)
        .where(eq(outboundEmails.id, emailId))
        .limit(1);
      return e || null;
    });

    if (!email || (email.status !== "queued" && email.status !== "draft")) {
      return { emailId, sent: false, reason: "Not in sendable state" };
    }

    // Honor opt-outs even on event-driven sends
    const [optout] = await db
      .select({ id: emailOptouts.id })
      .from(emailOptouts)
      .where(and(
        eq(emailOptouts.tenantId, email.tenantId),
        eq(emailOptouts.emailAddress, email.toAddress.toLowerCase()),
      ))
      .limit(1);
    if (optout) {
      await db
        .update(outboundEmails)
        .set({
          status: "failed",
          failedAt: new Date(),
          errorMessage: "Recipient is on the opt-out list",
          updatedAt: new Date(),
        })
        .where(eq(outboundEmails.id, emailId));
      return { emailId, sent: false, reason: "Recipient opted out" };
    }

    // TEST-MODE GUARDRAIL — block real prospects while test mode is on.
    if (!isRecipientAllowed(email.toAddress)) {
      await db
        .update(outboundEmails)
        .set({
          status: "failed",
          failedAt: new Date(),
          errorMessage: recipientBlockReason(email.toAddress),
          updatedAt: new Date(),
        })
        .where(eq(outboundEmails.id, emailId));
      return { emailId, sent: false, reason: "Blocked by test-mode guardrail" };
    }

    if (!resend) {
      return { emailId, sent: false, reason: "RESEND_API_KEY not configured" };
    }

    // Plan limit enforcement: monthly email cap (event-driven sends)
    const planCheck = await checkPlanLimit(email.tenantId, "emails");
    if (!planCheck.allowed) {
      await db
        .update(outboundEmails)
        .set({
          status: "failed",
          failedAt: new Date(),
          errorMessage: `Monthly email limit reached (${planCheck.current}/${planCheck.limit}). Upgrade plan to send more.`,
          updatedAt: new Date(),
        })
        .where(eq(outboundEmails.id, emailId));
      return { emailId, sent: false, reason: "Plan email limit reached" };
    }

    // Resolve a REAL sender. "pending@rotation" means "pick a mailbox at send
    // time"; an empty/resend.dev value means none was ever resolved. Never
    // send real outbound from the unverified resend.dev test sender — fail
    // with an actionable reason so the user connects a mailbox first.
    const senderResolution = await step.run("resolve-sender", async () => {
      let from = email.fromAddress;
      if (!from || from === "pending@rotation" || from.includes("resend.dev")) {
        const [mb] = await db
          .select({
            emailAddress: connectedMailboxes.emailAddress,
            displayName: connectedMailboxes.displayName,
          })
          .from(connectedMailboxes)
          .where(
            and(
              eq(connectedMailboxes.tenantId, email.tenantId),
              eq(connectedMailboxes.status, "active"),
            ),
          )
          .limit(1);
        if (!mb) return { ok: false as const };
        from = mb.displayName ? `${mb.displayName} <${mb.emailAddress}>` : mb.emailAddress;
      }
      return { ok: true as const, from };
    });

    if (!senderResolution.ok) {
      await db
        .update(outboundEmails)
        .set({
          status: "failed",
          failedAt: new Date(),
          errorMessage:
            "No connected mailbox — connect one in Settings → Mail & Calendar before sending outbound email.",
          updatedAt: new Date(),
        })
        .where(eq(outboundEmails.id, emailId));
      return { emailId, sent: false, reason: "No connected mailbox" };
    }

    const result = await step.run("send", async () => {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://app.elevay.com";
      const unsubUrl = buildUnsubscribeUrl(appUrl, email.tenantId, email.toAddress);

      // CAN-SPAM: append compliance footer
      const footer = buildComplianceFooter(unsubUrl);
      let processedHtml = email.bodyHtml.replace(
        /<\/body>/i,
        `${footer}</body>`
      ) || `${email.bodyHtml}${footer}`;

      // Inject tracking: open pixel + click redirect links (M8 signed).
      const signedToken = signTrackingId(emailId);
      processedHtml = rewriteLinks(processedHtml, signedToken, appUrl);
      processedHtml = injectTrackingPixel(processedHtml, signedToken, appUrl);

      const textWithFooter = (email.bodyText || "") +
        `\n\n---\nSent via Elevay\nUnsubscribe: ${unsubUrl}`;

      const { data, error } = await resend.emails.send({
        from: senderResolution.from,
        to: [email.toAddress],
        subject: email.subject,
        html: processedHtml,
        text: textWithFooter,
        headers: {
          "List-Unsubscribe": `<${unsubUrl}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      });

      if (error) {
        await db
          .update(outboundEmails)
          .set({
            status: "failed",
            failedAt: new Date(),
            errorMessage: error.message,
            updatedAt: new Date(),
          })
          .where(eq(outboundEmails.id, emailId));
        return { sent: false, error: error.message };
      }

      await db
        .update(outboundEmails)
        .set({
          status: "sent",
          sentAt: new Date(),
          messageId: data?.id || null,
          updatedAt: new Date(),
        })
        .where(eq(outboundEmails.id, emailId));

      // Track usage for plan limits
      await trackUsage(email.tenantId, "email_sent").catch(() => {});

      return { sent: true, messageId: data?.id };
    });

    return { emailId, ...result };
  }
);

/**
 * Daily reset cron — runs at midnight UTC.
 * Resets sentToday counter on all mailboxes.
 * Transitions warming_up → active for mailboxes that completed ramp-up (14+ days).
 * Decays 7-day bounce/reply counters.
 */
export const cronDailyMailboxReset = inngest.createFunction(
  {
    id: "cron-daily-mailbox-reset",
    name: "Daily Mailbox Counter Reset",
    triggers: [{ cron: "0 0 * * *" }], // midnight UTC
  },
  async ({ step }) => {
    const result = await step.run("reset-counters", async () => {
      // Reset sentToday for all mailboxes
      await db
        .update(connectedMailboxes)
        .set({ sentToday: 0, updatedAt: new Date() });

      // Decay 7d counters (reduce by ~1/7 daily to approximate rolling window)
      await db
        .update(connectedMailboxes)
        .set({
          bounceCount7d: sql`GREATEST(${connectedMailboxes.bounceCount7d} - 1, 0)`,
          replyCount7d: sql`GREATEST(${connectedMailboxes.replyCount7d} - 1, 0)`,
        });

      // Auto-transition warming_up → active for mailboxes aged 14+ days
      const warmingMailboxes = await db
        .select()
        .from(connectedMailboxes)
        .where(eq(connectedMailboxes.status, "warming_up"));

      let transitioned = 0;
      const now = Date.now();
      for (const mb of warmingMailboxes) {
        const startDate = mb.warmupStartedAt || mb.createdAt;
        if (!startDate) continue;
        const ageDays = Math.floor((now - startDate.getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays >= 14 && mb.bounceCount7d <= 3) {
          await db
            .update(connectedMailboxes)
            .set({
              status: "active",
              warmupCompletedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(connectedMailboxes.id, mb.id));
          transitioned++;
        }
      }

      return { reset: true, transitioned };
    });

    return result;
  }
);
