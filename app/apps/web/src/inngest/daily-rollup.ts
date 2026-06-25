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
import { notifyTenant, regressionAlertCopy } from "@/lib/notify/db-notify";
import type { AlertEvent } from "@/lib/analytics/alerts/alerts";

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
    let tenantsFailed = 0;
    for (const tenantId of tenantIds) {
      // Per-tenant isolation: one tenant's failure must NOT abort the loop and
      // starve every later tenant (the steps have unique ids, so the function
      // still completes and Inngest doesn't retry the whole run for one tenant).
      try {
        const n = await step.run(`snapshot-${tenantId}`, () => persistDailyRollups(tenantId, today));
        campaignsSnapshotted += n;
        // Spec 32 — regression pass over the fresh snapshot history (fire-once/dedup/resolve).
        const events = (await step.run(`regressions-${tenantId}`, () =>
          evaluateTenantRegressions(tenantId),
        )) as AlertEvent[];
        const firing = events.filter((e) => e.status === "firing");
        regressionsFired += firing.length;
        // Spec 28 (notify) — surface each NEW regression as an in-app notification.
        if (firing.length > 0) {
          await step.run(`notify-regressions-${tenantId}`, async () => {
            for (const e of firing) await notifyTenant(tenantId, regressionAlertCopy(e.alert));
          });
        }
      } catch (err) {
        tenantsFailed++;
        console.error(`[daily-rollup] tenant ${tenantId} failed:`, err instanceof Error ? err.message : String(err));
      }
    }

    return { day: today, tenants: tenantIds.length, campaignsSnapshotted, regressionsFired, tenantsFailed };
  },
);
