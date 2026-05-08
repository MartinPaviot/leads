import { db, agentTraces } from "../../lib/db";
import { sql, desc, gte, eq, count } from "drizzle-orm";
import { StatCard, StatusDot } from "../../components/stat-card";
import { Activity, Clock, DollarSign, AlertTriangle } from "lucide-react";
import Link from "next/link";

// Import the agent registry from the web app
import { AGENT_REGISTRY } from "@web/lib/agents/agent-registry";

export const dynamic = "force-dynamic";

interface AgentStats {
  agentId: string;
  traceCount: number;
  avgLatency: number;
  p95Latency: number;
  errorRate: number;
  avgEvalScore: number | null;
  totalCost: number;
}

async function getAgentStats(since: Date): Promise<AgentStats[]> {
  const rows = await db
    .select({
      agentId: agentTraces.agentId,
      traceCount: count(),
      avgLatency: sql<number>`avg(${agentTraces.latencyMs})::int`,
      p95Latency: sql<number>`percentile_cont(0.95) within group (order by ${agentTraces.latencyMs})::int`,
      errorCount: sql<number>`count(*) filter (where ${agentTraces.status} in ('error', 'timeout'))`,
      avgEvalScore: sql<number>`avg(${agentTraces.evalScore})`,
      totalCost: sql<number>`coalesce(sum(${agentTraces.estimatedCost}), 0)`,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since))
    .groupBy(agentTraces.agentId)
    .orderBy(desc(count()));

  return rows.map((r) => ({
    agentId: r.agentId,
    traceCount: Number(r.traceCount),
    avgLatency: Number(r.avgLatency) || 0,
    p95Latency: Number(r.p95Latency) || 0,
    errorRate: r.traceCount > 0 ? Number(r.errorCount) / Number(r.traceCount) : 0,
    avgEvalScore: r.avgEvalScore ? Number(r.avgEvalScore) : null,
    totalCost: Number(r.totalCost) || 0,
  }));
}

async function getOverviewStats(since: Date) {
  const [totals] = await db
    .select({
      totalTraces: count(),
      totalErrors: sql<number>`count(*) filter (where ${agentTraces.status} in ('error', 'timeout'))`,
      totalCost: sql<number>`coalesce(sum(${agentTraces.estimatedCost}), 0)`,
      avgLatency: sql<number>`avg(${agentTraces.latencyMs})::int`,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since));

  return {
    totalTraces: Number(totals?.totalTraces || 0),
    totalErrors: Number(totals?.totalErrors || 0),
    totalCost: Number(totals?.totalCost || 0),
    avgLatency: Number(totals?.avgLatency || 0),
    errorRate: totals?.totalTraces ? Number(totals.totalErrors) / Number(totals.totalTraces) : 0,
  };
}

function getHealthStatus(stats: AgentStats): "healthy" | "warning" | "critical" {
  const reg = AGENT_REGISTRY[stats.agentId];
  if (!reg) return "healthy";

  if (stats.errorRate > 0.2) return "critical";
  if (stats.p95Latency > reg.maxLatencyMs * 1.5) return "critical";
  if (stats.avgEvalScore !== null && stats.avgEvalScore < reg.qualityThreshold * 0.8) return "critical";

  if (stats.errorRate > 0.1) return "warning";
  if (stats.p95Latency > reg.maxLatencyMs) return "warning";
  if (stats.avgEvalScore !== null && stats.avgEvalScore < reg.qualityThreshold) return "warning";

  return "healthy";
}

export default async function AgentsPage() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
  const [agentStats, overview] = await Promise.all([
    getAgentStats(since),
    getOverviewStats(since),
  ]);

  const healthCounts = { healthy: 0, warning: 0, critical: 0 };
  for (const s of agentStats) {
    healthCounts[getHealthStatus(s)]++;
  }

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Agent Performance
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Last 24 hours &middot; {healthCounts.healthy} healthy, {healthCounts.warning} warning, {healthCounts.critical} critical
      </p>

      {/* Overview stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total Traces"
          value={overview.totalTraces.toLocaleString()}
          subtitle="Last 24h"
        />
        <StatCard
          label="Error Rate"
          value={`${(overview.errorRate * 100).toFixed(1)}%`}
          status={overview.errorRate > 0.1 ? "critical" : overview.errorRate > 0.05 ? "warning" : "healthy"}
        />
        <StatCard
          label="Avg Latency"
          value={`${(overview.avgLatency / 1000).toFixed(1)}s`}
          status={overview.avgLatency > 15000 ? "critical" : overview.avgLatency > 8000 ? "warning" : "healthy"}
        />
        <StatCard
          label="Total Cost"
          value={`$${overview.totalCost.toFixed(2)}`}
          subtitle="Last 24h"
        />
      </div>

      {/* Agent table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Agent</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Category</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Traces</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>p95 Latency</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Error Rate</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Eval Score</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Cost</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Health</th>
            </tr>
          </thead>
          <tbody>
            {agentStats.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No traces recorded in the last 24 hours
                </td>
              </tr>
            ) : agentStats.map((stats) => {
              const reg = AGENT_REGISTRY[stats.agentId];
              const health = getHealthStatus(stats);
              return (
                <tr
                  key={stats.agentId}
                  className="transition-colors cursor-pointer"
                  style={{ borderBottom: "1px solid var(--color-border-default)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <td className="px-4 py-3">
                    <Link href={`/agents/${stats.agentId}`} className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {reg?.name || stats.agentId}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: "var(--color-bg-muted)", color: "var(--color-text-tertiary)" }}
                    >
                      {reg?.category || "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {stats.traceCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: reg && stats.p95Latency > reg.maxLatencyMs ? "var(--color-danger)" : "var(--color-text-primary)" }}>
                      {(stats.p95Latency / 1000).toFixed(1)}s
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: stats.errorRate > 0.1 ? "var(--color-danger)" : "var(--color-text-primary)" }}>
                      {(stats.errorRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {stats.avgEvalScore !== null ? (
                      <span style={{ color: reg && stats.avgEvalScore < reg.qualityThreshold ? "var(--color-warning)" : "var(--color-text-primary)" }}>
                        {stats.avgEvalScore.toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    ${stats.totalCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusDot status={health} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
