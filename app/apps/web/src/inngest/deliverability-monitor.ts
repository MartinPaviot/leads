/**
 * Deliverability Health Monitor — Campaign Engine 1000x
 *
 * Runs every 6 hours. Checks all active/warming mailboxes:
 * - Computes health score from bounce + complaint rates
 * - Auto-pauses mailboxes that cross critical thresholds
 * - Promotes warming mailboxes to active when warmup completes
 * - Notifies founder of health issues
 */

import { inngest } from "./client";
import { db } from "@/db";
import { connectedMailboxes, notifications, users } from "@/db/schema";
import { eq, and, or, ne } from "drizzle-orm";
import { checkMailboxHealth, executeHealthAction } from "@/lib/campaign-engine/deliverability/health-monitor";
import { isWarmupComplete } from "@/lib/campaign-engine/deliverability/warmup";

export const deliverabilityHealthCron = inngest.createFunction(
  {
    id: "campaign-engine/deliverability-health",
    name: "Deliverability Health Monitor",
    retries: 1,
    concurrency: [{ limit: 1 }],
    triggers: [{ cron: "0 */6 * * *" }], // Every 6 hours
  },
  async ({ step }) => {
    // Get all non-retired mailboxes
    const mailboxes = await step.run("get-mailboxes", async () => {
      return db
        .select()
        .from(connectedMailboxes)
        .where(
          and(
            ne(connectedMailboxes.status, "disabled"),
            ne(connectedMailboxes.status, "error")
          )
        );
    });

    let checked = 0;
    let paused = 0;
    let promoted = 0;
    let warned = 0;

    for (const mailbox of mailboxes) {
      const result = await step.run(`check-${mailbox.id}`, async () => {
        // 1. Check health
        const report = await checkMailboxHealth(mailbox.id);

        // 2. Execute action (pause if critical)
        if (report.action === "pause" || report.action === "retire") {
          await executeHealthAction(report);

          // Notify tenant
          const [user] = await db
            .select({ id: users.id })
            .from(users)
            .where(eq(users.tenantId, mailbox.tenantId))
            .limit(1);

          if (user) {
            await db.insert(notifications).values({
              tenantId: mailbox.tenantId,
              userId: user.id,
              type: "system" as any,
              title: `Mailbox paused: ${mailbox.emailAddress}`,
              body: report.issues.map((i) => i.message).join(". "),
              entityType: "settings",
              entityId: mailbox.id,
            });
          }

          return { action: "paused" as const };
        }

        // 3. Promote warming → active if warmup complete
        if (mailbox.status === "warming_up" && mailbox.warmupStartedAt) {
          if (isWarmupComplete(new Date(mailbox.warmupStartedAt))) {
            await db
              .update(connectedMailboxes)
              .set({ status: "active", warmupCompletedAt: new Date() })
              .where(eq(connectedMailboxes.id, mailbox.id));
            return { action: "promoted" as const };
          }
        }

        // 4. Update health score
        await executeHealthAction(report);

        if (report.action === "warn") {
          return { action: "warned" as const };
        }

        return { action: "ok" as const };
      });

      checked++;
      if (result.action === "paused") paused++;
      if (result.action === "promoted") promoted++;
      if (result.action === "warned") warned++;
    }

    return { checked, paused, promoted, warned };
  }
);
