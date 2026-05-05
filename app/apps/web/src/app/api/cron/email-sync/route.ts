import { db } from "@/db";
import { connectedMailboxes, users, activities, contacts, companies } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { fetchRecentEmails } from "@/lib/integrations/gmail";
import { embedEntity } from "@/lib/ai/embeddings";
import { ingestEpisode } from "@/lib/ai/context-graph";
import { verifyCronRequest } from "@/lib/auth/cron-auth";

/**
 * Cron endpoint: sync emails for all active mailboxes.
 * Call via Vercel Cron or external scheduler every 5-15 minutes.
 * Protected by CRON_SECRET header — fail-closed in every environment.
 */
export async function GET(req: Request) {
  const unauthorized = verifyCronRequest(req);
  if (unauthorized) return unauthorized;

  try {
    // Get all active mailboxes with their tenant's user
    const mailboxes = await db.select({
      id: connectedMailboxes.id,
      tenantId: connectedMailboxes.tenantId,
      emailAddress: connectedMailboxes.emailAddress,
    }).from(connectedMailboxes)
      .where(eq(connectedMailboxes.status, "active"));

    const results = [];
    for (const mailbox of mailboxes) {
      try {
        // Find a user in this tenant to use for Gmail auth
        const [user] = await db.select({ id: users.id, email: users.email, clerkId: users.clerkId })
          .from(users)
          .where(eq(users.tenantId, mailbox.tenantId))
          .limit(1);

        if (!user?.clerkId) {
          results.push({ mailbox: mailbox.emailAddress, skipped: true, reason: "No user found" });
          continue;
        }

        // Sync emails for this user directly
        const emails = await fetchRecentEmails(user.clerkId, mailbox.emailAddress, 7);
        let created = 0;
        for (const email of emails) {
          // Basic dedup check
          const existing = await db.select({ id: activities.id }).from(activities)
            .where(and(
              eq(activities.tenantId, mailbox.tenantId),
              eq(activities.channel, "email"),
              eq(activities.summary, email.subject),
            ))
            .limit(1);
          if (existing.length > 0) continue;

          await db.insert(activities).values({
            tenantId: mailbox.tenantId,
            actorType: email.direction === "inbound" ? "contact" : "user",
            actorId: user.id,
            entityType: "company",
            entityId: "unknown",
            activityType: email.direction === "inbound" ? "email_received" : "email_sent",
            channel: "email",
            direction: email.direction,
            occurredAt: email.date,
            summary: email.subject,
            metadata: {
              gmailMessageId: email.gmailMessageId,
              threadId: email.threadId,
              from: email.from,
              to: email.to,
              body: email.body,
            },
          });
          // Ingest into context graph (async, non-blocking)
          if (email.body) {
            const graphContent = `Email from ${email.from} to ${email.to.join(", ")}:\nSubject: ${email.subject}\n\n${email.body.slice(0, 3000)}`;
            ingestEpisode(mailbox.tenantId, graphContent, "email", email.gmailMessageId)
              .catch((e) => console.warn("cron/email-sync: ingestEpisode failed (non-blocking)", e));
          }

          created++;
        }

        results.push({ mailbox: mailbox.emailAddress, created, total: emails.length });
      } catch (err) {
        console.error("cron/email-sync: mailbox failed", { mailbox: mailbox.emailAddress, err });
        results.push({ mailbox: mailbox.emailAddress, error: "sync_failed" });
      }
    }

    return Response.json({ success: true, synced: results.length, results });
  } catch (error) {
    console.error("cron/email-sync: top-level failure", error);
    return Response.json({ error: "Cron execution failed" }, { status: 500 });
  }
}
