import { db, agentTraces, agentPromptVersions, agentFailurePatterns } from "../../../lib/db";
import { desc, eq, sql, gte, count, and } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";
import { AGENT_REGISTRY } from "@web/lib/agent-registry";

export const dynamic = "force-dynamic";

async function getPromptVersions() {
  return db
    .select({
      id: agentPromptVersions.id,
      agentId: agentPromptVersions.agentId,
      version: agentPromptVersions.version,
      isActive: agentPromptVersions.isActive,
      evalScore: agentPromptVersions.evalScore,
      evalPassRate: agentPromptVersions.evalPassRate,
      changeReason: agentPromptVersions.changeReason,
      createdAt: agentPromptVersions.createdAt,
    })
    .from(agentPromptVersions)
    .orderBy(desc(agentPromptVersions.createdAt))
    .limit(50);
}

async function getLowScoringTraces(since: Date) {
  return db
    .select({
      id: agentTraces.id,
      agentId: agentTraces.agentId,
      input: agentTraces.input,
      output: agentTraces.output,
      evalScore: agentTraces.evalScore,
      status: agentTraces.status,
      errorMessage: agentTraces.errorMessage,
      createdAt: agentTraces.createdAt,
    })
    .from(agentTraces)
    .where(sql`${agentTraces.createdAt} >= ${since} AND (${agentTraces.evalScore} < 0.5 OR ${agentTraces.status} IN ('error', 'timeout'))`)
    .orderBy(desc(agentTraces.createdAt))
    .limit(30);
}

async function getActivePatterns() {
  return db
    .select({
      id: agentFailurePatterns.id,
      agentId: agentFailurePatterns.agentId,
      patternType: agentFailurePatterns.patternType,
      description: agentFailurePatterns.description,
      frequency: agentFailurePatterns.frequency,
      resolution: agentFailurePatterns.resolution,
      createdAt: agentFailurePatterns.createdAt,
    })
    .from(agentFailurePatterns)
    .where(sql`${agentFailurePatterns.resolvedAt} IS NULL`)
    .orderBy(desc(agentFailurePatterns.frequency))
    .limit(20);
}

async function getQualityStats(since: Date) {
  const rows = await db
    .select({
      agentId: agentTraces.agentId,
      avgScore: sql<number>`avg(${agentTraces.evalScore})`,
      evalCount: sql<number>`count(${agentTraces.evalScore})`,
      lowCount: sql<number>`count(*) filter (where ${agentTraces.evalScore} < 0.5)`,
    })
    .from(agentTraces)
    .where(sql`${agentTraces.createdAt} >= ${since} AND ${agentTraces.evalScore} IS NOT NULL`)
    .groupBy(agentTraces.agentId)
    .orderBy(desc(sql`avg(${agentTraces.evalScore})`));

  return rows;
}

export default async function FlywheelPage() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days
  const [versions, lowScoring, patterns, qualityStats] = await Promise.all([
    getPromptVersions(),
    getLowScoringTraces(since),
    getActivePatterns(),
    getQualityStats(since),
  ]);

  const totalVersions = versions.length;
  const activeVersions = versions.filter((v) => v.isActive).length;

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Flywheel
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Self-improving agent system &middot; Last 7 days
      </p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Prompt Versions" value={totalVersions} subtitle={`${activeVersions} active`} />
        <StatCard label="Low-Scoring Traces" value={lowScoring.length} status={lowScoring.length > 10 ? "warning" : "healthy"} />
        <StatCard label="Active Patterns" value={patterns.length} status={patterns.length > 5 ? "warning" : "healthy"} />
        <StatCard label="Agents Evaluated" value={qualityStats.length} />
      </div>

      {/* Quality by agent */}
      <h2 className="text-[16px] font-semibold mb-3">Quality by Agent</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Agent</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Score</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Evaluated</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Low Scoring</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Threshold</th>
            </tr>
          </thead>
          <tbody>
            {qualityStats.map((s) => {
              const reg = AGENT_REGISTRY[s.agentId];
              const avg = Number(s.avgScore);
              const threshold = reg?.qualityThreshold || 0.7;
              return (
                <tr key={s.agentId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">{reg?.name || s.agentId}</td>
                  <td className="px-4 py-3 text-right">
                    <span style={{ color: avg < threshold ? "var(--color-danger)" : "var(--color-success)", fontWeight: 600 }}>
                      {avg.toFixed(2)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>{Number(s.evalCount)}</td>
                  <td className="px-4 py-3 text-right">
                    <span style={{ color: Number(s.lowCount) > 0 ? "var(--color-warning)" : "var(--color-text-tertiary)" }}>
                      {Number(s.lowCount)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>{threshold}</td>
                </tr>
              );
            })}
            {qualityStats.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No eval data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Prompt Versions */}
      <h2 className="text-[16px] font-semibold mb-3">Prompt Versions</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Agent</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Version</th>
              <th className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Active</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Eval Score</th>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Change Reason</th>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Created</th>
            </tr>
          </thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-3 py-2 font-medium">{AGENT_REGISTRY[v.agentId]?.name || v.agentId}</td>
                <td className="px-3 py-2 text-right">v{v.version}</td>
                <td className="px-3 py-2 text-center">
                  {v.isActive ? (
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: "oklch(0.95 0.03 145)", color: "var(--color-success)" }}>ACTIVE</span>
                  ) : (
                    <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">{v.evalScore ? Number(v.evalScore).toFixed(2) : "--"}</td>
                <td className="px-3 py-2 max-w-[300px] truncate" style={{ color: "var(--color-text-secondary)" }}>{v.changeReason || "--"}</td>
                <td className="px-3 py-2" style={{ color: "var(--color-text-tertiary)" }}>{v.createdAt ? new Date(v.createdAt).toLocaleDateString() : "--"}</td>
              </tr>
            ))}
            {versions.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No prompt versions yet — flywheel hasn&apos;t run</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Low-scoring traces */}
      <h2 className="text-[16px] font-semibold mb-3">Low-Scoring Traces</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Agent</th>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Input</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Score</th>
              <th className="px-3 py-2.5 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Error</th>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {lowScoring.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-3 py-2 font-medium">{AGENT_REGISTRY[t.agentId]?.name || t.agentId}</td>
                <td className="px-3 py-2 max-w-[250px] truncate">{t.input?.slice(0, 60) || "--"}</td>
                <td className="px-3 py-2 text-right">
                  <span style={{ color: "var(--color-danger)", fontWeight: 600 }}>
                    {t.evalScore !== null ? Number(t.evalScore).toFixed(2) : "--"}
                  </span>
                </td>
                <td className="px-3 py-2 text-center">
                  <span className="rounded-md px-1.5 py-0.5 text-[10px] font-medium" style={{
                    background: t.status === "error" ? "oklch(0.95 0.03 25)" : "var(--color-bg-muted)",
                    color: t.status === "error" ? "var(--color-danger)" : "var(--color-text-tertiary)",
                  }}>
                    {t.status}
                  </span>
                </td>
                <td className="px-3 py-2 max-w-[200px] truncate" style={{ color: "var(--color-text-tertiary)" }}>
                  {t.errorMessage?.slice(0, 50) || "--"}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--color-text-tertiary)" }}>
                  {t.createdAt ? new Date(t.createdAt).toLocaleString() : "--"}
                </td>
              </tr>
            ))}
            {lowScoring.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No low-scoring traces — all agents performing well</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
