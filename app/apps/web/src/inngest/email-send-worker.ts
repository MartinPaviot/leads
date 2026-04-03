import { inngest } from "./client";
import { db } from "@/db";
import {
  outboundEmails,
  connectedMailboxes,
  activities,
} from "@/db/schema";
import { eq, and, sql, inArray } from "drizzle-orm";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

// Fallback from address using Resend test domain
const FALLBACK_FROM = "LeadSens <outbound@resend.dev>";

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

    // Step 2: Mark as "sending" to prevent duplicate processing
    await step.run("mark-sending", async () => {
      const ids = queuedEmails.map((e) => e.id);
      await db
        .update(outboundEmails)
        .set({ status: "sending", updatedAt: new Date() })
        .where(inArray(outboundEmails.id, ids));
    });

    // Step 3: Load mailbox info for sender resolution
    const mailboxMap = await step.run("load-mailboxes", async () => {
      const tenantIds = [...new Set(queuedEmails.map((e) => e.tenantId))];
      const map: Record<
        string,
        { emailAddress: string; displayName: string | null; dailyLimit: number; sentToday: number; status: string | null }
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
          map[`${tid}:${mb.id}`] = {
            emailAddress: mb.emailAddress,
            displayName: mb.displayName,
            dailyLimit: mb.dailyLimit,
            sentToday: mb.sentToday,
            status: mb.status,
          };
        }

        // Also store a default mailbox per tenant (first active one)
        if (mailboxes.length > 0) {
          const best = mailboxes.find((m) => m.sentToday < m.dailyLimit) || mailboxes[0];
          map[`${tid}:default`] = {
            emailAddress: best.emailAddress,
            displayName: best.displayName,
            dailyLimit: best.dailyLimit,
            sentToday: best.sentToday,
            status: best.status,
          };
        }
      }

      return map;
    });

    // Step 4: Send each email
    let sent = 0;
    let failed = 0;

    for (const email of queuedEmails) {
      await step.run(`send-${email.id}`, async () => {
        // Resolve sender address
        let fromAddress = FALLBACK_FROM;
        const mailboxKey = email.mailboxId
          ? `${email.tenantId}:${email.mailboxId}`
          : `${email.tenantId}:default`;
        const mailbox = mailboxMap[mailboxKey];

        if (mailbox) {
          // Check daily limit
          if (mailbox.sentToday >= mailbox.dailyLimit) {
            await db
              .update(outboundEmails)
              .set({
                status: "queued", // Re-queue for next run
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
          // Build unsubscribe URL
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL || "https://app.leadsens.com";
          const unsubUrl = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(email.toAddress)}&tenant=${encodeURIComponent(email.tenantId)}`;

          const { data, error } = await resend.emails.send({
            from: fromAddress,
            to: [email.toAddress],
            subject: email.subject,
            html: email.bodyHtml,
            text: email.bodyText || undefined,
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

    if (!resend) {
      return { emailId, sent: false, reason: "RESEND_API_KEY not configured" };
    }

    const result = await step.run("send", async () => {
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL || "https://app.leadsens.com";
      const unsubUrl = `${appUrl}/api/unsubscribe?email=${encodeURIComponent(email.toAddress)}&tenant=${encodeURIComponent(email.tenantId)}`;

      const { data, error } = await resend.emails.send({
        from: email.fromAddress === "pending@rotation" ? FALLBACK_FROM : email.fromAddress,
        to: [email.toAddress],
        subject: email.subject,
        html: email.bodyHtml,
        text: email.bodyText || undefined,
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

      return { sent: true, messageId: data?.id };
    });

    return { emailId, ...result };
  }
);
