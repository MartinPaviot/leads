"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ScopedChat } from "@/components/scoped-chat";

interface Deal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  summary: string | null;
  expectedCloseDate: string | null;
  properties: Record<string, unknown> | null;
  companyName: string | null;
}

interface Activity {
  id: string;
  activityType: string;
  channel: string | null;
  direction: string | null;
  summary: string | null;
  occurredAt: string;
}

export default function DealDetailPage() {
  const params = useParams();
  const dealId = params.id as string;
  const [deal, setDeal] = useState<Deal | null>(null);
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/opportunities/${dealId}`);
        if (res.ok) {
          const data = await res.json();
          setDeal(data.deal);
          setTimeline(data.timeline || []);
        }
      } catch {
        console.error("Failed to load deal");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [dealId]);

  if (loading) return <p className="p-6 text-sm text-[#5a5a70]">Loading...</p>;
  if (!deal) return <p className="p-6 text-sm text-red-400">Deal not found</p>;

  const stageColors: Record<string, string> = {
    lead: "bg-[#5a5a70]/20 text-[#8b8ba0]",
    qualification: "bg-blue-500/15 text-blue-400",
    demo: "bg-purple-500/15 text-purple-400",
    trial: "bg-amber-500/15 text-amber-400",
    proposal: "bg-orange-500/15 text-orange-400",
    negotiation: "bg-pink-500/15 text-pink-400",
    won: "bg-emerald-500/15 text-emerald-400",
    lost: "bg-red-500/15 text-red-400",
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto p-6">
        <Link href="/opportunities" className="text-xs text-[#5a5a70] hover:text-[#8b8ba0]">
          ← Back to Pipeline
        </Link>

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{deal.name}</h1>
          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium uppercase ${stageColors[deal.stage] || stageColors.lead}`}>
            {deal.stage}
          </span>
        </div>

        {deal.companyName && (
          <p className="mt-1 text-sm text-[#8b8ba0]">{deal.companyName}</p>
        )}

        {deal.summary && (
          <div className="mt-4 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4">
            <p className="text-[10px] uppercase tracking-wider text-[#5a5a70] mb-1">Summary</p>
            <p className="text-sm text-[#8b8ba0] leading-relaxed">{deal.summary}</p>
          </div>
        )}

        {/* G9: Structured Data Extraction */}
        {(() => {
          const props = deal.properties as Record<string, unknown> | null;
          if (!props?.extractedBudget) return null;
          return (
            <div className="mt-4 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-4">
              <p className="text-[10px] uppercase tracking-wider text-[#5a5a70] mb-2">Extracted Intelligence</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {props.extractedBudget ? <div><span className="text-[#5a5a70]">Budget:</span> <span className="text-[#e8e8ed]">{String(props.extractedBudget)}</span></div> : null}
                {props.extractedTeamSize ? <div><span className="text-[#5a5a70]">Team size:</span> <span className="text-[#e8e8ed]">{String(props.extractedTeamSize)}</span></div> : null}
                {props.extractedDecisionMaker ? <div><span className="text-[#5a5a70]">Decision maker:</span> <span className="text-[#e8e8ed]">{String(props.extractedDecisionMaker)}</span></div> : null}
              </div>
            </div>
          );
        })()}

        {/* G8: Deal Timeline */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
            Timeline
          </h2>
          {timeline.length === 0 ? (
            <p className="mt-3 text-sm text-[#5a5a70]">No interactions recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-0">
              {timeline.map((activity, i) => (
                <div key={activity.id} className="relative flex gap-3 pb-4">
                  {/* Vertical line */}
                  {i < timeline.length - 1 && (
                    <div className="absolute left-[7px] top-4 bottom-0 w-px bg-[#1e1f2a]" />
                  )}
                  {/* Dot */}
                  <div className={`mt-1.5 h-[14px] w-[14px] flex-shrink-0 rounded-full border-2 ${
                    activity.direction === "inbound"
                      ? "border-emerald-500 bg-emerald-500/20"
                      : "border-blue-500 bg-blue-500/20"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[#8b8ba0] uppercase">
                        {activity.activityType.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-[#5a5a70]">
                        {new Date(activity.occurredAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {activity.summary && (
                      <p className="mt-0.5 text-sm text-[#e8e8ed]">{activity.summary}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Scoped chat */}
        <div className="mt-8">
          <ScopedChat contextType="deal" contextId={dealId} contextLabel={deal.name} />
        </div>
      </div>

      {/* Right panel */}
      <div className="w-[280px] flex-shrink-0 border-l border-[#1e1f2a] p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">Deal details</h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-[#5a5a70]">Value</p>
            <p className="text-sm text-[#e8e8ed]">{deal.value ? `$${deal.value.toLocaleString()}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[#5a5a70]">Stage</p>
            <p className="text-sm text-[#e8e8ed] capitalize">{deal.stage}</p>
          </div>
          <div>
            <p className="text-xs text-[#5a5a70]">Expected Close</p>
            <p className="text-sm text-[#e8e8ed]">
              {deal.expectedCloseDate
                ? new Date(deal.expectedCloseDate).toLocaleDateString()
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#5a5a70]">Account</p>
            <p className="text-sm text-[#e8e8ed]">{deal.companyName || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// G9: Structured Data Extraction
function ExtractedIntel({ dealId, properties }: { dealId: string; properties: Record<string, unknown> | null }) {
  const intel = (properties?.extractedIntel as Record<string, string>) || {};
  const [extracting, setExtracting] = useState(false);
  const [data, setData] = useState(intel);

  const fields = [
    { key: "budget", label: "Budget", icon: "💰" },
    { key: "teamSize", label: "Team Size", icon: "👥" },
    { key: "currentCRM", label: "Current CRM", icon: "📋" },
    { key: "competitorTools", label: "Point Solutions", icon: "🔧" },
    { key: "decisionTimeline", label: "Timeline", icon: "📅" },
    { key: "painPoints", label: "Pain Points", icon: "🎯" },
  ];

  async function extractIntel() {
    setExtracting(true);
    try {
      const res = await fetch(`/api/opportunities/${dealId}/extract-intel`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setData(result.intel || {});
      }
    } catch {
      // Non-critical
    } finally {
      setExtracting(false);
    }
  }

  const hasData = Object.keys(data).length > 0;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[#5a5a70]">
          Deal Intelligence
        </h2>
        <button
          onClick={extractIntel}
          disabled={extracting}
          className="text-[10px] text-[#6366f1] hover:underline disabled:opacity-50"
        >
          {extracting ? "Extracting..." : hasData ? "Re-extract" : "Extract from interactions"}
        </button>
      </div>
      {hasData ? (
        <div className="mt-2 rounded-lg border border-[#1e1f2a] bg-[#12131a] p-3">
          <div className="grid grid-cols-2 gap-3">
            {fields.map((f) => (
              data[f.key] ? (
                <div key={f.key}>
                  <p className="text-[10px] text-[#5a5a70]">{f.icon} {f.label}</p>
                  <p className="text-sm text-[#e8e8ed]">{data[f.key]}</p>
                </div>
              ) : null
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-2 text-xs text-[#5a5a70]">No intelligence extracted yet. Click extract to analyze interactions.</p>
      )}
    </div>
  );
}
