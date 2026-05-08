import { db, evalDatasets, evalCases, evalRuns, evalResults } from "../../../lib/db";
import { sql, desc, eq, count } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";
import { AGENT_REGISTRY } from "@web/lib/agents/agent-registry";

export const dynamic = "force-dynamic";

// Golden cases are hardcoded at 20 — see apps/web/src/lib/evals/golden-cases.ts
const GOLDEN_CASE_COUNT = 20;

async function getDatasetStats() {
  const [stats] = await db
    .select({
      datasetCount: count(),
    })
    .from(evalDatasets);

  const [caseStats] = await db
    .select({
      totalCases: count(),
    })
    .from(evalCases);

  return {
    datasets: Number(stats?.datasetCount || 0),
    totalCases: Number(caseStats?.totalCases || 0),
  };
}

async function getRecentRuns() {
  const runs = await db
    .select({
      id: evalRuns.id,
      datasetId: evalRuns.datasetId,
      model: evalRuns.model,
      graderModel: evalRuns.graderModel,
      status: evalRuns.status,
      summary: evalRuns.summary,
      createdAt: evalRuns.createdAt,
      completedAt: evalRuns.completedAt,
    })
    .from(evalRuns)
    .orderBy(desc(evalRuns.createdAt))
    .limit(20);

  // Enrich with dataset names
  const datasetIds = [...new Set(runs.map((r) => r.datasetId))];
  const datasets =
    datasetIds.length > 0
      ? await db
          .select({ id: evalDatasets.id, name: evalDatasets.name })
          .from(evalDatasets)
          .where(sql`${evalDatasets.id} IN ${datasetIds}`)
      : [];
  const datasetMap = Object.fromEntries(datasets.map((d) => [d.id, d.name]));

  // Get result counts per run
  const resultCounts =
    runs.length > 0
      ? await db
          .select({
            runId: evalResults.runId,
            total: count(),
            passed: sql<number>`count(*) filter (where ${evalResults.pass} = true)`,
            avgScore: sql<number>`avg(${evalResults.score})`,
          })
          .from(evalResults)
          .where(sql`${evalResults.runId} IN ${runs.map((r) => r.id)}`)
          .groupBy(evalResults.runId)
      : [];
  const resultMap = Object.fromEntries(resultCounts.map((r) => [r.runId, r]));

  return runs.map((run) => {
    const results = resultMap[run.id];
    const summary = run.summary as Record<string, unknown> | null;
    return {
      ...run,
      datasetName: datasetMap[run.datasetId] || run.datasetId,
      caseCount: Number(results?.total || 0),
      passCount: Number(results?.passed || 0),
      passRate: results
        ? Number(results.total) > 0
          ? Number(results.passed) / Number(results.total)
          : 0
        : (summary?.passRate as number) ?? null,
      avgScore: results
        ? Number(results.avgScore) || 0
        : (summary?.meanScore as number) ?? null,
    };
  });
}

async function getAgentCoverage() {
  // Get which agents have eval cases via their datasets
  const casesPerDataset = await db
    .select({
      datasetId: evalCases.datasetId,
      caseCount: count(),
    })
    .from(evalCases)
    .groupBy(evalCases.datasetId);

  // Get dataset details
  const allDatasetsRaw = await db
    .select({
      id: evalDatasets.id,
      name: evalDatasets.name,
    })
    .from(evalDatasets);
  const allDatasets = allDatasetsRaw as Array<{ id: string; name: string }>;

  const caseCountMap = Object.fromEntries(
    casesPerDataset.map((c) => [c.datasetId, Number(c.caseCount)])
  );

  // Map dataset names to agent IDs heuristically (dataset names typically contain the agent name)
  const agentIds = Object.keys(AGENT_REGISTRY);
  const coverage: { agentId: string; agentName: string; datasetCount: number; caseCount: number }[] = [];

  for (const agentId of agentIds) {
    const reg = AGENT_REGISTRY[agentId];
    const matchingDatasets = allDatasets.filter(
      (d) =>
        d.name.toLowerCase().includes(agentId.toLowerCase()) ||
        d.name.toLowerCase().includes(reg.name.toLowerCase())
    );
    const totalCases = matchingDatasets.reduce(
      (sum, d) => sum + (caseCountMap[d.id] || 0),
      0
    );
    coverage.push({
      agentId,
      agentName: reg.name,
      datasetCount: matchingDatasets.length,
      caseCount: totalCases,
    });
  }

  return coverage;
}

async function getGraderDistribution() {
  // Count cases by tag category (tags contain grader type hints)
  const tagCounts = await db
    .select({
      tags: evalCases.tags,
    })
    .from(evalCases);

  const distribution: Record<string, number> = {};
  for (const row of tagCounts) {
    const tags = (row.tags as string[]) || [];
    for (const tag of tags) {
      distribution[tag] = (distribution[tag] || 0) + 1;
    }
  }

  return Object.entries(distribution)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

async function getPassRateTrend() {
  // Last 10 completed runs
  const runs = await db
    .select({
      id: evalRuns.id,
      model: evalRuns.model,
      summary: evalRuns.summary,
      completedAt: evalRuns.completedAt,
    })
    .from(evalRuns)
    .where(eq(evalRuns.status, "completed"))
    .orderBy(desc(evalRuns.completedAt))
    .limit(10);

  // Get per-run stats from results
  const runIds = runs.map((r) => r.id);
  const resultStats =
    runIds.length > 0
      ? await db
          .select({
            runId: evalResults.runId,
            total: count(),
            passed: sql<number>`count(*) filter (where ${evalResults.pass} = true)`,
            avgScore: sql<number>`avg(${evalResults.score})`,
          })
          .from(evalResults)
          .where(sql`${evalResults.runId} IN ${runIds}`)
          .groupBy(evalResults.runId)
      : [];
  const statsMap = Object.fromEntries(resultStats.map((r) => [r.runId, r]));

  return runs.reverse().map((run) => {
    const stats = statsMap[run.id];
    const summary = run.summary as Record<string, unknown> | null;
    const total = Number(stats?.total || 0);
    const passed = Number(stats?.passed || 0);
    return {
      id: run.id,
      model: run.model,
      date: run.completedAt,
      passRate: total > 0 ? passed / total : ((summary?.passRate as number) ?? 0),
      avgScore: Number(stats?.avgScore || 0) || ((summary?.meanScore as number) ?? 0),
      total,
      passed,
    };
  });
}

export default async function EvalsPage() {
  const [datasetStats, recentRuns, coverage, graderDist, trend] = await Promise.all([
    getDatasetStats(),
    getRecentRuns(),
    getAgentCoverage(),
    getGraderDistribution(),
    getPassRateTrend(),
  ]);

  const coveredAgents = coverage.filter((c) => c.caseCount > 0).length;
  const totalAgents = coverage.length;

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Eval Dashboard
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Agent evaluation pipeline &middot; How we test and measure AI quality
      </p>

      {/* Overview stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Eval Datasets"
          value={datasetStats.datasets}
          subtitle="Test suites defined"
        />
        <StatCard
          label="Total Test Cases"
          value={datasetStats.totalCases}
          subtitle={`+ ${GOLDEN_CASE_COUNT} golden cases`}
        />
        <StatCard
          label="Agent Coverage"
          value={`${coveredAgents}/${totalAgents}`}
          status={coveredAgents >= totalAgents * 0.5 ? "healthy" : "warning"}
          subtitle="agents with eval cases"
        />
        <StatCard
          label="Golden Cases"
          value={GOLDEN_CASE_COUNT}
          subtitle="Hand-crafted ground truth"
        />
      </div>

      {/* Pass Rate Trend — CSS bar chart */}
      <h2 className="text-[16px] font-semibold mb-3">Pass Rate Trend (last 10 runs)</h2>
      <div
        className="rounded-xl p-4 mb-8"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {trend.length === 0 ? (
          <div className="py-8 text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            No completed eval runs yet
          </div>
        ) : (
          <div className="flex items-end gap-2" style={{ height: "160px" }}>
            {trend.map((run) => {
              const barHeight = Math.max(run.passRate * 100, 2);
              const barColor =
                run.passRate >= 0.9
                  ? "var(--color-success)"
                  : run.passRate >= 0.7
                    ? "var(--color-warning)"
                    : "var(--color-danger)";
              return (
                <div
                  key={run.id}
                  className="flex flex-1 flex-col items-center gap-1"
                  style={{ height: "100%" }}
                >
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {(run.passRate * 100).toFixed(0)}%
                  </span>
                  <div className="flex flex-1 w-full items-end">
                    <div
                      className="w-full rounded-t-md transition-all"
                      style={{
                        height: `${barHeight}%`,
                        background: barColor,
                        minHeight: "4px",
                      }}
                    />
                  </div>
                  <span
                    className="text-[9px] truncate max-w-full"
                    style={{ color: "var(--color-text-tertiary)" }}
                    title={run.date ? new Date(run.date).toLocaleString() : ""}
                  >
                    {run.date
                      ? new Date(run.date).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                        })
                      : "--"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent Eval Runs */}
      <h2 className="text-[16px] font-semibold mb-3">Recent Eval Runs</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Date</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Dataset</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Model</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Cases</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Pass Rate</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Score</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No eval runs recorded yet. Run the eval pipeline to populate this table.
                </td>
              </tr>
            ) : (
              recentRuns.map((run) => (
                <tr key={run.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>
                    {run.createdAt ? new Date(run.createdAt).toLocaleDateString() : "--"}
                  </td>
                  <td className="px-4 py-3 font-medium">{run.datasetName}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
                    >
                      {run.model}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <RunStatusBadge status={run.status} />
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {run.caseCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {run.passRate !== null ? (
                      <span
                        style={{
                          color:
                            run.passRate >= 0.9
                              ? "var(--color-success)"
                              : run.passRate >= 0.7
                                ? "var(--color-warning)"
                                : "var(--color-danger)",
                          fontWeight: 600,
                        }}
                      >
                        {(run.passRate * 100).toFixed(1)}%
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {run.avgScore !== null ? (
                      <span style={{ fontWeight: 600 }}>{run.avgScore.toFixed(2)}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Agent Coverage */}
      <h2 className="text-[16px] font-semibold mb-3">Agent Coverage</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
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
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Datasets</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Test Cases</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((agent) => {
              const reg = AGENT_REGISTRY[agent.agentId];
              return (
                <tr key={agent.agentId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">{agent.agentName}</td>
                  <td className="px-4 py-3">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                      style={{ background: "var(--color-bg-muted)", color: "var(--color-text-tertiary)" }}
                    >
                      {reg?.category || "unknown"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {agent.datasetCount}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {agent.caseCount}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {agent.caseCount > 0 ? (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "oklch(0.95 0.03 145)", color: "var(--color-success)" }}
                      >
                        COVERED
                      </span>
                    ) : (
                      <span
                        className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: "oklch(0.95 0.03 65)", color: "var(--color-warning)" }}
                      >
                        MISSING
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Grader Type Distribution */}
      <h2 className="text-[16px] font-semibold mb-3">Test Case Tags Distribution</h2>
      <div
        className="rounded-xl p-4"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        {graderDist.length === 0 ? (
          <div className="py-4 text-center text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            No tagged test cases yet
          </div>
        ) : (
          <div className="space-y-2.5">
            {graderDist.map((item) => {
              const maxCount = graderDist[0]?.count || 1;
              const pct = item.count / maxCount;
              return (
                <div key={item.tag}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span style={{ color: "var(--color-text-secondary)" }}>{item.tag}</span>
                    <span style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                      {item.count}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${Math.max(pct * 100, 2)}%`,
                        background: "var(--color-accent)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    completed: { bg: "oklch(0.95 0.03 145)", color: "var(--color-success)" },
    running: { bg: "var(--color-accent-soft)", color: "var(--color-accent)" },
    pending: { bg: "var(--color-bg-muted)", color: "var(--color-text-tertiary)" },
    failed: { bg: "oklch(0.95 0.03 25)", color: "var(--color-danger)" },
  };
  const s = styles[status] || styles.pending;
  return (
    <span
      className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ background: s.bg, color: s.color }}
    >
      {status.toUpperCase()}
    </span>
  );
}
