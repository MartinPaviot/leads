/**
 * P2 (inbox deal-closer roadmap) — proactive follow-up nudges, daily cron.
 *
 * The inbox is personal (lib/inbox/user-scope.ts: "a connected mailbox is
 * PERSONAL — only its owner reads it"), so unlike the other daily crons in
 * this file's siblings (tam-refresh-cron.ts, weekly-optimizer.ts) which loop
 * per TENANT, this loops per (tenant, user) — every distinct owner of an
 * active connected mailbox. A user with no mailbox never appears here.
 *
 * Mirrors dailyFounderBrief's fixed-UTC-weekday cron shape rather than
 * building per-tenant-timezone precision (that level of precision only
 * exists today for the send window in email-send-worker.ts, and would be
 * over-engineering relative to the bar this codebase's other daily crons
 * already set). Runs every day (follow-ups don't pause on weekends the way
 * a coaching brief does — Monday's run still needs to catch a thread that
 * went quiet on Friday).
 *
 * All actual drafting/reconciling logic lives in lib/inbox/followup-nudge-
 * draft.ts (DB orchestration) on top of lib/inbox/followup-nudge.ts (pure,
 * unit-tested decision core). This file is purely the per-user fan-out.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { connectedMailboxes } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import { draftAndReconcileNudgesForUser } from "@/lib/inbox/followup-nudge-draft";
import { logger } from "@/lib/observability/logger";

export const followupNudgeDaily = inngest.createFunction(
  {
    id: "followup-nudge-daily",
    name: "Daily proactive follow-up nudges",
    retries: 1,
    triggers: [{ cron: "0 9 * * *" }], // 9am UTC daily
  },
  async ({ step }: { step: { run<T>(id: string, fn: () => Promise<T> | T): Promise<T> } }) => {
    const owners: { tenantId: string; userId: string }[] = await step.run("list-mailbox-owners", async () => {
      const rows = await db
        .selectDistinct({ tenantId: connectedMailboxes.tenantId, userId: connectedMailboxes.userId })
        .from(connectedMailboxes)
        .where(and(eq(connectedMailboxes.status, "active"), isNotNull(connectedMailboxes.userId)));
      return rows
        .filter((r): r is { tenantId: string; userId: string } => Boolean(r.userId))
        .map((r) => ({ tenantId: r.tenantId, userId: r.userId }));
    });

    let totalDrafted = 0;
    let totalExpired = 0;
    let usersProcessed = 0;

    for (const owner of owners) {
      const result = await step.run(`nudges-${owner.tenantId}-${owner.userId}`, async () => {
        try {
          return await draftAndReconcileNudgesForUser(owner.tenantId, owner.userId);
        } catch (err) {
          // One user's failure (e.g. a transient DB blip) must not block the
          // rest of the fan-out — fail-soft per user, same contract as the
          // sibling tenant-looped crons.
          logger.warn?.("followup-nudge-daily: per-user pass failed (non-fatal)", {
            tenantId: owner.tenantId,
            userId: owner.userId,
            err: err instanceof Error ? err.message : String(err),
          });
          return { drafted: 0, expired: 0 };
        }
      });
      totalDrafted += result.drafted;
      totalExpired += result.expired;
      usersProcessed++;
    }

    return { usersProcessed, totalDrafted, totalExpired };
  },
);
