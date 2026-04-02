"use client";

import { useState, useEffect, useCallback } from "react";
import { CircleDot, Plus, BarChart3, X, ChevronDown, ChevronUp } from "lucide-react";
import { STAGE_COLORS as STAGE_DOT_COLORS_IMPORTED, RISK_STYLES } from "@/lib/ui-utils";
import { usePipelineStages } from "@/hooks/use-custom-fields";
import type { PipelineStageDef } from "@/lib/custom-fields";

interface Analytics {
  totalDeals: number;
  activeDeals: number;
  totalPipelineValue: number;
  wonValue: number;
  wonCount: number;
  lostCount: number;
  winRate: number;
  avgDealValue: number;
  avgVelocityDays: number;
  valueByStage: Record<string, { count: number; value: number }>;
  funnel: Array<{ stage: string; count: number }>;
  riskSummary: { high: number; medium: number; low: number; none: number };
}

const STAGES = [
  "lead",
  "qualification",
  "demo",
  "trial",
  "proposal",
  "negotiation",
  "won",
  "lost",
] as const;

const STAGE_LABELS: Record<string, string> = {
  lead: "Lead",
  qualification: "Qualification",
  demo: "Demo",
  trial: "Trial",
  proposal: "Proposal",
  negotiation: "Negotiation",
  won: "Won",
  lost: "Lost",
};

const STAGE_DOT_COLORS = STAGE_DOT_COLORS_IMPORTED;

interface Deal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  companyId: string | null;
  summary: string | null;
  properties: Record<string, unknown> | null;
}

export default function OpportunitiesPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const { stages: pipelineStages } = usePipelineStages();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [creating, setCreating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [showAnalytics, setShowAnalytics] = useState(true);

  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch("/api/pipeline/analytics");
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
      // Analytics are non-critical
    }
  }, []);

  const fetchDeals = useCallback(async () => {
    try {
      const res = await fetch("/api/opportunities");
      if (res.ok) {
        const data = await res.json();
        setDeals(data.deals || []);
      }
    } catch {
      console.error("Failed to fetch deals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeals();
    fetchAnalytics();
  }, [fetchDeals, fetchAnalytics]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          value: newValue ? parseInt(newValue) : undefined,
        }),
      });
      if (res.ok) {
        setNewName("");
        setNewValue("");
        setShowCreate(false);
        fetchDeals();
      }
    } catch {
      console.error("Failed to create deal");
    } finally {
      setCreating(false);
    }
  }

  async function analyzeDeals() {
    if (deals.length === 0) return;
    setAnalyzing(true);
    try {
      const res = await fetch("/api/deals/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealIds: deals.map((d) => d.id) }),
      });
      if (res.ok) {
        await fetchDeals();
        await fetchAnalytics();
      }
    } catch {
      console.error("Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  function getRiskBorderColor(deal: Deal): string {
    const risk = (deal.properties as Record<string, unknown>)?.riskLevel as string;
    const style = RISK_STYLES[risk];
    return style ? style.text : "transparent";
  }

  // G17: Momentum indicator
  function hasMomentum(deal: Deal): boolean {
    const props = deal.properties as Record<string, unknown> | null;
    const activityCount = (props?.recentActivityCount as number) || 0;
    return activityCount >= 3;
  }

  function getRiskBadge(deal: Deal) {
    const risk = (deal.properties as Record<string, unknown>)?.riskLevel as string;
    if (!risk || risk === "none") return null;
    const style = RISK_STYLES[risk];
    if (!style) return null;
    return (
      <span className="rounded px-1 py-0.5 text-[8px] font-semibold uppercase"
        style={{ background: style.bg, color: style.text }}>
        {risk}
      </span>
    );
  }

  // Use dynamic pipeline stages from settings, with fallback to hardcoded STAGES
  const activeStages: Array<{ id: string; name: string; description: string }> =
    pipelineStages.length > 0
      ? pipelineStages.map((s) => ({ id: s.id, name: s.name, description: s.description }))
      : STAGES.map((s) => ({ id: s, name: STAGE_LABELS[s] || s, description: "" }));

  const dealsByStage = activeStages.reduce(
    (acc, stage) => {
      // Match deals by stage id OR stage name (case-insensitive) for flexibility
      acc[stage.id] = deals.filter((d) =>
        d.stage === stage.id || d.stage.toLowerCase() === stage.name.toLowerCase()
      );
      return acc;
    },
    {} as Record<string, Deal[]>
  );

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="flex h-full flex-col" style={{ background: "var(--color-bg-surface)" }}>
      {/* Page Header - 44px */}
      <div
        className="flex h-[44px] flex-shrink-0 items-center justify-between px-6"
        style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
      >
        <div className="flex items-center gap-3">
          <CircleDot size={16} style={{ color: "var(--color-accent)" }} />
          <h1 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Opportunities
          </h1>
          <span className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            {deals.length} deal{deals.length !== 1 ? "s" : ""}
            {totalValue > 0 && ` \u00b7 $${totalValue.toLocaleString()} pipeline`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {analytics && (
            <button
              onClick={() => setShowAnalytics(!showAnalytics)}
              className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{
                color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-default)",
              }}
            >
              <BarChart3 size={12} />
              Analytics
              {showAnalytics ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
            </button>
          )}
          <button
            onClick={analyzeDeals}
            disabled={analyzing || deals.length === 0}
            className="rounded-md px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 disabled:opacity-50"
            style={{
              color: "var(--color-text-primary)",
              border: "0.5px solid var(--color-border-default)",
            }}
          >
            {analyzing ? "Analyzing..." : "Analyze Pipeline"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90"
            style={{ background: "var(--color-accent)" }}
          >
            <Plus size={12} />
            Create Deal
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        {/* Create Deal Form */}
        {showCreate && (
          <form onSubmit={handleCreate} className="mb-4 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Deal name"
              autoFocus
              className="flex-1 rounded-md px-3 py-2 text-sm placeholder-opacity-50 focus:outline-none"
              style={{
                background: "var(--color-bg-surface)",
                color: "var(--color-text-primary)",
                border: "0.5px solid var(--color-border-default)",
              }}
            />
            <input
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value ($)"
              type="number"
              className="w-32 rounded-md px-3 py-2 text-sm placeholder-opacity-50 focus:outline-none"
              style={{
                background: "var(--color-bg-surface)",
                color: "var(--color-text-primary)",
                border: "0.5px solid var(--color-border-default)",
              }}
            />
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="rounded-md px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              style={{ background: "var(--color-accent)" }}
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="flex items-center gap-1 rounded-md px-3 py-2 text-sm"
              style={{
                color: "var(--color-text-secondary)",
                border: "0.5px solid var(--color-border-default)",
              }}
            >
              <X size={12} />
              Cancel
            </button>
          </form>
        )}

        {/* Analytics Panel */}
        {analytics && showAnalytics && (
          <div className="mb-4">
            <div className="mb-3 flex items-center justify-between">
              <h2
                className="text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-text-secondary)" }}
              >
                Pipeline Analytics
              </h2>
            </div>

            {/* KPI Cards */}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
              <div
                className="rounded-md p-3"
                style={{
                  background: "var(--color-bg-muted)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Pipeline Value
                </p>
                <p
                  className="mt-1 text-lg font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  ${analytics.totalPipelineValue.toLocaleString()}
                </p>
              </div>
              <div
                className="rounded-md p-3"
                style={{
                  background: "var(--color-bg-muted)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Won
                </p>
                <p
                  className="mt-1 text-lg font-semibold"
                  style={{ color: "var(--color-success)" }}
                >
                  ${analytics.wonValue.toLocaleString()}
                </p>
                <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {analytics.wonCount} deal{analytics.wonCount !== 1 ? "s" : ""}
                </p>
              </div>
              <div
                className="rounded-md p-3"
                style={{
                  background: "var(--color-bg-muted)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Win Rate
                </p>
                <p
                  className="mt-1 text-lg font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {analytics.winRate}%
                </p>
                <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {analytics.wonCount}W / {analytics.lostCount}L
                </p>
              </div>
              <div
                className="rounded-md p-3"
                style={{
                  background: "var(--color-bg-muted)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Avg Deal
                </p>
                <p
                  className="mt-1 text-lg font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  ${analytics.avgDealValue.toLocaleString()}
                </p>
              </div>
              <div
                className="rounded-md p-3"
                style={{
                  background: "var(--color-bg-muted)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Velocity
                </p>
                <p
                  className="mt-1 text-lg font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {analytics.avgVelocityDays}d
                </p>
                <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  avg to close
                </p>
              </div>
              <div
                className="rounded-md p-3"
                style={{
                  background: "var(--color-bg-muted)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <p
                  className="text-[10px] uppercase tracking-wider"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  At Risk
                </p>
                <div className="mt-1 flex items-baseline gap-2">
                  {analytics.riskSummary.high > 0 && (
                    <span className="text-lg font-semibold" style={{ color: "var(--color-error)" }}>
                      {analytics.riskSummary.high}
                    </span>
                  )}
                  {analytics.riskSummary.medium > 0 && (
                    <span className="text-lg font-semibold" style={{ color: "var(--color-warning)" }}>
                      {analytics.riskSummary.medium}
                    </span>
                  )}
                  {analytics.riskSummary.high === 0 && analytics.riskSummary.medium === 0 && (
                    <span className="text-lg font-semibold" style={{ color: "var(--color-success)" }}>0</span>
                  )}
                </div>
                <p className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {analytics.riskSummary.high}H {analytics.riskSummary.medium}M{" "}
                  {analytics.riskSummary.low}L
                </p>
              </div>
            </div>

            {/* Stage Value Bars */}
            <div
              className="rounded-md p-3"
              style={{
                background: "var(--color-bg-muted)",
                border: "0.5px solid var(--color-border-default)",
              }}
            >
              <p
                className="mb-2 text-[10px] uppercase tracking-wider"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                Value by Stage
              </p>
              <div className="space-y-1.5">
                {analytics.funnel.map((s) => {
                  const stageData = analytics.valueByStage[s.stage];
                  const maxValue = Math.max(
                    ...Object.values(analytics.valueByStage).map((v) => v.value),
                    1
                  );
                  const pct = stageData ? (stageData.value / maxValue) * 100 : 0;
                  return (
                    <div key={s.stage} className="flex items-center gap-2">
                      <span
                        className="w-24 text-right text-[10px]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {STAGE_LABELS[s.stage]}
                      </span>
                      <div
                        className="h-4 flex-1 overflow-hidden rounded"
                        style={{ background: "var(--color-bg-surface)" }}
                      >
                        <div
                          className="h-full rounded"
                          style={{
                            background: "var(--color-accent)",
                            width: `${Math.max(pct, stageData && stageData.count > 0 ? 2 : 0)}%`,
                          }}
                        />
                      </div>
                      <span
                        className="w-20 text-[10px]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {stageData ? `$${stageData.value.toLocaleString()}` : "$0"}
                      </span>
                      <span
                        className="w-8 text-[10px]"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {stageData?.count || 0}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Kanban Board */}
        {loading ? (
          <p className="mt-6 text-sm" style={{ color: "var(--color-text-tertiary)" }}>
            Loading...
          </p>
        ) : (
          <div className="flex flex-1 gap-3 overflow-x-auto">
            {activeStages.map((stage, stageIdx) => {
              const stageDeals = dealsByStage[stage.id] || [];
              // Dynamic dot color based on stage position
              const dotColor = STAGE_DOT_COLORS[stage.id as keyof typeof STAGE_DOT_COLORS]
                || (stageIdx < 2 ? "var(--color-text-tertiary)" : stageIdx < 4 ? "var(--color-warning)" : "var(--color-success)");
              return (
              <div
                key={stage.id}
                className="flex flex-shrink-0 flex-col rounded-md"
                style={{
                  width: 260,
                  background: "var(--color-bg-muted)",
                  border: "0.5px solid var(--color-border-default)",
                }}
              >
                <div
                  className="px-3 py-2"
                  style={{ borderBottom: "0.5px solid var(--color-border-default)" }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ background: dotColor }}
                      />
                      <span
                        className="text-xs font-semibold uppercase tracking-wider"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {stage.name}
                      </span>
                    </div>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs"
                      style={{
                        background: "var(--color-bg-surface)",
                        color: "var(--color-text-tertiary)",
                      }}
                    >
                      {stageDeals.length}
                    </span>
                  </div>
                  {stageDeals.reduce((sum, d) => sum + (d.value || 0), 0) > 0 && (
                    <p className="mt-0.5 text-[10px]" style={{ color: "var(--color-success)" }}>
                      $
                      {stageDeals
                        .reduce((sum, d) => sum + (d.value || 0), 0)
                        .toLocaleString()}
                    </p>
                  )}
                  {stage.description && (
                    <p className="mt-0.5 text-[9px]" style={{ color: "var(--color-text-muted)" }}>
                      {stage.description}
                    </p>
                  )}
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {stageDeals.map((deal) => (
                    <div
                      key={deal.id}
                      className="rounded-md p-3"
                      style={{
                        background: "var(--color-bg-surface)",
                        border: "0.5px solid var(--color-border-default)",
                        borderLeft: `2px solid ${getRiskBorderColor(deal)}`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <p
                          className="text-sm font-medium"
                          style={{ color: "var(--color-text-primary)" }}
                        >
                          {hasMomentum(deal) && <span title="High momentum">&#x26A1;</span>}
                          {deal.name}
                        </p>
                        {getRiskBadge(deal)}
                      </div>
                      {deal.value != null && deal.value > 0 && (
                        <p className="mt-1 text-xs" style={{ color: "var(--color-success)" }}>
                          ${deal.value.toLocaleString()}
                        </p>
                      )}
                      {deal.summary && (
                        <p
                          className="mt-1 line-clamp-2 text-[10px]"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          {deal.summary}
                        </p>
                      )}
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <p
                      className="py-4 text-center text-xs"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      No deals
                    </p>
                  )}
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
