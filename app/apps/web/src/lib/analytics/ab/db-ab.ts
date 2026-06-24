/**
 * Spec 30 — A/B significance over live campaign data. Wires the pure
 * `evaluateAbTest` (ab.ts) to the spec-29 campaign rollups: two campaigns'
 * `{ sent, replies, positiveReplies }` counts become a one-axis variant pair,
 * judged for a real winner. Read-only over outbound_emails (no new table).
 * Blast radius: analytics/ab/* + the /api/analytics/ab route.
 */

import { db as defaultDb } from "@/db";
import { computeCampaignRollups } from "@/lib/analytics/rollups/db-rollups";
import type { Metrics } from "@/lib/analytics/rollups/rollup";
import { evaluateAbTest, type AbMetric, type AbResult, type AbVariant } from "./ab";

/**
 * Map a campaign's rollup metrics to an A/B variant on the "campaign" axis. An
 * absent campaign (no sends in the window) zeroes out — so it falls to
 * insufficient_data rather than fabricating a winner. Pure.
 */
export function campaignToVariant(campaignId: string, m: Metrics | null): AbVariant {
  return {
    variantId: campaignId,
    axis: "campaign",
    axisValue: campaignId,
    sent: m?.sent ?? 0,
    replies: m?.replies ?? 0,
    positiveReplies: m?.positiveReplies ?? 0,
  };
}

export interface CompareCampaignsOptions {
  metric?: AbMetric;
  minSample?: number;
  alpha?: number;
  windowMs?: number;
  now?: number;
  database?: typeof defaultDb;
}

/**
 * Compare two campaigns for a statistically significant winner. Computes the
 * tenant's campaign rollups once, pulls both campaigns' counts, and runs the
 * two-proportion z-test via evaluateAbTest. Self-comparison is refused (a
 * campaign vs itself is never a meaningful test). Tenant-scoped, read-only.
 */
export async function compareCampaigns(
  tenantId: string,
  campaignIdA: string,
  campaignIdB: string,
  opts: CompareCampaignsOptions = {},
): Promise<AbResult> {
  const metric = opts.metric ?? "reply";
  if (campaignIdA === campaignIdB) {
    return { verdict: "inconclusive", metric, reason: "cannot compare a campaign to itself" };
  }

  const rollups = await computeCampaignRollups(tenantId, {
    windowMs: opts.windowMs,
    now: opts.now,
    database: opts.database,
  });

  const variantA = campaignToVariant(campaignIdA, rollups.byScope[campaignIdA] ?? null);
  const variantB = campaignToVariant(campaignIdB, rollups.byScope[campaignIdB] ?? null);

  return evaluateAbTest([variantA, variantB], {
    metric: opts.metric,
    minSample: opts.minSample,
    alpha: opts.alpha,
  });
}
