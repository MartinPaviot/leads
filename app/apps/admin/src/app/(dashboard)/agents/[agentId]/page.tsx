import { db, agentTraces } from "../../../../lib/db";
import { eq, desc, gte, sql, count } from "drizzle-orm";
import { StatCard } from "../../../../components/stat-card";
import { AGENT_REGISTRY } from "@web/lib/observability";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ agentId: string }>;
}

export default async function AgentDetailPage({ params }: Props) {
  const { agentId } = await params;
  const reg = AGENT_REGISTRY[agentId];
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Fetch metrics
  const [metrics] = await db
    .select({
      traceCount: count(),
      avgLatency: sql<number>`avg(${agentTraces.latencyMs})::int`,
      p50Latency: sql<number>`percentile_cont(0.50) within group (order by ${agentTraces.latencyMs})::int`,
      p95Latency: sql<number>`percentile_cont(0.95) within group (order by ${agentTraces.latencyMs})::int`,
      p99Latency: sql<number>`percentile_cont(0.99) within group (order by ${agentTraces.latencyMs})::int`,
      errorCount: sql<number>`count(*) filter (where ${agentTraces.status} in ('error', 'timeout'))`,
      avgEvalScore: sql<number>`avg(${agentTraces.evalScore})`,
      totalCost: sql<number>`coalesce(sum(${agentTraces.cost}), 0)`,
      avgInputTokens: sql<number>`avg(${agentTraces.inputTokens})::int`,
      avgOutputTokens: sql<number>`avg(${agentTraces.outputTokens})::int`,
    })
    .from(agentTraces)
    .where(sql`${agentTraces.agentId} = ${agentId} AND ${agentTraces.createdAt} >= ${since}`);

  // Fetch recent traces
  const traces = await db
    .select({
      id: agentTraces.id,
      input: agentTraces.input,
      output: agentTraces.output,
      model: agentTraces.model,
      status: agentTraces.status,
      latencyMs: agentTraces.latencyMs,
      inputTokens: agentTraces.inputTokens,
      outputTokens: agentTraces.outputTokens,
      cost: agentTraces.cost,
      evalScore: agentTraces.evalScore,
      errorMessage: agentTraces.errorMessage,
      createdAt: agentTraces.createdAt,
    })
    .from(agentTraces)
    .where(sql`${agentTraces.agentId} = ${agentId} AND ${agentTraces.createdAt} >= ${since}`)
    .orderBy(desc(agentTraces.createdAt))
    .limit(50);

  const traceCount = Number(metrics?.traceCount || 0);
  const errorRate = traceCount > 0 ? Number(metrics?.errorCount || 0) / traceCount : 0;

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <Link href="/" className="text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
          &larr; All Agents
        </Link>
        <h1 className="mt-2 text-[22px] font-semibold" style={{ letterSpacing: "-0.02em" }}>
          {reg?.name || agentId}
        </h1>
        <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          {reg?.description || "No description"} &middot; {reg?.category || "unknown"}
        </p>
      </div>

      {/* SLO badges */}
      {reg && (
        <div className="mb-6 flex gap-3">
          <SLOBadge
            label="Quality"
            current={metrics?.avgEvalScore ? Number(metrics.avgEvalScore) : null}
            threshold={reg.qualityThreshold}
            format={(v) => v.toFixed(2)}
          />
          <SLOBadge
            label="p95 Latency"
            current={metrics?.p95Latency ? Number(metrics.p95Latency) : null}
            threshold={reg.maxLatencyMs}
            format={(v) => `${(v / 1000).toFixed(1)}s`}
            inverted
          />
          <SLOBadge
            label="Error Rate"
            current={errorRate}
            threshold={0.1}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            inverted
          />
        </div>
      )}

      {/* Metrics grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Traces (24h)" value={traceCount} />
        <StatCard label="p50 / p95 / p99" value={`${((metrics?.p50Latency || 0) / 1000).toFixed(1)}s / ${((metrics?.p95Latency || 0) / 1000).toFixed(1)}s / ${((metrics?.p99Latency || 0) / 1000).toFixed(1)}s`} />
        <StatCard label="Avg Tokens" value={`${metrics?.avgInputTokens || 0} in / ${metrics?.avgOutputTokens || 0} out`} />
        <StatCard label="Total Cost" value={`$${Number(metrics?.totalCost || 0).toFixed(2)}`} />
      </div>

      {/* Recent traces */}
      <h2 className="text-[16px] font-semibold mb-3">Recent Traces</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Time</th>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Input</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Latency</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Tokens</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Cost</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Eval</th>
              <th className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {traces.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No traces in the last 24 hours
                </td>
              </tr>
            ) : traces.map((trace) => (
              <tr
                key={trace.id}
                style={{ borderBottom: "1px solid var(--color-border-default)" }}
                className="transition-colors"
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--color-bg-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <td className="px-3 py-2" style={{ color: "var(--color-text-tertiary)", whiteSpace: "nowrap" }}>
                  {trace.createdAt ? new Date(trace.createdAt).toLocaleTimeString() : "--"}
                </td>
                <td className="px-3 py-2 max-w-[300px] truncate" style={{ color: "var(--color-text-primary)" }}>
                  {trace.input?.slice(0, 80) || "--"}
                </td>
                <td className="px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {trace.latencyMs ? `${(trace.latencyMs / 1000).toFixed(1)}s` : "--"}
                </td>
                <td className="px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-text-tertiary)" }}>
                  {(trace.inputTokens || 0) + (trace.outputTokens || 0)}
                </td>
                <td className="px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {trace.cost ? `$${Number(trace.cost).toFixed(3)}` : "--"}
                </td>
                <td className="px-3 py-2 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {trace.evalScore !== null ? (
                    <span style={{ color: Number(trace.evalScore) < (reg?.qualityThreshold || 0.7) ? "var(--color-warning)" : "var(--color-success)" }}>
                      {Number(trace.evalScore).toFixed(2)}
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  <span
                    className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background: trace.status === "ok" ? "oklch(0.95 0.03 145)" : trace.status === "error" ? "oklch(0.95 0.03 25)" : "var(--color-bg-muted)",
                      color: trace.status === "ok" ? "var(--color-success)" : trace.status === "error" ? "var(--color-danger)" : "var(--color-text-tertiary)",
                    }}
                  >
                    {trace.status || "unknown"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SLOBadge({
  label,
  current,
  threshold,
  format,
  inverted = false,
}: {
  label: string;
  current: number | null;
  threshold: number;
  format: (v: number) => string;
  inverted?: boolean;
}) {
  const passing = current === null ? true :
    inverted ? current <= threshold : current >= threshold;

  return (
    <div
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-[12px]"
      style={{
        background: passing ? "oklch(0.97 0.015 145)" : "oklch(0.97 0.015 25)",
        border: `1px solid ${passing ? "oklch(0.85 0.06 145)" : "oklch(0.85 0.06 25)"}`,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: passing ? "var(--color-success)" : "var(--color-danger)" }}
      />
      <span style={{ color: "var(--color-text-secondary)", fontWeight: 500 }}>{label}:</span>
      <span style={{ color: passing ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
        {current !== null ? format(current) : "--"}
      </span>
      <span style={{ color: "var(--color-text-tertiary)" }}>
        / {format(threshold)}
      </span>
    </div>
  );
}
