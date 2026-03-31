"use client";

import { useState, useEffect, useCallback } from "react";

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

  function getRiskColor(deal: Deal): string {
    const risk = (deal.properties as Record<string, unknown>)?.riskLevel as string;
    if (risk === "high") return "border-l-red-500";
    if (risk === "medium") return "border-l-amber-500";
    if (risk === "low") return "border-l-emerald-500";
    return "border-l-transparent";
  }

  function getRiskBadge(deal: Deal) {
    const risk = (deal.properties as Record<string, unknown>)?.riskLevel as string;
    if (!risk || risk === "none") return null;
    const colors: Record<string, string> = {
      high: "bg-red-500/15 text-red-400",
      medium: "bg-amber-500/15 text-amber-400",
      low: "bg-emerald-500/15 text-emerald-400",
    };
    return (
      <span className={`rounded px-1 py-0.5 text-[8px] font-semibold uppercase ${colors[risk] || ""}`}>
        {risk}
      </span>
    );
  }

  const dealsByStage = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = deals.filter((d) => d.stage === stage);
      return acc;
    },
    {} as Record<string, Deal[]>
  );

  const totalValue = deals.reduce((sum, d) => sum + (d.value || 0), 0);

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Opportunities</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {deals.length} deal{deals.length !== 1 ? "s" : ""}
            {totalValue > 0 && ` · $${totalValue.toLocaleString()} pipeline`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={analyzeDeals}
            disabled={analyzing || deals.length === 0}
            className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm font-medium text-[#e8e8ed] hover:bg-[#1e1f2a] disabled:opacity-50"
          >
            {analyzing ? "Analyzing..." : "Analyze Pipeline"}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6]"
          >
            + Create Deal
          </button>
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="mt-4 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Deal name"
            autoFocus
            className="flex-1 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
          />
          <input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder="Value ($)"
            type="number"
            className="w-32 rounded-lg border border-[#1e1f2a] bg-[#12131a] px-3 py-2 text-sm text-[#e8e8ed] placeholder-[#5a5a70] focus:border-[#6366f1] focus:outline-none"
          />
          <button
            type="submit"
            disabled={creating || !newName.trim()}
            className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(false)}
            className="rounded-lg border border-[#1e1f2a] px-4 py-2 text-sm text-[#8b8ba0]"
          >
            Cancel
          </button>
        </form>
      )}

      {/* Analytics Panel */}
      {analytics && showAnalytics && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-[#8b8ba0] uppercase tracking-wider">Pipeline Analytics</h2>
            <button
              onClick={() => setShowAnalytics(false)}
              className="text-xs text-[#5a5a70] hover:text-[#8b8ba0]"
            >
              Hide
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-4">
            <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#5a5a70]">Pipeline Value</p>
              <p className="mt-1 text-lg font-semibold text-[#e8e8ed]">
                ${analytics.totalPipelineValue.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#5a5a70]">Won</p>
              <p className="mt-1 text-lg font-semibold text-[#22c55e]">
                ${analytics.wonValue.toLocaleString()}
              </p>
              <p className="text-[10px] text-[#5a5a70]">{analytics.wonCount} deal{analytics.wonCount !== 1 ? "s" : ""}</p>
            </div>
            <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#5a5a70]">Win Rate</p>
              <p className="mt-1 text-lg font-semibold text-[#e8e8ed]">
                {analytics.winRate}%
              </p>
              <p className="text-[10px] text-[#5a5a70]">{analytics.wonCount}W / {analytics.lostCount}L</p>
            </div>
            <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#5a5a70]">Avg Deal</p>
              <p className="mt-1 text-lg font-semibold text-[#e8e8ed]">
                ${analytics.avgDealValue.toLocaleString()}
              </p>
            </div>
            <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#5a5a70]">Velocity</p>
              <p className="mt-1 text-lg font-semibold text-[#e8e8ed]">
                {analytics.avgVelocityDays}d
              </p>
              <p className="text-[10px] text-[#5a5a70]">avg to close</p>
            </div>
            <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#5a5a70]">At Risk</p>
              <div className="mt-1 flex items-baseline gap-2">
                {analytics.riskSummary.high > 0 && (
                  <span className="text-lg font-semibold text-red-400">{analytics.riskSummary.high}</span>
                )}
                {analytics.riskSummary.medium > 0 && (
                  <span className="text-lg font-semibold text-amber-400">{analytics.riskSummary.medium}</span>
                )}
                {analytics.riskSummary.high === 0 && analytics.riskSummary.medium === 0 && (
                  <span className="text-lg font-semibold text-emerald-400">0</span>
                )}
              </div>
              <p className="text-[10px] text-[#5a5a70]">
                {analytics.riskSummary.high}H {analytics.riskSummary.medium}M {analytics.riskSummary.low}L
              </p>
            </div>
          </div>

          {/* Stage Value Bars */}
          <div className="rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
            <p className="text-[10px] uppercase tracking-wider text-[#5a5a70] mb-2">Value by Stage</p>
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
                    <span className="w-24 text-right text-[10px] text-[#8b8ba0]">
                      {STAGE_LABELS[s.stage]}
                    </span>
                    <div className="flex-1 h-4 rounded bg-[#1e1f2a] overflow-hidden">
                      <div
                        className="h-full rounded bg-[#6366f1]"
                        style={{ width: `${Math.max(pct, stageData && stageData.count > 0 ? 2 : 0)}%` }}
                      />
                    </div>
                    <span className="w-20 text-[10px] text-[#8b8ba0]">
                      {stageData ? `$${stageData.value.toLocaleString()}` : "$0"}
                    </span>
                    <span className="w-8 text-[10px] text-[#5a5a70]">
                      {stageData?.count || 0}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!showAnalytics && analytics && (
        <button
          onClick={() => setShowAnalytics(true)}
          className="mt-2 text-xs text-[#5a5a70] hover:text-[#8b8ba0]"
        >
          Show analytics
        </button>
      )}

      {loading ? (
        <p className="mt-6 text-sm text-[#5a5a70]">Loading...</p>
      ) : (
        <div className="mt-6 flex flex-1 gap-3 overflow-x-auto">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="flex w-[220px] flex-shrink-0 flex-col rounded-lg border border-[#1e1f2a] bg-[#12131a]"
            >
              <div className="flex items-center justify-between border-b border-[#1e1f2a] px-3 py-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[#8b8ba0]">
                  {STAGE_LABELS[stage]}
                </span>
                <span className="rounded-full bg-[#1e1f2a] px-2 py-0.5 text-xs text-[#5a5a70]">
                  {dealsByStage[stage].length}
                </span>
              </div>
              <div className="flex-1 space-y-2 p-2">
                {dealsByStage[stage].map((deal) => (
                  <div
                    key={deal.id}
                    className={`rounded-lg border border-[#1e1f2a] border-l-2 bg-[#0a0b0f] p-3 ${getRiskColor(deal)}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-sm font-medium text-[#e8e8ed]">{deal.name}</p>
                      {getRiskBadge(deal)}
                    </div>
                    {deal.value != null && deal.value > 0 && (
                      <p className="mt-1 text-xs text-[#22c55e]">
                        ${deal.value.toLocaleString()}
                      </p>
                    )}
                    {deal.summary && (
                      <p className="mt-1 text-[10px] text-[#5a5a70] line-clamp-2">
                        {deal.summary}
                      </p>
                    )}
                  </div>
                ))}
                {dealsByStage[stage].length === 0 && (
                  <p className="py-4 text-center text-xs text-[#5a5a70]">No deals</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
