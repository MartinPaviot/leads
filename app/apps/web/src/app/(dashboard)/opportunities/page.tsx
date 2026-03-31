"use client";

import { useState, useEffect } from "react";

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
}

export default function OpportunitiesPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeals();
  }, []);

  async function fetchDeals() {
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
  }

  const dealsByStage = STAGES.reduce(
    (acc, stage) => {
      acc[stage] = deals.filter((d) => d.stage === stage);
      return acc;
    },
    {} as Record<string, Deal[]>
  );

  return (
    <div className="flex h-full flex-col p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Opportunities</h1>
          <p className="mt-1 text-sm text-[#5a5a70]">
            {deals.length} deal{deals.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-[#5a5a70]">Loading...</p>
      ) : (
        <div className="mt-6 flex flex-1 gap-3 overflow-x-auto">
          {STAGES.map((stage) => (
            <div
              key={stage}
              className="flex w-[200px] flex-shrink-0 flex-col rounded-lg border border-[#1e1f2a] bg-[#12131a]"
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
                    className="rounded-lg border border-[#1e1f2a] bg-[#0a0b0f] p-3"
                  >
                    <p className="text-sm font-medium text-[#e8e8ed]">
                      {deal.name}
                    </p>
                    {deal.value && (
                      <p className="mt-1 text-xs text-[#22c55e]">
                        ${deal.value.toLocaleString()}
                      </p>
                    )}
                  </div>
                ))}
                {dealsByStage[stage].length === 0 && (
                  <p className="py-4 text-center text-xs text-[#5a5a70]">
                    No deals
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
