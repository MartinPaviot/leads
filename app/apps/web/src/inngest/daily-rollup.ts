/**
 * Spec 29/32 — daily rollup snapshot cron. Once a day, snapshots each active
 * tenant's campaign metrics into metric_rollup_snapshot, building the history
 * that the dashboard reads cheaply and spec-32 regression-alerts compares against.
 * Idempotent per (tenant, dimension, scope, day) — a same-day re-run upserts.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { gte } from "drizzle-orm";
import { persistDailyRollups } from "@/lib/analytics/rollups/db-rollups";
import { evaluateTenantRegressions } from "@/lib/analytics/alerts/db-evaluate";

export const dailyRollup = inngest.createFunction(
  {
    id: "daily-rollup",
    name: "Daily Campaign Rollup Snapshots",
    retries: 2,
    triggers: [{ cron: "0 4 * * *" }], // 4am UTC daily
  },
  async ({ step }: { step: any }) => {
    const today = new Date().toISOString().slice(0, 10);
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // tenants that sent in the last 2 days

    const tenantIds: string[] = await step.run("active-tenants", async () => {
      const rows = await db
        .selectDistinct({ tenantId: outboundEmails.tenantId })
        .from(outboundEmails)
        .where(gte(outboundEmails.sentAt, since));
      return rows.map((r) => r.tenantId).filter((t): t is string => !!t);
    });

    let campaignsSnapshotted = 0;
    let regressionsFired = 0;
    for (const tenantId of tenantIds) {
      const n = await step.run(`snapshot-${tenantId}`, () => persistDailyRollups(tenantId, today));
      campaignsSnapshotted += n;
      // Spec 32 — regression pass over the fresh snapshot history (fire-once/dedup/resolve).
      const events = await step.run(`regressions-${tenantId}`, () => evaluateTenantRegressions(tenantId));
      regressionsFired += (events as Array<{ status: string }>).filter((e) => e.status === "firing").length;
    }

    return { day: today, tenants: tenantIds.length, campaignsSnapshotted, regressionsFired };
  },
);
