import { db, agentTraces, tenants } from "../../../lib/db";
import { sql, desc, gte, eq, count } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";
import { AGENT_REGISTRY } from "@web/lib/agent-registry";

export const dynamic = "force-dynamic";

async function getTotalCost30d(since: Date) {
  const [row] = await db
    .select({
      totalCost: sql<number>`coalesce(sum(${agentTraces.estimatedCost}), 0)`,
      totalTraces: count(),
      avgCostPerTrace: sql<number>`case when count(*) > 0 then sum(${agentTraces.estimatedCost}) / count(*) else 0 end`,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since));

  return {
    totalCost: Number(row?.totalCost || 0),
    totalTraces: Number(row?.totalTraces || 0),
    avgCostPerTrace: Number(row?.avgCostPerTrace || 0),
  };
}

async function getCostByAgent(since: Date) {
  const rows = await db
    .select({
      agentId: agentTraces.agentId,
      totalCost: sql<number>`coalesce(sum(${agentTraces.estimatedCost}), 0)`,
      traceCount: count(),
      successCount: sql<number>`count(*) filter (where ${agentTraces.status} = 'ok')`,
    })
    .from(agentTraces)
    .where(gte(agentTraces.createdAt, since))
    .groupBy(agentTraces.agentId)
    .orderBy(desc(sql`sum(${agentTraces.estimatedCost})`));

  return rows.map((r) => ({
    agentId: r.agentId,
    totalCost: Number(r.totalCost) || 0,
    traceCount: Number(r.traceCount),
    successCount: Number(r.successCount),
    avgCostPerSuccess: Number(r.successCount) > 0
      ? (Number(r.totalCost) || 0) / Number(r.successCount)
      : 0,
  }));
}

async function getCostByModel(since: Date) {
  const rows = await db
    .select({
      model: agentTraces.model,
      totalCost: sql<number>`coalesce(sum(${agentTraces.estimatedCost}), 0)`,
      traceCount: count(),
      avgInputTokens: sql<number>`avg(${agentTraces.inputTokens})::int`,
      avgOutputTokens: sql<number>`avg(${agentTraces.outputTokens})::int`,
    })
    .from(agentTraces)
    .where(sql`${agentTraces.createdAt} >= ${since} AND ${agentTraces.model} IS NOT NULL`)
    .groupBy(agentTraces.model)
    .orderBy(desc(sql`sum(${agentTraces.estimatedCost})`));

  return rows.map((r) => ({
    model: r.model || "unknown",
    totalCost: Number(r.totalCost) || 0,
    traceCount: Number(r.traceCount),
    avgInputTokens: Number(r.avgInputTokens) || 0,
    avgOutputTokens: Number(r.avgOutputTokens) || 0,
  }));
}

async function getCostByTenant(since: Date) {
  const rows = await db
    .select({
      tenantId: agentTraces.tenantId,
      tenantName: tenants.name,
      totalCost: sql<number>`coalesce(sum(${agentTraces.estimatedCost}), 0)`,
      traceCount: count(),
    })
    .from(agentTraces)
    .leftJoin(tenants, eq(tenants.id, agentTraces.tenantId))
    .where(sql`${agentTraces.createdAt} >= ${since} AND ${agentTraces.tenantId} IS NOT NULL`)
    .groupBy(agentTraces.tenantId, tenants.name)
    .orderBy(desc(sql`sum(${agentTraces.estimatedCost})`))
    .limit(10);

  return rows.map((r) => ({
    tenantId: r.tenantId || "unknown",
    tenantName: r.tenantName || r.tenantId || "Unknown",
    totalCost: Number(r.totalCost) || 0,
    traceCount: Number(r.traceCount),
  }));
}

async function getDailyCostTrend(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db.execute(sql`
    WITH days AS (
      SELECT generate_series(
        date_trunc('day', ${since}::timestamptz),
        date_trunc('day', now()),
        interval '1 day'
      ) AS day
    )
    SELECT
      days.day,
      coalesce(sum(${agentTraces.estimatedCost}), 0) AS cost,
      count(${agentTraces.id}) AS traces
    FROM days
    LEFT JOIN ${agentTraces}
      ON date_trunc('day', ${agentTraces.createdAt}) = days.day
    GROUP BY days.day
    ORDER BY days.day
  `);

  return (rows as unknown as Array<{ day: Date; cost: number; traces: number }>).map((r) => ({
    day: new Date(r.day),
    cost: Number(r.cost) || 0,
    traces: Number(r.traces) || 0,
  }));
}

async function getBudgetUtilization() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get per-tenant cost in last 30d
  const rows = await db
    .select({
      tenantId: agentTraces.tenantId,
      tenantName: tenants.name,
      tenantSettings: tenants.settings,
      totalCost: sql<number>`coalesce(sum(${agentTraces.estimatedCost}), 0)`,
    })
    .from(agentTraces)
    .leftJoin(tenants, eq(tenants.id, agentTraces.tenantId))
    .where(sql`${agentTraces.createdAt} >= ${thirtyDaysAgo} AND ${agentTraces.tenantId} IS NOT NULL`)
    .groupBy(agentTraces.tenantId, tenants.name, tenants.settings)
    .orderBy(desc(sql`sum(${agentTraces.estimatedCost})`));

  return rows
    .map((r) => {
      const settings = (r.tenantSettings || {}) as Record<string, unknown>;
      const monthlyCap = Number(settings.monthlyBudgetCap || settings.monthly_budget_cap || 0);
      const totalCost = Number(r.totalCost) || 0;
      return {
        tenantId: r.tenantId || "unknown",
        tenantName: r.tenantName || r.tenantId || "Unknown",
        totalCost,
        monthlyCap,
        utilization: monthlyCap > 0 ? totalCost / monthlyCap : 0,
        hasCapSet: monthlyCap > 0,
      };
    })
    .filter((r) => r.hasCapSet)
    .sort((a, b) => b.utilization - a.utilization);
}

export default async function CostAnalyticsPage() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [totals, byAgent, byModel, byTenant, dailyTrend, budgetUtil] = await Promise.all([
    getTotalCost30d(since),
    getCostByAgent(since),
    getCostByModel(since),
    getCostByTenant(since),
    getDailyCostTrend(14),
    getBudgetUtilization(),
  ]);

  const maxDailyCost = Math.max(...dailyTrend.map((d) => d.cost), 0.01);
  const maxAgentCost = Math.max(...byAgent.map((a) => a.totalCost), 0.01);
  const maxModelCost = Math.max(...byModel.map((m) => m.totalCost), 0.01);

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Cost Analytics
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        LLM spend breakdown by agent, model &amp; tenant &middot; Last 30 days
      </p>

      {/* Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Total LLM Cost"
          value={`$${totals.totalCost.toFixed(2)}`}
          subtitle="Last 30 days"
        />
        <StatCard
          label="Total Traces"
          value={totals.totalTraces.toLocaleString()}
          subtitle="Last 30 days"
        />
        <StatCard
          label="Avg Cost / Trace"
          value={`$${totals.avgCostPerTrace.toFixed(4)}`}
          subtitle="All agents"
        />
        <StatCard
          label="Active Models"
          value={byModel.length}
          subtitle={byModel[0]?.model || "None"}
        />
      </div>

      {/* Daily cost trend - last 14 days */}
      <h2 className="text-[16px] font-semibold mb-3">Daily Cost Trend</h2>
      <div
        className="rounded-xl p-5 mb-8"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <div className="flex items-end gap-1" style={{ height: 120 }}>
          {dailyTrend.map((d) => {
            const heightPct = maxDailyCost > 0 ? (d.cost / maxDailyCost) * 100 : 0;
            return (
              <div
                key={d.day.toISOString()}
                className="flex-1 flex flex-col items-center gap-1"
              >
                <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  ${d.cost.toFixed(2)}
                </span>
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(heightPct, 2)}%`,
                    background: "var(--color-accent)",
                    minHeight: 2,
                  }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex gap-1 mt-1">
          {dailyTrend.map((d) => (
            <div key={d.day.toISOString()} className="flex-1 text-center">
              <span className="text-[9px]" style={{ color: "var(--color-text-tertiary)" }}>
                {d.day.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Cost by Agent */}
      <h2 className="text-[16px] font-semibold mb-3">Cost by Agent</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Agent</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Total Cost</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--color-text-tertiary)", width: "25%" }}></th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Traces</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg / Success</th>
            </tr>
          </thead>
          <tbody>
            {byAgent.map((a) => {
              const reg = AGENT_REGISTRY[a.agentId];
              const barPct = maxAgentCost > 0 ? (a.totalCost / maxAgentCost) * 100 : 0;
              const overBudget = reg && reg.maxCostPerCall > 0 && a.avgCostPerSuccess > reg.maxCostPerCall;
              return (
                <tr key={a.agentId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">{reg?.name || a.agentId}</td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    ${a.totalCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(barPct, 1)}%`,
                          background: overBudget ? "var(--color-danger)" : "var(--color-accent)",
                        }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>
                    {a.traceCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: overBudget ? "var(--color-danger)" : "var(--color-text-primary)" }}>
                      ${a.avgCostPerSuccess.toFixed(4)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {byAgent.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No cost data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cost by Model */}
      <h2 className="text-[16px] font-semibold mb-3">Cost by Model</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Model</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Total Cost</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--color-text-tertiary)", width: "25%" }}></th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Traces</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg In Tokens</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Out Tokens</th>
            </tr>
          </thead>
          <tbody>
            {byModel.map((m) => {
              const barPct = maxModelCost > 0 ? (m.totalCost / maxModelCost) * 100 : 0;
              return (
                <tr key={m.model} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">
                    <code className="text-[12px] px-1.5 py-0.5 rounded" style={{ background: "var(--color-bg-muted)" }}>
                      {m.model}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    ${m.totalCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(barPct, 1)}%`, background: "var(--color-accent)" }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>
                    {m.traceCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-text-tertiary)" }}>
                    {m.avgInputTokens.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-text-tertiary)" }}>
                    {m.avgOutputTokens.toLocaleString()}
                  </td>
                </tr>
              );
            })}
            {byModel.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No model data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cost by Tenant - Top 10 */}
      <h2 className="text-[16px] font-semibold mb-3">Top 10 Tenants by Spend</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Tenant</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Total Cost</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Traces</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg / Trace</th>
            </tr>
          </thead>
          <tbody>
            {byTenant.map((t) => (
              <tr key={t.tenantId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{t.tenantName}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  ${t.totalCost.toFixed(2)}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>
                  {t.traceCount}
                </td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-text-tertiary)" }}>
                  ${(t.traceCount > 0 ? t.totalCost / t.traceCount : 0).toFixed(4)}
                </td>
              </tr>
            ))}
            {byTenant.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No tenant cost data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Budget Utilization */}
      <h2 className="text-[16px] font-semibold mb-3">Budget Utilization</h2>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-text-tertiary)" }}>
        Tenants with a monthly budget cap configured
      </p>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Tenant</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Spent</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Monthly Cap</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--color-text-tertiary)", width: "25%" }}>Utilization</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {budgetUtil.map((b) => {
              const pct = b.utilization * 100;
              const status = pct >= 90 ? "critical" : pct >= 70 ? "warning" : "healthy";
              const statusColors = {
                healthy: "var(--color-success)",
                warning: "var(--color-warning)",
                critical: "var(--color-danger)",
              };
              return (
                <tr key={b.tenantId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">{b.tenantName}</td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    ${b.totalCost.toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-text-tertiary)" }}>
                    ${b.monthlyCap.toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(pct, 100)}%`,
                            background: statusColors[status],
                          }}
                        />
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: statusColors[status], fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" }}>
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        background: status === "critical" ? "oklch(0.95 0.03 25)" : status === "warning" ? "oklch(0.95 0.05 80)" : "oklch(0.95 0.03 145)",
                        color: statusColors[status],
                      }}
                    >
                      {status === "critical" ? "Near cap" : status === "warning" ? "Watch" : "OK"}
                    </span>
                  </td>
                </tr>
              );
            })}
            {budgetUtil.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No tenants with budget caps configured</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
