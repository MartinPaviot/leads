/**
 * F003 — Outcome Detector
 *
 * Cron that checks watching outcomes for resolution or expiry.
 * Also handles real-time outcome resolution from events.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { actionOutcomes, outboundEmails, activities, tasks } from "@/db/schema";
import { and, eq, lte, sql, gte } from "drizzle-orm";
import { resolveOutcome } from "@/lib/outcomes/resolve";
import logger from "@/lib/observability/logger";

export const outcomeDetectorCron = inngest.createFunction(
  {
    id: "outcome-detector-cron",
    retries: 1,
    // Outcome tracking isn't latency-critical — every 30 min is plenty.
    triggers: [{ cron: "*/30 * * * *" }],
  },
  async ({ step }: { step: any }) => {
    const now = new Date();
    let resolved = 0;
    let expired = 0;

    // ── Check for expired outcomes ──
    const expiredOutcomes = await step.run("find-expired", async () => {
      return db
        .select({ id: actionOutcomes.id, tenantId: actionOutcomes.tenantId })
        .from(actionOutcomes)
        .where(
          and(
            eq(actionOutcomes.status, "watching"),
            lte(actionOutcomes.windowExpiresAt, now),
          ),
        )
        .limit(200);
    });

    if (expiredOutcomes.length > 0) {
      await step.run("expire-outcomes", async () => {
        for (const outcome of expiredOutcomes) {
          await resolveOutcome(outcome.id, "no_response");
          expired++;
        }
      });
    }

    // ── Check email outcomes (opened/replied) ──
    const emailWatchers = await step.run("find-email-watchers", async () => {
      return db
        .select({
          id: actionOutcomes.id,
          entityId: actionOutcomes.entityId,
          tenantId: actionOutcomes.tenantId,
          watchingSince: actionOutcomes.watchingSince,
        })
        .from(actionOutcomes)
        .where(
          and(
            eq(actionOutcomes.status, "watching"),
            eq(actionOutcomes.expectedOutcome, "email_reply"),
          ),
        )
        .limit(200);
    });

    if (emailWatchers.length > 0) {
      await step.run("check-email-outcomes", async () => {
        for (const watcher of emailWatchers) {
          const [replyEmail] = await db
            .select({ repliedAt: outboundEmails.repliedAt, replyClassification: outboundEmails.replyClassification })
            .from(outboundEmails)
            .where(
              and(
                eq(outboundEmails.tenantId, watcher.tenantId),
                eq(outboundEmails.contactId, watcher.entityId),
                gte(outboundEmails.repliedAt, watcher.watchingSince),
              ),
            )
            .limit(1);

          if (replyEmail?.repliedAt) {
            const classification = replyEmail.replyClassification;
            const outcomeType =
              classification === "interested" || classification === "meeting_request"
                ? "replied_positive"
                : classification === "not_interested"
                  ? "replied_negative"
                  : "replied_neutral";
            await resolveOutcome(watcher.id, outcomeType);
            resolved++;
          }
        }
      });
    }

    // ── Check deal advancement outcomes ──
    const dealWatchers = await step.run("find-deal-watchers", async () => {
      return db
        .select({
          id: actionOutcomes.id,
          entityId: actionOutcomes.entityId,
          tenantId: actionOutcomes.tenantId,
          watchingSince: actionOutcomes.watchingSince,
        })
        .from(actionOutcomes)
        .where(
          and(
            eq(actionOutcomes.status, "watching"),
            eq(actionOutcomes.expectedOutcome, "deal_advance"),
          ),
        )
        .limit(200);
    });

    if (dealWatchers.length > 0) {
      await step.run("check-deal-outcomes", async () => {
        for (const watcher of dealWatchers) {
          const [stageChange] = await db
            .select({ id: activities.id })
            .from(activities)
            .where(
              and(
                eq(activities.tenantId, watcher.tenantId),
                eq(activities.entityType, "deal"),
                eq(activities.entityId, watcher.entityId),
                eq(activities.activityType, "deal_stage_changed"),
                gte(activities.occurredAt, watcher.watchingSince),
              ),
            )
            .limit(1);

          if (stageChange) {
            await resolveOutcome(watcher.id, "deal_advanced");
            resolved++;
          }
        }
      });
    }

    return { resolved, expired, checked: emailWatchers.length + dealWatchers.length + expiredOutcomes.length };
  },
);
