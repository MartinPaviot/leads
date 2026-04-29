import { db, agentTraces } from "../../../lib/db";
import { sql, desc, gte, count } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";
import { AGENT_REGISTRY } from "@web/lib/observability";

export const dynamic = "force-dynamic";

async function getOverallCompliance(since: Date) {
  const [row] = await db
    .select({
      totalTraces: count(),
      qualityPassing: sql<number>`count(*) filter (where ${agentTraces.evalScore} is not null and ${agentTraces.evalScore} >= 0.7)`,
      qualityTotal: sql<number>`count(*) filter (where ${agentTraces.evalScore} is not null)`,
      latencyViolations: sql<number>`0`, // computed per-agent below
      costViolations: sql<number>`0`,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since));

  return {
    totalTraces: Number(row?.totalTraces || 0),
    qualityPassing: Number(row?.qualityPassing || 0),
    qualityTotal: Number(row?.qualityTotal || 0),
  };
}

interface AgentSLA {
  agentId: string;
  name: string;
  qualityTarget: number;
  qualityActual: number | null;
  latencyTarget: number;
  p95Latency: number;
  costTarget: number;
  avgCost: number;
  traceCount: number;
  qualityCompliant: boolean;
  latencyCompliant: boolean;
  costCompliant: boolean;
  overallCompliance: number;
}

async function getPerAgentSLA(since: Date): Promise<AgentSLA[]> {
  const rows = await db
    .select({
      agentId: agentTraces.agentId,
      traceCount: count(),
      avgEvalScore: sql<number>`avg(${agentTraces.evalScore})`,
      evalCount: sql<number>`count(${agentTraces.evalScore})`,
      p95Latency: sql<number>`percentile_cont(0.95) within group (order by ${agentTraces.latencyMs})::int`,
      avgCost: sql<number>`avg(${agentTraces.cost})`,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since))
    .groupBy(agentTraces.agentId)
    .orderBy(desc(count()));

  return rows.map((r) => {
    const reg = AGENT_REGISTRY[r.agentId];
    const qualityTarget = reg?.qualityThreshold || 0.7;
    const latencyTarget = reg?.maxLatencyMs || 15000;
    const costTarget = reg?.maxCostPerCall || 0.10;

    const qualityActual = r.avgEvalScore ? Number(r.avgEvalScore) : null;
    const p95Latency = Number(r.p95Latency) || 0;
    const avgCost = Number(r.avgCost) || 0;

    const qualityCompliant = qualityActual === null || qualityActual >= qualityTarget;
    const latencyCompliant = p95Latency <= latencyTarget;
    const costCompliant = costTarget === 0 || avgCost <= costTarget;

    let compliance = 0;
    let checks = 0;
    if (qualityActual !== null) { checks++; if (qualityCompliant) compliance++; }
    checks++; if (latencyCompliant) compliance++;
    if (costTarget > 0) { checks++; if (costCompliant) compliance++; }

    return {
      agentId: r.agentId,
      name: reg?.name || r.agentId,
      qualityTarget,
      qualityActual,
      latencyTarget,
      p95Latency,
      costTarget,
      avgCost,
      traceCount: Number(r.traceCount),
      qualityCompliant,
      latencyCompliant,
      costCompliant,
      overallCompliance: checks > 0 ? compliance / checks : 1,
    };
  });
}

interface SLABreach {
  id: string;
  agentId: string;
  agentName: string;
  breachType: string;
  actual: string;
  threshold: string;
  createdAt: Date | null;
}

async function getSLABreaches(since: Date): Promise<SLABreach[]> {
  // Get traces that violated any SLO in the last 7 days
  const traces = await db
    .select({
      id: agentTraces.id,
      agentId: agentTraces.agentId,
      evalScore: agentTraces.evalScore,
      latencyMs: agentTraces.latencyMs,
      cost: agentTraces.cost,
      status: agentTraces.status,
      createdAt: agentTraces.createdAt,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since))
    .orderBy(desc(agentTraces.createdAt))
    .limit(500);

  const breaches: SLABreach[] = [];

  for (const t of traces) {
    const reg = AGENT_REGISTRY[t.agentId];
    if (!reg) continue;

    // Quality breach
    if (t.evalScore !== null && Number(t.evalScore) < reg.qualityThreshold) {
      breaches.push({
        id: t.id + "-quality",
        agentId: t.agentId,
        agentName: reg.name,
        breachType: "Quality",
        actual: Number(t.evalScore).toFixed(2),
        threshold: `>= ${reg.qualityThreshold}`,
        createdAt: t.createdAt,
      });
    }

    // Latency breach
    if (t.latencyMs && t.latencyMs > reg.maxLatencyMs) {
      breaches.push({
        id: t.id + "-latency",
        agentId: t.agentId,
        agentName: reg.name,
        breachType: "Latency",
        actual: `${(t.latencyMs / 1000).toFixed(1)}s`,
        threshold: `<= ${(reg.maxLatencyMs / 1000).toFixed(1)}s`,
        createdAt: t.createdAt,
      });
    }

    // Cost breach
    if (reg.maxCostPerCall > 0 && t.cost && Number(t.cost) > reg.maxCostPerCall) {
      breaches.push({
        id: t.id + "-cost",
        agentId: t.agentId,
        agentName: reg.name,
        breachType: "Cost",
        actual: `$${Number(t.cost).toFixed(4)}`,
        threshold: `<= $${reg.maxCostPerCall.toFixed(2)}`,
        createdAt: t.createdAt,
      });
    }

    // Error breach
    if (t.status === "error" || t.status === "timeout") {
      breaches.push({
        id: t.id + "-error",
        agentId: t.agentId,
        agentName: reg.name,
        breachType: t.status === "timeout" ? "Timeout" : "Error",
        actual: t.status,
        threshold: "ok",
        createdAt: t.createdAt,
      });
    }
  }

  return breaches.slice(0, 50);
}

async function getDailyCompliance(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${since}::timestamptz),
        date_trunc('day', now()),
        interval '1 day'
      ) AS day
    ),
    daily AS (
      SELECT
        date_trunc('day', ${agentTraces.createdAt}) AS day,
        count(*) AS total,
        count(*) filter (where ${agentTraces.status} = 'ok') AS ok_count,
        count(*) filter (where ${agentTraces.evalScore} is not null AND ${agentTraces.evalScore} >= 0.7) AS quality_pass,
        count(*) filter (where ${agentTraces.evalScore} is not null) AS quality_total
      FROM ${agentTraces}
      WHERE ${agentTraces.createdAt} >= ${since}
      GROUP BY 1
    )
    SELECT
      days.day,
      coalesce(daily.total, 0) AS total,
      coalesce(daily.ok_count, 0) AS ok_count,
      coalesce(daily.quality_pass, 0) AS quality_pass,
      coalesce(daily.quality_total, 0) AS quality_total
    FROM days
    LEFT JOIN daily ON days.day = daily.day
    ORDER BY days.day
  `);

  return (rows as unknown as Array<{
    day: Date;
    total: number;
    ok_count: number;
    quality_pass: number;
    quality_total: number;
  }>).map((r) => {
    const total = Number(r.total);
    const okCount = Number(r.ok_count);
    const successRate = total > 0 ? okCount / total : 1;
    const qualityTotal = Number(r.quality_total);
    const qualityPass = Number(r.quality_pass);
    const qualityRate = qualityTotal > 0 ? qualityPass / qualityTotal : 1;
    // Combined compliance: average of success rate and quality rate
    const compliance = (successRate + qualityRate) / 2;
    return {
      day: new Date(r.day),
      total,
      compliance,
      successRate,
      qualityRate,
    };
  });
}

export default async function SLADashboardPage() {
  const sevenDays = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const [overall, perAgent, breaches, dailyCompliance] = await Promise.all([
    getOverallCompliance(sevenDays),
    getPerAgentSLA(sevenDays),
    getSLABreaches(sevenDays),
    getDailyCompliance(14),
  ]);

  const qualityCompliancePct = overall.qualityTotal > 0
    ? (overall.qualityPassing / overall.qualityTotal) * 100
    : 100;

  const agentsCompliant = perAgent.filter((a) => a.overallCompliance === 1).length;
  const agentsDegraded = perAgent.filter((a) => a.overallCompliance > 0 && a.overallCompliance < 1).length;
  const agentsViolating = perAgent.filter((a) => a.overallCompliance === 0).length;

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        SLA Dashboard
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Quality, latency &amp; cost SLO compliance &middot; Last 7 days
      </p>

      {/* Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Quality Compliance"
          value={`${qualityCompliancePct.toFixed(1)}%`}
          subtitle={`${overall.qualityPassing} / ${overall.qualityTotal} traces`}
          status={qualityCompliancePct >= 95 ? "healthy" : qualityCompliancePct >= 80 ? "warning" : "critical"}
        />
        <StatCard
          label="Agents Compliant"
          value={agentsCompliant}
          subtitle={`${agentsDegraded} degraded, ${agentsViolating} violating`}
          status={agentsViolating === 0 ? "healthy" : "critical"}
        />
        <StatCard
          label="SLA Breaches"
          value={breaches.length}
          subtitle="Last 7 days"
          status={breaches.length === 0 ? "healthy" : breaches.length < 10 ? "warning" : "critical"}
        />
        <StatCard
          label="Total Traces"
          value={overall.totalTraces.toLocaleString()}
          subtitle="Last 7 days"
        />
      </div>

      {/* Daily compliance trend */}
      <h2 className="text-[16px] font-semibold mb-3">Daily Compliance Trend</h2>
      <div
        className="rounded-xl p-5 mb-8"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex items-end gap-1" style={{ height: 120 }}>
          {dailyCompliance.map((d) => {
            const heightPct = d.compliance * 100;
            const color = d.compliance >= 0.95
              ? "var(--color-success)"
              : d.compliance >= 0.8
                ? "var(--color-warning)"
                : "var(--color-danger)";
            return (
              <div
                key={d.day.toISOString()}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {(d.compliance * 100).toFixed(0)}%
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(heightPct, 2)}%`,
                    background: color,
                    minHeight: 2,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1 mt-1">
          {dailyCompliance.map((d) => (
            <div key={d.day.toISOString()} className="flex-1 text-center">
              <span className="text-[9px]" style={{ color: "var(--color-text-tertiary)" }}>
                {d.day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Agent SLA */}
      <h2 className="text-[16px] font-semibold mb-3">Per-Agent SLA</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Agent</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Quality (target)</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Quality (actual)</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>p95 Latency (target)</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>p95 Latency (actual)</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Traces</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Compliance</th>
            </tr>
          </thead>
          <tbody>
            {perAgent.map((a) => {
              const compliancePct = (a.overallCompliance * 100).toFixed(0);
              const complianceColor = a.overallCompliance === 1
                ? "var(--color-success)"
                : a.overallCompliance >= 0.5
                  ? "var(--color-warning)"
                  : "var(--color-danger)";
              return (
                <tr key={a.agentId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {a.qualityTarget.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {a.qualityActual !== null ? (
                      <span style={{ color: a.qualityCompliant ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
                        {a.qualityActual.toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {(a.latencyTarget / 1000).toFixed(1)}s
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: a.latencyCompliant ? "var(--color-success)" : "var(--color-danger)", fontWeight: 600 }}>
                      {(a.p95Latency / 1000).toFixed(1)}s
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>
                    {a.traceCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                      style={{
                        background: a.overallCompliance === 1 ? "oklch(0.95 0.03 145)" : a.overallCompliance >= 0.5 ? "oklch(0.95 0.05 80)" : "oklch(0.95 0.03 25)",
                        color: complianceColor,
                      }}
                    >
                      {compliancePct}%
                    </span>
                  </td>
                </tr>
              );
            })}
            {perAgent.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No trace data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* SLA Breaches */}
      <h2 className="text-[16px] font-semibold mb-3">Recent SLA Breaches</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Agent</th>
              <th className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Breach Type</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Actual</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Threshold</th>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {breaches.map((b) => {
              const typeColors: Record<string, string> = {
                Quality: "var(--color-warning)",
                Latency: "var(--color-accent)",
                Cost: "var(--color-danger)",
                Error: "var(--color-danger)",
                Timeout: "var(--color-warning)",
              };
              return (
                <tr key={b.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-3 py-2 font-medium">{b.agentName}</td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        background: "var(--color-bg-muted)",
                        color: typeColors[b.breachType] || "var(--color-text-tertiary)",
                      }}
                    >
                      {b.breachType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--color-danger)", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                    {b.actual}
                  </td>
                  <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {b.threshold}
                  </td>
                  <td className="px-3 py-2" style={{ color: "var(--color-text-tertiary)" }}>
                    {b.createdAt ? new Date(b.createdAt).toLocaleString() : "--"}
                  </td>
                </tr>
              );
            })}
            {breaches.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No SLA breaches in the last 7 days</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
