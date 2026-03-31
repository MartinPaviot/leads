"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Action {
  action: string;
  why: string;
  dealName: string | null;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
}

interface Insight {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "info";
  category: "alert" | "trend" | "pattern" | "opportunity";
  suggestedAction: string;
}

export default function UpNextPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const [actions, setActions] = useState<Action[]>([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);

  useEffect(() => {
    fetch("/api/insights")
      .then((res) => (res.ok ? res.json() : { insights: [] }))
      .then((data) => setInsights(data.insights || []))
      .catch(() => {});
  }, []);

  async function fetchActions() {
    setLoadingActions(true);
    try {
      const res = await fetch("/api/actions");
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions || []);
      }
    } catch {
      console.error("Failed to fetch actions");
    } finally {
      setLoadingActions(false);
    }
  }

  const priorityColors: Record<string, string> = {
    critical: "border-l-red-500 bg-red-500/5",
    high: "border-l-amber-500 bg-amber-500/5",
    medium: "border-l-blue-500 bg-blue-500/5",
    low: "border-l-[#5a5a70] bg-[#1e1f2a]/30",
  };

  const priorityLabels: Record<string, string> = {
    critical: "text-red-400",
    high: "text-amber-400",
    medium: "text-blue-400",
    low: "text-[#5a5a70]",
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-auto p-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Up next</h1>
            <p className="mt-1 text-sm text-[#8b8ba0]">{today}</p>
          </div>
          <button
            onClick={fetchActions}
            disabled={loadingActions}
            className="rounded-lg bg-[#6366f1] px-4 py-2 text-sm font-medium text-white hover:bg-[#5558e6] disabled:opacity-50"
          >
            {loadingActions ? "Loading..." : actions.length > 0 ? "Refresh Actions" : "Get AI Actions"}
          </button>
        </div>

        {/* Prioritized Actions */}
        {actions.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
              Prioritized Actions
            </h2>
            <div className="mt-3 space-y-2">
              {actions.map((action, i) => (
                <div
                  key={i}
                  className={`rounded-lg border border-[#1e1f2a] border-l-2 p-4 ${priorityColors[action.priority] || ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-[#e8e8ed]">{action.action}</p>
                    <span className={`whitespace-nowrap text-[10px] font-semibold uppercase ${priorityLabels[action.priority] || ""}`}>
                      {action.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[#5a5a70]">{action.why}</p>
                  {action.dealName && (
                    <p className="mt-1 text-xs text-[#6366f1]">{action.dealName}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Proactive Insights */}
        {insights.length > 0 && (
          <div className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
              Insights
            </h2>
            <div className="mt-3 space-y-2">
              {insights.slice(0, 5).map((insight) => {
                const severityStyles: Record<string, string> = {
                  critical: "border-l-red-500 bg-red-500/5",
                  high: "border-l-amber-500 bg-amber-500/5",
                  medium: "border-l-blue-500 bg-blue-500/5",
                  info: "border-l-emerald-500 bg-emerald-500/5",
                };
                const categoryIcons: Record<string, string> = {
                  alert: "!",
                  trend: "~",
                  pattern: "#",
                  opportunity: "+",
                };
                const severityLabels: Record<string, string> = {
                  critical: "text-red-400",
                  high: "text-amber-400",
                  medium: "text-blue-400",
                  info: "text-emerald-400",
                };
                return (
                  <div
                    key={insight.id}
                    className={`rounded-lg border border-[#1e1f2a] border-l-2 p-3 ${severityStyles[insight.severity] || ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-[10px] font-bold text-[#8b8ba0] bg-[#1e1f2a]">
                        {categoryIcons[insight.category] || "?"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-medium text-[#e8e8ed]">{insight.title}</p>
                          <span className={`whitespace-nowrap text-[10px] font-semibold uppercase ${severityLabels[insight.severity] || ""}`}>
                            {insight.category}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-[#5a5a70]">{insight.description}</p>
                        <p className="mt-1 text-xs text-[#6366f1]">{insight.suggestedAction}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8">
          <h2 className="text-sm font-semibold">Meetings</h2>
          <p className="mt-2 text-sm text-[#5a5a70]">No meetings today</p>
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold">Tasks</h2>
          <p className="mt-2 text-sm text-[#5a5a70]">No tasks due today</p>
        </div>
      </div>

      <div className="border-t border-[#1e1f2a] p-4">
        <Link
          href="/chat"
          className="flex w-full items-center rounded-lg border border-[#1e1f2a] bg-[#12131a] px-4 py-2.5 text-sm text-[#5a5a70] hover:border-[#6366f1]"
        >
          Ask LeadSens...
        </Link>
      </div>
    </div>
  );
}
