"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { Network, Loader2, Filter, Eye, EyeOff, RefreshCw, Info, ThumbsUp, ThumbsDown } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

interface GraphNode {
  id: string;
  name: string;
  entityType: string;
  summary: string | null;
  // Computed layout positions
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
}

interface GraphEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  relationType: string;
  fact: string;
  confidence: number;
  tValid: string | null;
  tInvalid: string | null;
  sourceType: string | null;
}

interface GraphStats {
  nodes: number;
  validEdges: number;
  invalidEdges: number;
  lastUpdated: string | null;
  typeBreakdown: Record<string, number>;
}

const NODE_COLORS: Record<string, string> = {
  person: "oklch(0.65 0.15 250)",
  company: "oklch(0.65 0.15 145)",
  deal: "oklch(0.65 0.15 30)",
  topic: "oklch(0.65 0.12 300)",
  event: "oklch(0.65 0.12 60)",
  email: "oklch(0.55 0.10 200)",
  meeting: "oklch(0.55 0.10 340)",
};

const NODE_RADIUS = 24;

export default function GraphExplorerPage() {
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [edges, setEdges] = useState<GraphEdge[]>([]);
  const [stats, setStats] = useState<GraphStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [showInvalid, setShowInvalid] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const fetchGraph = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [graphRes, statsRes] = await Promise.all([
        fetch(`/api/context-graph?limit=150&includeInvalid=${showInvalid}`),
        fetch("/api/context-graph/stats"),
      ]);
      if (graphRes.ok) {
        const data = await graphRes.json();
        // Apply simple force layout
        const laidOut = applyForceLayout(data.nodes, data.edges);
        setNodes(laidOut);
        setEdges(data.edges);
      } else {
        // The graph fetch is the load-bearing one; a 500 here used to fall
        // through to the "No graph data yet" empty state, making a backend
        // failure indistinguishable from an empty graph.
        setLoadError(true);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch {
      setLoadError(true);
    }
    setLoading(false);
  }, [showInvalid]);

  useEffect(() => { fetchGraph(); }, [fetchGraph]);

  // Simple force-directed layout (no d3 dependency)
  function applyForceLayout(rawNodes: GraphNode[], rawEdges: GraphEdge[]): GraphNode[] {
    const n = rawNodes.length;
    if (n === 0) return [];

    // Initialize positions in a circle
    const cx = 400, cy = 300, r = Math.min(250, n * 15);
    const positioned = rawNodes.map((node, i) => ({
      ...node,
      x: cx + r * Math.cos((2 * Math.PI * i) / n),
      y: cy + r * Math.sin((2 * Math.PI * i) / n),
      vx: 0,
      vy: 0,
    }));

    const nodeMap = new Map(positioned.map((n, i) => [n.id, i]));

    // Simple force simulation (50 iterations)
    for (let iter = 0; iter < 50; iter++) {
      const alpha = 1 - iter / 50;

      // Repulsion between all nodes
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = positioned[j].x! - positioned[i].x!;
          const dy = positioned[j].y! - positioned[i].y!;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = (200 * alpha) / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          positioned[i].vx! -= fx;
          positioned[i].vy! -= fy;
          positioned[j].vx! += fx;
          positioned[j].vy! += fy;
        }
      }

      // Attraction along edges
      for (const edge of rawEdges) {
        const si = nodeMap.get(edge.sourceNodeId);
        const ti = nodeMap.get(edge.targetNodeId);
        if (si === undefined || ti === undefined) continue;
        const dx = positioned[ti].x! - positioned[si].x!;
        const dy = positioned[ti].y! - positioned[si].y!;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (dist - 100) * 0.01 * alpha;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        positioned[si].vx! += fx;
        positioned[si].vy! += fy;
        positioned[ti].vx! -= fx;
        positioned[ti].vy! -= fy;
      }

      // Center gravity
      for (const node of positioned) {
        node.vx! += (cx - node.x!) * 0.01 * alpha;
        node.vy! += (cy - node.y!) * 0.01 * alpha;
      }

      // Apply velocities with damping
      for (const node of positioned) {
        node.x! += node.vx! * 0.8;
        node.y! += node.vy! * 0.8;
        node.vx! *= 0.5;
        node.vy! *= 0.5;
        // Bounds
        node.x = Math.max(30, Math.min(770, node.x!));
        node.y = Math.max(30, Math.min(570, node.y!));
      }
    }

    return positioned;
  }

  async function sendFeedback(edgeId: string, feedback: "up" | "down") {
    setFeedbackError(null);
    try {
      const res = await fetch("/api/context-graph/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ edgeId, feedback }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update edge confidence locally
        setEdges(prev => prev.map(e => {
          if (e.id !== edgeId) return e;
          return {
            ...e,
            confidence: data.newConfidence,
            tInvalid: data.invalidated ? new Date().toISOString() : e.tInvalid,
          };
        }));
      } else {
        // Was a silent no-op: a failed vote left no trace, so the user thought
        // it registered. Flag the offending edge so the panel can say so.
        setFeedbackError(edgeId);
      }
    } catch {
      setFeedbackError(edgeId);
    }
  }

  const filteredNodes = filterType ? nodes.filter(n => n.entityType === filterType) : nodes;
  const filteredNodeIds = new Set(filteredNodes.map(n => n.id));
  const filteredEdges = edges.filter(e =>
    filteredNodeIds.has(e.sourceNodeId) && filteredNodeIds.has(e.targetNodeId)
  );

  // Get edges for selected node
  const selectedEdges = selectedNode
    ? edges.filter(e => e.sourceNodeId === selectedNode.id || e.targetNodeId === selectedNode.id)
    : [];

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader icon={<Network size={15} />} title="Context Graph" subtitle="Loading..." />
        <div className="flex flex-1 items-center justify-center">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--color-accent)" }} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        icon={<Network size={15} />}
        title="Context Graph"
        subtitle={stats ? `${stats.nodes} entities, ${stats.validEdges} facts` : ""}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Graph canvas */}
        <div className="flex-1 overflow-hidden" style={{ background: "var(--color-bg-surface)" }}>
          {nodes.length === 0 ? (
            <div className="flex h-full items-center justify-center">
              {loadError ? (
                <EmptyState
                  variant="error"
                  title="Couldn't load the graph"
                  description="Something went wrong building your context graph. This is not an empty graph."
                  actionLabel="Retry"
                  onAction={fetchGraph}
                />
              ) : (
                <EmptyState
                  icon={<Network size={24} />}
                  title="No graph data yet"
                  description="The context graph builds automatically from emails, meetings, and notes. Connect your Gmail or manually ingest content."
                />
              )}
            </div>
          ) : (
            <>
              {/* Controls */}
              <div className="flex items-center gap-2 px-4 py-2"
                style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
                <Filter size={12} style={{ color: "var(--color-text-tertiary)" }} />
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>Filter:</span>
                {["all", ...Object.keys(stats?.typeBreakdown || {})].map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type === "all" ? null : type)}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium transition-all"
                    style={{
                      background: (type === "all" && !filterType) || filterType === type
                        ? NODE_COLORS[type] || "var(--color-accent)"
                        : "var(--color-bg-muted)",
                      color: (type === "all" && !filterType) || filterType === type
                        ? "white" : "var(--color-text-secondary)",
                    }}
                  >
                    {type} {type !== "all" && stats?.typeBreakdown[type] ? `(${stats.typeBreakdown[type]})` : ""}
                  </button>
                ))}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => setShowInvalid(!showInvalid)}
                    className="flex items-center gap-1 text-[10px]"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    {showInvalid ? <Eye size={11} /> : <EyeOff size={11} />}
                    {showInvalid ? "Showing invalidated" : "Hiding invalidated"}
                  </button>
                  <Button variant="ghost" size="sm" icon={<RefreshCw size={12} />} onClick={fetchGraph}>
                    Refresh
                  </Button>
                </div>
              </div>

              {/* SVG graph */}
              <svg
                ref={svgRef}
                viewBox="0 0 800 600"
                className="h-full w-full"
                style={{ cursor: "grab" }}
              >
                {/* Edges */}
                {filteredEdges.map(edge => {
                  const source = filteredNodes.find(n => n.id === edge.sourceNodeId);
                  const target = filteredNodes.find(n => n.id === edge.targetNodeId);
                  if (!source || !target) return null;
                  const isInvalid = !!edge.tInvalid;
                  const isSelected = selectedNode &&
                    (edge.sourceNodeId === selectedNode.id || edge.targetNodeId === selectedNode.id);

                  return (
                    <g key={edge.id}>
                      <line
                        x1={source.x} y1={source.y}
                        x2={target.x} y2={target.y}
                        stroke={isInvalid ? "oklch(0.7 0 0 / 0.2)" : isSelected ? "var(--color-accent)" : "oklch(0.7 0 0 / 0.4)"}
                        strokeWidth={isSelected ? 2 : 1}
                        strokeDasharray={isInvalid ? "4 2" : undefined}
                      />
                      {/* Edge label */}
                      <text
                        x={(source.x! + target.x!) / 2}
                        y={(source.y! + target.y!) / 2 - 4}
                        fontSize="7"
                        fill="oklch(0.6 0 0 / 0.6)"
                        textAnchor="middle"
                      >
                        {edge.relationType}
                      </text>
                    </g>
                  );
                })}

                {/* Nodes */}
                {filteredNodes.map(node => {
                  const color = NODE_COLORS[node.entityType] || "oklch(0.6 0.1 0)";
                  const isSelected = selectedNode?.id === node.id;

                  return (
                    <g
                      key={node.id}
                      onClick={() => setSelectedNode(isSelected ? null : node)}
                      style={{ cursor: "pointer" }}
                    >
                      <circle
                        cx={node.x} cy={node.y}
                        r={isSelected ? NODE_RADIUS + 4 : NODE_RADIUS}
                        fill={color}
                        opacity={isSelected ? 1 : 0.8}
                        stroke={isSelected ? "white" : "none"}
                        strokeWidth={isSelected ? 2 : 0}
                      />
                      <text
                        x={node.x} y={node.y! + 1}
                        fontSize="8"
                        fill="white"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{ pointerEvents: "none", fontWeight: 600 }}
                      >
                        {node.name.length > 12 ? node.name.slice(0, 11) + "…" : node.name}
                      </text>
                      <text
                        x={node.x} y={node.y! + NODE_RADIUS + 12}
                        fontSize="7"
                        fill="oklch(0.5 0 0)"
                        textAnchor="middle"
                        style={{ pointerEvents: "none" }}
                      >
                        {node.entityType}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </>
          )}
        </div>

        {/* Detail panel */}
        {selectedNode && (
          <div
            className="w-80 overflow-auto"
            style={{
              borderLeft: "1px solid var(--color-border-default)",
              background: "var(--color-bg-card)",
            }}
          >
            <div className="px-4 py-3" style={{ borderBottom: "0.5px solid var(--color-border-default)" }}>
              <div className="flex items-center gap-2">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ background: NODE_COLORS[selectedNode.entityType] }}
                />
                <span className="text-[14px] font-semibold"
                  style={{ color: "var(--color-text-primary)" }}>
                  {selectedNode.name}
                </span>
              </div>
              <span className="mt-1 block text-[11px]"
                style={{ color: "var(--color-text-tertiary)" }}>
                {selectedNode.entityType}
              </span>
              {selectedNode.summary && (
                <p className="mt-2 text-[12px]"
                  style={{ color: "var(--color-text-secondary)" }}>
                  {selectedNode.summary}
                </p>
              )}
            </div>

            {/* Connected facts */}
            <div className="px-4 py-3">
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
                style={{ color: "var(--color-text-tertiary)" }}>
                Facts ({selectedEdges.length})
              </h3>
              <div className="space-y-2">
                {selectedEdges.map(edge => (
                  <div key={edge.id} className="rounded-md p-2 text-[11px]"
                    style={{
                      background: "var(--color-bg-surface)",
                      border: "0.5px solid var(--color-border-default)",
                      opacity: edge.tInvalid ? 0.5 : 1,
                    }}>
                    <div className="flex items-center gap-1 mb-1">
                      <span className="rounded px-1 py-0.5 text-[9px] font-semibold"
                        style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}>
                        {edge.relationType}
                      </span>
                      {edge.tInvalid && (
                        <span className="text-[9px]" style={{ color: "oklch(0.6 0.2 25)" }}>
                          invalidated
                        </span>
                      )}
                      {edge.sourceType && (
                        <span className="ml-auto text-[9px]" style={{ color: "var(--color-text-muted)" }}>
                          via {edge.sourceType}
                        </span>
                      )}
                    </div>
                    <p style={{ color: "var(--color-text-primary)" }}>{edge.fact}</p>
                    <div className="mt-1.5 flex items-center gap-1">
                      {edge.tValid && (
                        <span className="text-[9px]" style={{ color: "var(--color-text-muted)" }}>
                          {new Date(edge.tValid).toLocaleDateString()} → {edge.tInvalid ? new Date(edge.tInvalid).toLocaleDateString() : "present"}
                        </span>
                      )}
                      <span className="text-[9px]" style={{ color: "var(--color-text-muted)" }}>
                        {((edge.confidence ?? 1) * 100).toFixed(0)}%
                      </span>
                      <div className="ml-auto flex items-center gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); sendFeedback(edge.id, "up"); }}
                          className="rounded p-0.5 transition-colors hover:bg-green-500/10"
                          title="This fact is correct"
                        >
                          <ThumbsUp size={10} style={{ color: "var(--color-text-muted)" }} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); sendFeedback(edge.id, "down"); }}
                          className="rounded p-0.5 transition-colors hover:bg-red-500/10"
                          title="This fact is wrong"
                        >
                          <ThumbsDown size={10} style={{ color: "var(--color-text-muted)" }} />
                        </button>
                      </div>
                    </div>
                    {feedbackError === edge.id && (
                      <p className="mt-1 text-[9px]" role="alert" style={{ color: "var(--color-error, #b91c1c)" }}>
                        Couldn&apos;t save your feedback — try again.
                      </p>
                    )}
                  </div>
                ))}
                {selectedEdges.length === 0 && (
                  <p className="text-[11px]" style={{ color: "var(--color-text-muted)" }}>
                    No facts connected to this entity
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
