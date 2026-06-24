/**
 * Daily CS health snapshots cron (Sprint-2 audit follow-up).
 *
 * Runs every day at 04:00 UTC (after data-retention 03:00 and
 * URL-cache eviction 03:30 — keeps the quiet window tight). For each
 * tenant, computes a health score per active account and writes one
 * `account_health_snapshots` row.
 *
 * The composite score uses signals already in the DB :
 *  - usage      : days-since-last-activity (inverted)
 *  - sentiment  : sliding average of activity sentiment last 30d
 *  - engagement : two-way contact count last 14d
 *  - velocity   : deal updatedAt freshness vs tenant median
 *  - support    : open objection / risk count (lower = better)
 *
 * The snapshot writes the AI-blank suggestedAction template based on
 * the weakest axis. A future sprint can replace the template with an
 * LLM call grounded in retrieveTranscriptChunks for richer copy.
 */

import { inngest } from "./client";
import { db } from "@/db";
import {
  accountHealthSnapshots,
  companies,
  tenants,
  activities,
  deals,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import {
  computeHealthScore,
  defaultNextActionFor,
  type HealthInputs,
} from "@/lib/cs/health-score";
import { logger } from "@/lib/observability/logger";

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Score a single account using local DB signals. All sub-scores are
 * 0-100. The function is best-effort : missing data axes default to
 * a neutral 50 so an account with thin history doesn't score 0
 * (which would dominate the priority queue with new accounts).
 */
async function computeAccountHealth(
  tenantId: string,
  accountId: string,
): Promise<HealthInputs> {
  const now = new Date();
  const since14d = new Date(now.getTime() - FOURTEEN_DAYS_MS);
  const since30d = new Date(now.getTime() - THIRTY_DAYS_MS);

  // ── usage : days since last activity (inverted to 0-100) ──
  const [latestActivity] = await db
    .select({ ts: activities.occurredAt })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, accountId),
      ),
    )
    .orderBy(desc(activities.occurredAt))
    .limit(1);
  const daysSinceLast = latestActivity?.ts
    ? (now.getTime() - new Date(latestActivity.ts).getTime()) / (1000 * 60 * 60 * 24)
    : 60;
  // 0 days → 100, 30 days → 0, linear in between, clamped.
  const usage = Math.max(0, Math.min(100, 100 - (daysSinceLast / 30) * 100));

  // ── sentiment : average of last 30d activities (-1..+1 → 0..100) ──
  const sentimentRows = await db
    .select({
      sentiment: activities.sentiment,
    })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, accountId),
        gte(activities.occurredAt, since30d),
      ),
    );
  const sentMap: Record<string, number> = {
    positive: 1,
    neutral: 0,
    negative: -1,
  };
  let sentSum = 0;
  let sentCount = 0;
  for (const r of sentimentRows) {
    const v = r.sentiment ? sentMap[r.sentiment] : null;
    if (v !== null && v !== undefined) {
      sentSum += v;
      sentCount++;
    }
  }
  const sentimentAvg = sentCount > 0 ? sentSum / sentCount : 0;
  const sentiment = Math.round(((sentimentAvg + 1) / 2) * 100);

  // ── engagement : count of inbound + outbound activities last 14d ──
  const [{ count: engagementCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(activities)
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "company"),
        eq(activities.entityId, accountId),
        gte(activities.occurredAt, since14d),
      ),
    );
  // 10+ contacts in 14d → 100, 0 → 0, linear, clamped.
  const engagement = Math.min(100, (Number(engagementCount ?? 0) / 10) * 100);

  // ── velocity : deal updatedAt freshness ──
  const [latestDeal] = await db
    .select({ updatedAt: deals.updatedAt })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        eq(deals.companyId, accountId),
        sql`${deals.stage} NOT IN ('won', 'lost')`,
      ),
    )
    .orderBy(desc(deals.updatedAt))
    .limit(1);
  const dealDaysSinceUpdate = latestDeal?.updatedAt
    ? (now.getTime() - new Date(latestDeal.updatedAt).getTime()) / (1000 * 60 * 60 * 24)
    : null;
  // No active deal → neutral 50 (CS doesn't flag pure prospects).
  // Active deal updated today → 100, 30+ days → 0.
  const velocity =
    dealDaysSinceUpdate === null
      ? 50
      : Math.max(0, Math.min(100, 100 - (dealDaysSinceUpdate / 30) * 100));

  // ── support : invert the 30d "negative" activity count ──
  const negativeCount = sentimentRows.filter((r) => r.sentiment === "negative").length;
  // 0 negatives → 100, 5+ → 0.
  const support = Math.max(0, Math.min(100, 100 - (negativeCount / 5) * 100));

  return { usage, sentiment, engagement, velocity, support };
}

/**
 * ARR exposure (USD) for an account = the recurring revenue at risk across its
 * OPEN deals. Uses `platformArr` (the ARR-eligible recurring booking) when a
 * deal carries the bookings≠ARR split, else falls back to the legacy `value`.
 * `projectAmount` (one-time project bookings) is intentionally excluded — it is
 * not ARR. Returns null when the account has no open deals so the `/cs/today`
 * badge self-hides and the "risk × ARR" sort tie-break is skipped for it.
 */
export async function computeAccountArrExposure(
  tenantId: string,
  accountId: string,
): Promise<number | null> {
  const rows = await db
    .select({ value: deals.value, platformArr: deals.platformArr })
    .from(deals)
    .where(
      and(
        eq(deals.tenantId, tenantId),
        eq(deals.companyId, accountId),
        sql`${deals.stage} NOT IN ('won', 'lost')`,
      ),
    );
  if (rows.length === 0) return null;
  let total = 0;
  for (const r of rows) total += r.platformArr ?? r.value ?? 0;
  return total > 0 ? total : null;
}

export const dailyCsHealthSnapshots = inngest.createFunction(
  {
    id: "daily-cs-health-snapshots",
    name: "Daily CS account health snapshots",
    retries: 1,
    triggers: [{ cron: "TZ=UTC 0 4 * * *" }], // 04:00 UTC daily
  },
  async ({ step }: { step: any }) => {
    // Per-tenant fan-out — keeps each tenant's batch isolated and
    // makes the Inngest UI useful for diagnosing per-tenant errors.
    const tenantList = await step.run("list-tenants", async () => {
      const rows = await db.select({ id: tenants.id }).from(tenants);
      return rows.map((r) => r.id);
    });

    let totalSnapshots = 0;
    let totalErrors = 0;

    for (const tenantId of tenantList) {
      try {
        const accounts = await step.run(`list-accounts-${tenantId}`, async () => {
          return db
            .select({ id: companies.id })
            .from(companies)
            .where(eq(companies.tenantId, tenantId))
            .limit(500); // bound per-tenant work
        });

        for (const a of accounts) {
          try {
            const inputs = await computeAccountHealth(tenantId, a.id);
            const result = computeHealthScore(inputs);
            const action = defaultNextActionFor(result.weakestAxes[0] ?? "engagement");
            // ARR exposure powers the "/cs/today" badge + the "risk × ARR" sort
            // tie-break (route.ts). The column existed but was never written.
            const arrExposureUsd = await computeAccountArrExposure(tenantId, a.id);

            // Upsert via "delete today's row, insert fresh" pattern.
            // The unique index (account_id, computed_at) prevents
            // accidental duplicates from a re-run within the same
            // millisecond ; for cross-day uniqueness we rely on the
            // cron firing once per day.
            await db
              .insert(accountHealthSnapshots)
              .values({
                tenantId,
                accountId: a.id,
                healthScore: result.score,
                components: result.components,
                riskLevel: result.riskLevel,
                suggestedAction: action.action,
                suggestedActionReason: action.reason,
                arrExposureUsd,
              })
              .onConflictDoNothing();
            totalSnapshots++;
          } catch (err) {
            totalErrors++;
            logger.warn("daily-cs-health: account scoring failed", {
              tenantId,
              accountId: a.id,
              err: err instanceof Error ? err.message : String(err),
            });
          }
        }
      } catch (err) {
        totalErrors++;
        logger.warn("daily-cs-health: tenant batch failed", {
          tenantId,
          err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("daily-cs-health: complete", {
      tenantsProcessed: tenantList.length,
      totalSnapshots,
      totalErrors,
    });
    return { tenantsProcessed: tenantList.length, totalSnapshots, totalErrors };
  },
);
