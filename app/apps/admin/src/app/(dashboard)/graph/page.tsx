import { db, contextGraphNodes, contextGraphEdges } from "../../../lib/db";
import { desc, sql, count, eq } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";

export const dynamic = "force-dynamic";

async function getNodeStats() {
  return db
    .select({
      entityType: contextGraphNodes.entityType,
      count: count(),
    })
    .from(contextGraphNodes)
    .groupBy(contextGraphNodes.entityType)
    .orderBy(desc(count()));
}

async function getEdgeStats() {
  return db
    .select({
      relationType: contextGraphEdges.relationType,
      count: count(),
    })
    .from(contextGraphEdges)
    .groupBy(contextGraphEdges.relationType)
    .orderBy(desc(count()));
}

async function getAvgConfidence() {
  const [row] = await db
    .select({
      avg: sql<number>`avg(${contextGraphEdges.confidence})`,
    })
    .from(contextGraphEdges);
  return row?.avg ? Number(row.avg) : null;
}

async function getLastIngestion() {
  const [row] = await db
    .select({
      lastCreated: sql<string>`max(${contextGraphNodes.createdAt})`,
    })
    .from(contextGraphNodes);
  return row?.lastCreated ? new Date(row.lastCreated) : null;
}

async function getRecentNodes() {
  return db
    .select({
      id: contextGraphNodes.id,
      name: contextGraphNodes.name,
      entityType: contextGraphNodes.entityType,
      summary: contextGraphNodes.summary,
      createdAt: contextGraphNodes.createdAt,
    })
    .from(contextGraphNodes)
    .orderBy(desc(contextGraphNodes.createdAt))
    .limit(50);
}

async function getRecentEdges() {
  const sourceNode = db
    .select({ id: contextGraphNodes.id, name: contextGraphNodes.name })
    .from(contextGraphNodes)
    .as("sourceNode");
  const targetNode = db
    .select({ id: contextGraphNodes.id, name: contextGraphNodes.name })
    .from(contextGraphNodes)
    .as("targetNode");

  return db
    .select({
      id: contextGraphEdges.id,
      sourceName: sourceNode.name,
      targetName: targetNode.name,
      relationType: contextGraphEdges.relationType,
      fact: contextGraphEdges.fact,
      confidence: contextGraphEdges.confidence,
      tValid: contextGraphEdges.tValid,
      tInvalid: contextGraphEdges.tInvalid,
      createdAt: contextGraphEdges.createdAt,
    })
    .from(contextGraphEdges)
    .leftJoin(sourceNode, eq(contextGraphEdges.sourceNodeId, sourceNode.id))
    .leftJoin(targetNode, eq(contextGraphEdges.targetNodeId, targetNode.id))
    .orderBy(desc(contextGraphEdges.createdAt))
    .limit(50);
}

export default async function GraphPage() {
  const [nodeStats, edgeStats, avgConfidence, lastIngestion, recentNodes, recentEdges] =
    await Promise.all([
      getNodeStats(),
      getEdgeStats(),
      getAvgConfidence(),
      getLastIngestion(),
      getRecentNodes(),
      getRecentEdges(),
    ]);

  const totalNodes = nodeStats.reduce((sum, r) => sum + Number(r.count), 0);
  const totalEdges = edgeStats.reduce((sum, r) => sum + Number(r.count), 0);

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Context Graph
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Knowledge graph nodes, edges &amp; relationships
      </p>

      {/* Overview Stats */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Nodes" value={totalNodes} />
        <StatCard label="Total Edges" value={totalEdges} />
        <StatCard
          label="Avg Confidence"
          value={avgConfidence !== null ? avgConfidence.toFixed(2) : "--"}
          status={
            avgConfidence === null
              ? undefined
              : avgConfidence >= 0.8
                ? "healthy"
                : avgConfidence >= 0.5
                  ? "warning"
                  : "critical"
          }
        />
        <StatCard
          label="Last Ingestion"
          value={lastIngestion ? lastIngestion.toLocaleDateString() : "--"}
          subtitle={lastIngestion ? lastIngestion.toLocaleTimeString() : "No data yet"}
        />
      </div>

      {/* Nodes by Entity Type */}
      <h2 className="text-[16px] font-semibold mb-3">Nodes by Entity Type</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Entity Type</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {nodeStats.map((row) => (
              <tr key={row.entityType} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium capitalize">{row.entityType}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{Number(row.count)}</td>
              </tr>
            ))}
            {nodeStats.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No nodes yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edges by Relation Type */}
      <h2 className="text-[16px] font-semibold mb-3">Edges by Relation Type</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Relation Type</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Count</th>
            </tr>
          </thead>
          <tbody>
            {edgeStats.map((row) => (
              <tr key={row.relationType} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{row.relationType}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{Number(row.count)}</td>
              </tr>
            ))}
            {edgeStats.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No edges yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Nodes */}
      <h2 className="text-[16px] font-semibold mb-3">Recent Nodes</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Name</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Entity Type</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Summary</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Created At</th>
            </tr>
          </thead>
          <tbody>
            {recentNodes.map((node) => (
              <tr key={node.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{node.name}</td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-md px-2 py-0.5 text-[11px] font-medium capitalize"
                    style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
                  >
                    {node.entityType}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[300px] truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {node.summary || "--"}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-tertiary)" }}>
                  {node.createdAt ? new Date(node.createdAt).toLocaleString() : "--"}
                </td>
              </tr>
            ))}
            {recentNodes.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No nodes yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Recent Edges */}
      <h2 className="text-[16px] font-semibold mb-3">Recent Edges</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Source &rarr; Target</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Relation Type</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Fact</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Confidence</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Valid From</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Valid To</th>
            </tr>
          </thead>
          <tbody>
            {recentEdges.map((edge) => (
              <tr key={edge.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">
                  {edge.sourceName || "?"} &rarr; {edge.targetName || "?"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
                  >
                    {edge.relationType}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-[250px] truncate" style={{ color: "var(--color-text-secondary)" }}>
                  {edge.fact}
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    style={{
                      fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                      color:
                        edge.confidence !== null && Number(edge.confidence) >= 0.8
                          ? "var(--color-success)"
                          : edge.confidence !== null && Number(edge.confidence) >= 0.5
                            ? "var(--color-warning)"
                            : "var(--color-danger)",
                    }}
                  >
                    {edge.confidence !== null ? Number(edge.confidence).toFixed(2) : "--"}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-tertiary)" }}>
                  {edge.tValid ? new Date(edge.tValid).toLocaleDateString() : "--"}
                </td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-tertiary)" }}>
                  {edge.tInvalid ? new Date(edge.tInvalid).toLocaleDateString() : "current"}
                </td>
              </tr>
            ))}
            {recentEdges.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No edges yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
