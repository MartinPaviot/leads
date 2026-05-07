/**
 * Observability queries scoped to the onboarding funnel.
 *
 * Thin Drizzle wrapper around the `agent_traces` table that returns
 * per-agent p50/p95/p99/error-rate/cost, windowed by date. Consumed
 * by `/api/admin/onboarding-metrics` (Martin-facing sanity check)
 * and intended to be reused by the WS-0 PostHog dashboard spec where
 * PostHog can't query agent trace data natively.
 *
 * Scope is deliberately narrow — only the two agents that drive the
 * onboarding critical path (`icp-analysis`, `build-tam`,
 * `onboarding-narrator`). Broader dashboards live in
 * `observability.getAgentHealth`.
 */

import { db } from "@/db";
import { agentTraces } from "@/db/schema";
import { and, eq, gte, inArray, lte } from "drizzle-orm";

/** Agent IDs that serve the onboarding critical path. Kept in sync
 * with AGENT_REGISTRY — see lib/observability.ts. */
export const ONBOARDING_AGENT_IDS = [
  "icp-analysis",
  "build-tam",
  "onboarding-narrator",
] as const;
export type OnboardingAgentId = (typeof ONBOARDING_AGENT_IDS)[number];

export interface OnboardingAgentLatency {
  agentId: OnboardingAgentId;
  totalCalls: number;
  errorCount: number;
  errorRate: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  avgCostUsd: number;
  totalCostUsd: number;
}

/**
 * Latency + cost + error-rate per onboarding agent over a time window.
 *
 * Returns one row per agent ID that has traces in the window. Agents
 * with zero traces are omitted rather than returned as zero-rows — the
 * caller can tell "no data yet" from an empty array, and adding them
 * explicitly as zeros would mislead a dashboard into showing "healthy:
 * 0 errors" for an agent that didn't run.
 */
export async function getOnboardingAgentLatency(params: {
  tenantId?: string;
  since: Date;
  until?: Date;
}): Promise<OnboardingAgentLatency[]> {
  const until = params.until ?? new Date();

  const baseConds = [
    gte(agentTraces.createdAt, params.since),
    lte(agentTraces.createdAt, until),
    inArray(agentTraces.agentId, ONBOARDING_AGENT_IDS as unknown as string[]),
  ];
  const conditions = params.tenantId
    ? and(...baseConds, eq(agentTraces.tenantId, params.tenantId))
    : and(...baseConds);

  const rows = await db
    .select({
      agentId: agentTraces.agentId,
      status: agentTraces.status,
      latencyMs: agentTraces.latencyMs,
      estimatedCost: agentTraces.estimatedCost,
    })
    .from(agentTraces)
    .where(conditions);

  // Group and compute in-memory. Row count per window is bounded by
  // the number of onboarding runs × 3 agent IDs — well under 10k rows
  // for any realistic 30-day window, so a server-side aggregate SQL
  // query is over-engineering.
  const byAgent = new Map<OnboardingAgentId, typeof rows>();
  for (const r of rows) {
    const id = r.agentId as OnboardingAgentId;
    const list = byAgent.get(id) ?? [];
    list.push(r);
    byAgent.set(id, list);
  }

  const out: OnboardingAgentLatency[] = [];
  for (const [agentId, list] of byAgent) {
    const latencies = list
      .map((r) => r.latencyMs)
      .filter((v): v is number => typeof v === "number" && v >= 0)
      .sort((a, b) => a - b);

    const errorCount = list.filter(
      (r) => r.status === "error" || r.status === "timeout"
    ).length;
    const costs = list
      .map((r) => r.estimatedCost)
      .filter((v): v is number => typeof v === "number" && v >= 0);

    const totalCostUsd = costs.reduce((a, b) => a + b, 0);
    const avgCostUsd = costs.length > 0 ? totalCostUsd / costs.length : 0;

    out.push({
      agentId,
      totalCalls: list.length,
      errorCount,
      errorRate: list.length > 0 ? errorCount / list.length : 0,
      p50LatencyMs: percentile(latencies, 0.5),
      p95LatencyMs: percentile(latencies, 0.95),
      p99LatencyMs: percentile(latencies, 0.99),
      avgCostUsd,
      totalCostUsd,
    });
  }

  // Stable, predictable ordering so a dashboard diff across days is
  // a row-for-row comparison.
  out.sort((a, b) => a.agentId.localeCompare(b.agentId));
  return out;
}

/**
 * Nearest-rank percentile. Matches PostgreSQL `percentile_disc` and
 * the convention used by getAgentHealth in observability.ts.
 */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
  return sorted[idx];
}
