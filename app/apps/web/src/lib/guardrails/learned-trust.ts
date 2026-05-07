/**
 * F005 — Learned Trust Model
 *
 * Adjusts approval thresholds dynamically per tenant based on:
 * 1. Outcome data (F003) — did the agent's actions lead to good results?
 * 2. User approval patterns — does the user approve or dismiss proposals?
 *
 * The model starts at the static HIGH_CONFIDENCE_THRESHOLDS values and
 * moves toward more or less autonomy based on evidence.
 */

import { db } from "@/db";
import { actionOutcomes } from "@/db/schema";
import { and, eq, sql, inArray } from "drizzle-orm";
import { HIGH_CONFIDENCE_THRESHOLDS, type GuardedAction } from "./approval-mode";
import { getTenantSettings, updateTenantSettings } from "@/lib/config/tenant-settings";

const MIN_THRESHOLD = 0.5;
const MAX_THRESHOLD = 1.0;
const MIN_OUTCOMES_FOR_ADJUSTMENT = 10;

interface TrustStats {
  actionType: string;
  positiveOutcomes: number;
  totalOutcomes: number;
  approvedActions: number;
  totalProposals: number;
}

export async function computeEffectiveThresholds(
  tenantId: string,
): Promise<Record<string, number>> {
  const settings = await getTenantSettings(tenantId);
  const learned = (settings as Record<string, unknown>)?.learnedThresholds as Record<string, number> | undefined;

  if (learned && Object.keys(learned).length > 0) {
    return { ...HIGH_CONFIDENCE_THRESHOLDS, ...learned };
  }

  return { ...HIGH_CONFIDENCE_THRESHOLDS };
}

export function getEffectiveThreshold(
  action: GuardedAction,
  learnedThresholds?: Record<string, number>,
): number {
  if (learnedThresholds?.[action] !== undefined) {
    return learnedThresholds[action];
  }
  return HIGH_CONFIDENCE_THRESHOLDS[action];
}

export async function recalculateThresholds(tenantId: string): Promise<Record<string, number>> {
  const stats = await getOutcomeStats(tenantId);
  const newThresholds: Record<string, number> = {};

  for (const stat of stats) {
    const baseThreshold =
      HIGH_CONFIDENCE_THRESHOLDS[stat.actionType as GuardedAction] ??
      0.8;

    let threshold = baseThreshold;

    if (stat.totalOutcomes >= MIN_OUTCOMES_FOR_ADJUSTMENT) {
      const successRate = stat.positiveOutcomes / stat.totalOutcomes;
      if (successRate >= 0.8) threshold -= 0.05;
      else if (successRate < 0.5) threshold += 0.05;
    }

    threshold = Math.max(MIN_THRESHOLD, Math.min(MAX_THRESHOLD, threshold));
    newThresholds[stat.actionType] = Math.round(threshold * 100) / 100;
  }

  await updateTenantSettings(tenantId, {
    learnedThresholds: newThresholds,
    trustStatsUpdatedAt: new Date().toISOString(),
  } as Record<string, unknown>);

  return newThresholds;
}

async function getOutcomeStats(tenantId: string): Promise<TrustStats[]> {
  const rows = await db
    .select({
      actionType: actionOutcomes.actionType,
      totalOutcomes: sql<number>`count(*)`.as("total"),
      positiveOutcomes: sql<number>`count(*) filter (where ${actionOutcomes.positivity} > 0.3)`.as("positive"),
    })
    .from(actionOutcomes)
    .where(
      and(
        eq(actionOutcomes.tenantId, tenantId),
        inArray(actionOutcomes.status, ["resolved", "expired"]),
      ),
    )
    .groupBy(actionOutcomes.actionType);

  return rows.map((r) => ({
    actionType: r.actionType,
    positiveOutcomes: Number(r.positiveOutcomes),
    totalOutcomes: Number(r.totalOutcomes),
    approvedActions: 0,
    totalProposals: 0,
  }));
}
