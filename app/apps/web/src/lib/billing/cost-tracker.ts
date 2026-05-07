/**
 * API cost tracking for AI operations.
 * Logs token usage per request to the usage_events table for billing and monitoring.
 */

import { db } from "@/db";
import { usageEvents } from "@/db/billing-schema";
import { eq, and, gte } from "drizzle-orm";

// Cost per token (approximate, as of April 2026)
const COST_PER_TOKEN = {
  "claude-sonnet": { input: 0.003 / 1000, output: 0.015 / 1000 },
  "claude-haiku": { input: 0.00025 / 1000, output: 0.00125 / 1000 },
  "gpt-4o-mini": { input: 0.00015 / 1000, output: 0.0006 / 1000 },
  "text-embedding-3-small": { input: 0.00002 / 1000, output: 0 },
} as const;

type ModelKey = keyof typeof COST_PER_TOKEN;

interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  tenantId: string;
  feature: string; // "chat", "email_gen", "enrichment", "embedding", "scoring"
}

/**
 * Track AI token usage and estimated cost.
 */
export async function trackTokenUsage(usage: TokenUsage): Promise<void> {
  const modelKey = (Object.keys(COST_PER_TOKEN).find((k) =>
    usage.model.includes(k)
  ) || "claude-sonnet") as ModelKey;

  const rates = COST_PER_TOKEN[modelKey];
  const estimatedCost =
    usage.inputTokens * rates.input + usage.outputTokens * rates.output;

  try {
    await db.insert(usageEvents).values({
      tenantId: usage.tenantId,
      eventType: "ai_query",
      count: 1,
      metadata: {
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        estimatedCost,
        feature: usage.feature,
      },
    });
  } catch {
    // Cost tracking should never break the app
  }
}

/**
 * Get total estimated cost for a tenant in a given period.
 */
export async function getTenantCost(
  tenantId: string,
  since: Date
): Promise<{ totalCost: number; totalTokens: number; byFeature: Record<string, number> }> {
  try {
    const rows = await db
      .select()
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.tenantId, tenantId),
          eq(usageEvents.eventType, "ai_query"),
          gte(usageEvents.createdAt, since)
        )
      );

    let totalCost = 0;
    let totalTokens = 0;
    const byFeature: Record<string, number> = {};

    for (const row of rows) {
      const meta = row.metadata as Record<string, number | string> | null;
      if (!meta) continue;
      totalCost += (meta.estimatedCost as number) || 0;
      totalTokens += ((meta.inputTokens as number) || 0) + ((meta.outputTokens as number) || 0);
      const feature = (meta.feature as string) || "unknown";
      byFeature[feature] = (byFeature[feature] || 0) + ((meta.estimatedCost as number) || 0);
    }

    return { totalCost, totalTokens, byFeature };
  } catch {
    return { totalCost: 0, totalTokens: 0, byFeature: {} };
  }
}

/**
 * Get top cost consumers by agent ID from agent_traces.
 */
export async function getTopCostConsumers(
  since: Date,
  limit = 10
): Promise<Array<{ agentId: string; totalCost: number; callCount: number }>> {
  try {
    const { agentTraces } = await import("@/db/schema");
    const { sql } = await import("drizzle-orm");
    const rows = await db
      .select({
        agentId: agentTraces.agentId,
        totalCost: sql<number>`COALESCE(SUM(${agentTraces.estimatedCost}), 0)`.as("total_cost"),
        callCount: sql<number>`COUNT(*)`.as("call_count"),
      })
      .from(agentTraces)
      .where(gte(agentTraces.createdAt, since))
      .groupBy(agentTraces.agentId)
      .orderBy(sql`total_cost DESC`)
      .limit(limit);

    return rows.map((r) => ({
      agentId: r.agentId,
      totalCost: Number(r.totalCost),
      callCount: Number(r.callCount),
    }));
  } catch {
    return [];
  }
}
