import { db } from "@/db";
import { actionOutcomes } from "@/db/schema";
import { and, eq, sql, gte, inArray } from "drizzle-orm";

export interface AgentHitRate {
  actionType: string;
  wins: number;
  total: number;
  avgPositivity: number;
}

export async function getAgentHitRate(tenantId: string): Promise<AgentHitRate[]> {
  const rows = await db
    .select({
      actionType: actionOutcomes.actionType,
      total: sql<number>`count(*)`.as("total"),
      wins: sql<number>`count(*) filter (where ${actionOutcomes.positivity} > 0.3)`.as("wins"),
      avgPositivity: sql<number>`round(avg(${actionOutcomes.positivity})::numeric, 2)`.as("avg_positivity"),
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
    wins: Number(r.wins),
    total: Number(r.total),
    avgPositivity: Number(r.avgPositivity),
  }));
}

export interface TriggerActionOutcome {
  triggerType: string;
  actionType: string;
  outcomeType: string;
  count: number;
  avgPositivity: number;
}

export async function getBestCombinations(tenantId: string): Promise<TriggerActionOutcome[]> {
  const rows = await db
    .select({
      triggerType: actionOutcomes.triggerType,
      actionType: actionOutcomes.actionType,
      outcomeType: actionOutcomes.outcomeType,
      count: sql<number>`count(*)`.as("count"),
      avgPositivity: sql<number>`round(avg(${actionOutcomes.positivity})::numeric, 2)`.as("avg_positivity"),
    })
    .from(actionOutcomes)
    .where(
      and(
        eq(actionOutcomes.tenantId, tenantId),
        eq(actionOutcomes.status, "resolved"),
      ),
    )
    .groupBy(actionOutcomes.triggerType, actionOutcomes.actionType, actionOutcomes.outcomeType)
    .orderBy(sql`avg(${actionOutcomes.positivity}) desc`)
    .limit(20);

  return rows.map((r) => ({
    triggerType: r.triggerType ?? "unknown",
    actionType: r.actionType,
    outcomeType: r.outcomeType ?? "unknown",
    count: Number(r.count),
    avgPositivity: Number(r.avgPositivity),
  }));
}
