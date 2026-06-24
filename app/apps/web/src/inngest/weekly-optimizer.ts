/**
 * Spec 31 — weekly optimization review cron. Once a week, for each tenant that
 * sent recently, grounds the agent in the tenant's campaign rollups (29) +
 * active regression alerts (32), asks for ranked metric-cited proposals, routes
 * each deterministically (risk.ts), and persists the reviewed queue to
 * optimizer_proposal. Observe-only: every proposal is gated for human review —
 * nothing is auto-applied. Idempotent per (tenant, week) — a re-run upserts.
 */

import { inngest } from "./client";
import { db } from "@/db";
import { outboundEmails } from "@/db/schema";
import { gte } from "drizzle-orm";
import { runWeeklyReviewForTenant } from "@/lib/analytics/optimizer/db-review";

export const weeklyOptimizer = inngest.createFunction(
  {
    id: "weekly-optimizer",
    name: "Weekly Optimization Review",
    retries: 2,
    triggers: [{ cron: "0 6 * * 1" }], // Mondays 06:00 UTC
  },
  async ({ step }: { step: any }) => {
    const week = new Date().toISOString().slice(0, 10); // run day, UTC
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000); // sent in the last 14 days

    const tenantIds: string[] = await step.run("active-tenants", async () => {
      const rows = await db
        .selectDistinct({ tenantId: outboundEmails.tenantId })
        .from(outboundEmails)
        .where(gte(outboundEmails.sentAt, since));
      return rows.map((r) => r.tenantId).filter((t): t is string => !!t);
    });

    let proposalsPersisted = 0;
    let gated = 0;
    for (const tenantId of tenantIds) {
      const result = (await step.run(`review-${tenantId}`, () =>
        runWeeklyReviewForTenant(tenantId, week),
      )) as { proposals: unknown[]; decisions: Array<{ applied: boolean }> };
      proposalsPersisted += result.proposals.length;
      gated += result.decisions.filter((d) => !d.applied).length;
    }

    return { week, tenants: tenantIds.length, proposalsPersisted, gated };
  },
);
