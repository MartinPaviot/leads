"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Gauge, Sparkles } from "lucide-react";
import { ScopedChat } from "@/components/scoped-chat";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { useToast } from "@/components/ui/toast";

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

interface HealthData {
  score: number;
  band: "strong" | "ok" | "at-risk" | "stalled" | string;
  components: {
    engagement: { score: number; rationale: string };
    freshness: { score: number; rationale: string };
    completeness: { score: number; rationale: string };
  };
}

interface StageSuggestion {
  next: string;
  reason: string;
  confidence: "low" | "medium" | "high";
}

export default function DealDetailPage() {
  const params = useParams();
  const { toast } = useToast();
  const dealId = params.id as string;
  const [deal, setDeal] = useState<Deal | null>(null);
  const [timeline, setTimeline] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  // Y1/Y2/Y3 — detail-panel data (loaded in parallel after the deal)
  const [narrative, setNarrative] = useState<string[] | null>(null);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [suggestion, setSuggestion] = useState<StageSuggestion | null>(null);
  const [currentStageFromSuggestion, setCurrentStageFromSuggestion] = useState<string | null>(null);
  const [applyingStage, setApplyingStage] = useState(false);
  const [intelLoaded, setIntelLoaded] = useState(false);

  const fetchIntel = useCallback(async () => {
    try {
      const [timelineRes, healthRes, progressRes] = await Promise.all([
        fetch(`/api/opportunities/${dealId}/timeline`),
        fetch(`/api/opportunities/${dealId}/health`),
        fetch(`/api/opportunities/${dealId}/auto-progress`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      ]);
      if (timelineRes.ok) {
        const d = await timelineRes.json();
        setNarrative(d.narrative || null);
      }
      if (healthRes.ok) {
        setHealth(await healthRes.json());
      }
      if (progressRes.ok) {
        const d = await progressRes.json();
        setSuggestion(d.suggestion || null);
        setCurrentStageFromSuggestion(d.currentStage || null);
      }
    } catch (e) {
      console.warn("opps-detail: intel fetch failed", e);
    } finally {
      setIntelLoaded(true);
    }
  }, [dealId]);

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
    fetchIntel();
  }, [dealId, fetchIntel]);

  async function applySuggestion() {
    if (!suggestion) return;
    setApplyingStage(true);
    try {
      const res = await fetch(`/api/opportunities/${dealId}/auto-progress`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast((body as { error?: string }).error || "Failed to advance stage.", "error");
        return;
      }
      toast(`Advanced to ${suggestion.next}.`, "success");
      setDeal((prev) => (prev ? { ...prev, stage: suggestion.next } : prev));
      setSuggestion(null);
      await fetchIntel();
    } catch (e) {
      console.warn("opps-detail: applySuggestion failed", e);
      toast("Failed to advance stage — network error.", "error");
    } finally {
      setApplyingStage(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-[var(--color-text-tertiary)]">Loading...</p>;
  if (!deal) return <p className="p-6 text-sm text-red-400">Deal not found</p>;

  const stageBadgeVariant: Record<string, "success" | "warning" | "error" | "info" | "neutral"> = {
    lead: "neutral",
    qualification: "info",
    demo: "info",
    trial: "warning",
    proposal: "warning",
    negotiation: "warning",
    won: "success",
    lost: "error",
  };

  return (
    <div className="flex h-full">
      <div className="flex-1 overflow-auto p-6">
        <Breadcrumbs
          items={[
            { label: "Pipeline", href: "/opportunities" },
            { label: deal.name },
          ]}
        />

        <div className="mt-4 flex items-center gap-3">
          <h1 className="text-xl font-semibold">{deal.name}</h1>
          <Badge variant={stageBadgeVariant[deal.stage] || "neutral"} size="md">
            {deal.stage.toUpperCase()}
          </Badge>
        </div>

        {/* Y3 — auto-progress suggestion banner */}
        {suggestion && currentStageFromSuggestion && (
          <div
            className="mt-4 flex items-start gap-3 rounded-lg p-4"
            style={{
              background: "var(--color-accent-soft, rgba(37,99,235,0.08))",
              border: "1px solid var(--color-accent)",
            }}
          >
            <Sparkles size={16} className="mt-0.5 shrink-0" style={{ color: "var(--color-accent)" }} />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                Suggested: advance this deal
              </p>
              <p className="mt-1 flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium uppercase" style={{ background: "var(--color-bg-card)", color: "var(--color-text-secondary)", border: "1px solid var(--color-border-default)" }}>
                  {currentStageFromSuggestion}
                </span>
                <ArrowRight size={12} style={{ color: "var(--color-text-tertiary)" }} />
                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium uppercase" style={{ background: "var(--color-accent)", color: "#fff" }}>
                  {suggestion.next}
                </span>
                <span>· {suggestion.reason}</span>
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  ({suggestion.confidence} confidence)
                </span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="gradient" size="sm" onClick={applySuggestion} loading={applyingStage} disabled={applyingStage}>
                Apply
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setSuggestion(null)} disabled={applyingStage}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {deal.companyName && (
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{deal.companyName}</p>
        )}

        {deal.summary && (
          <Card className="mt-4">
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">Summary</p>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{deal.summary}</p>
            </CardBody>
          </Card>
        )}

        {/* G9: Structured Data Extraction */}
        {(() => {
          const props = deal.properties as Record<string, unknown> | null;
          if (!props?.extractedBudget) return null;
          return (
            <Card className="mt-4">
              <CardBody>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Extracted Intelligence</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {props.extractedBudget ? <div><span className="text-[var(--color-text-tertiary)]">Budget:</span> <span className="text-[var(--color-text-primary)]">{String(props.extractedBudget)}</span></div> : null}
                  {props.extractedTeamSize ? <div><span className="text-[var(--color-text-tertiary)]">Team size:</span> <span className="text-[var(--color-text-primary)]">{String(props.extractedTeamSize)}</span></div> : null}
                  {props.extractedDecisionMaker ? <div><span className="text-[var(--color-text-tertiary)]">Decision maker:</span> <span className="text-[var(--color-text-primary)]">{String(props.extractedDecisionMaker)}</span></div> : null}
                </div>
              </CardBody>
            </Card>
          );
        })()}

        {/* Deal Coaching Card — proactive coaching for at-risk or stalled deals */}
        {(() => {
          const props = deal.properties as Record<string, unknown> | null;
          const riskLevel = props?.riskLevel as string | undefined;
          const risks = (props?.risks as string[]) || [];
          const nextActions = (props?.nextActions as string[]) || [];
          const daysSinceActivity = timeline.length > 0
            ? Math.floor((Date.now() - new Date(timeline[0].occurredAt).getTime()) / 86400000)
            : null;
          const isStalled = daysSinceActivity !== null && daysSinceActivity >= 7;
          const showCoaching = riskLevel === "high" || riskLevel === "medium" || isStalled;

          if (!showCoaching) return null;

          return (
            <Card className="mt-4" style={{
              borderLeft: riskLevel === "high" || (daysSinceActivity && daysSinceActivity >= 14)
                ? "3px solid var(--color-error)"
                : "3px solid var(--color-warning)",
            }}>
              <CardBody>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-semibold">
                    {riskLevel === "high" ? "High Risk" : isStalled ? "Stalled" : "Needs Attention"}
                  </span>
                  {daysSinceActivity !== null && (
                    <Badge variant={daysSinceActivity >= 14 ? "error" : "warning"} size="sm">
                      {daysSinceActivity}d since last activity
                    </Badge>
                  )}
                </div>

                {risks.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">Risks</p>
                    <ul className="space-y-0.5">
                      {risks.map((r, i) => (
                        <li key={i} className="text-sm text-[var(--color-text-secondary)] flex items-start gap-1.5">
                          <span className="text-red-400 mt-0.5 text-xs">●</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {nextActions.length > 0 && (
                  <div className="mb-2">
                    <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">Suggested Next Steps</p>
                    <ul className="space-y-0.5">
                      {nextActions.map((a, i) => (
                        <li key={i} className="text-sm text-[var(--color-text-secondary)] flex items-start gap-1.5">
                          <span className="text-blue-400 mt-0.5 text-xs">→</span> {a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="text-xs text-[var(--color-text-tertiary)] mt-2">
                  Ask the chat below for personalized coaching on this deal.
                </p>
              </CardBody>
            </Card>
          );
        })()}

        {/* Y1 — timeline narrative: human sentences distilled from raw activity rows */}
        {narrative && narrative.length > 0 && (
          <Card className="mt-6">
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-2">Deal narrative</p>
              <ul className="space-y-1">
                {narrative.map((line, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-[var(--color-text-secondary)]">
                    <span className="mt-0.5 text-[var(--color-text-tertiary)]">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}
        {intelLoaded && narrative && narrative.length === 0 && (
          <p className="mt-6 text-xs text-[var(--color-text-tertiary)]">No narrative yet — waiting on activity.</p>
        )}

        {/* G8: Deal Timeline */}
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
            Timeline
          </h2>
          {timeline.length === 0 ? (
            <p className="mt-3 text-sm text-[var(--color-text-tertiary)]">No interactions recorded yet.</p>
          ) : (
            <div className="mt-3 space-y-0">
              {timeline.map((activity, i) => (
                <div key={activity.id} className="relative flex gap-3 pb-4">
                  {/* Vertical line */}
                  {i < timeline.length - 1 && (
                    <div className="absolute left-[7px] top-4 bottom-0 w-px bg-[var(--color-bg-hover)]" />
                  )}
                  {/* Dot */}
                  <div className={`mt-1.5 h-[14px] w-[14px] flex-shrink-0 rounded-full border-2 ${
                    activity.direction === "inbound"
                      ? "border-emerald-500 bg-emerald-500/20"
                      : "border-blue-500 bg-blue-500/20"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-[var(--color-text-secondary)] uppercase">
                        {activity.activityType.replace(/_/g, " ")}
                      </span>
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                        {new Date(activity.occurredAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </div>
                    {activity.summary && (
                      <p className="mt-0.5 text-sm text-[var(--color-text-primary)]">{activity.summary}</p>
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
      <div className="w-[280px] flex-shrink-0 p-6" style={{ borderLeft: "1px solid var(--color-border-default)" }}>
        {/* Y2 — health score card */}
        {health && <HealthCard data={health} />}

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Deal details</h3>
        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Value</p>
            <p className="text-sm text-[var(--color-text-primary)]">{deal.value ? `$${deal.value.toLocaleString()}` : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Stage</p>
            <p className="text-sm text-[var(--color-text-primary)] capitalize">{deal.stage}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Expected Close</p>
            <p className="text-sm text-[var(--color-text-primary)]">
              {deal.expectedCloseDate
                ? new Date(deal.expectedCloseDate).toLocaleDateString()
                : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-tertiary)]">Account</p>
            <p className="text-sm text-[var(--color-text-primary)]">{deal.companyName || "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Y2 — health score card rendered in the right-hand panel.
function HealthCard({ data }: { data: HealthData }) {
  const bandColor: Record<string, string> = {
    strong: "var(--color-success, #059669)",
    ok: "var(--color-accent, #2563eb)",
    "at-risk": "var(--color-warning, #d97706)",
    stalled: "var(--color-error, #b91c1c)",
  };
  const color = bandColor[data.band] || "var(--color-text-secondary)";
  const components: Array<{ label: string; score: number; rationale: string; max: number }> = [
    { label: "Engagement", score: data.components.engagement.score, rationale: data.components.engagement.rationale, max: 40 },
    { label: "Freshness", score: data.components.freshness.score, rationale: data.components.freshness.rationale, max: 40 },
    { label: "Completeness", score: data.components.completeness.score, rationale: data.components.completeness.rationale, max: 20 },
  ];
  return (
    <div>
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        <Gauge size={13} /> Health
      </h3>
      <div
        className="mt-3 flex items-center gap-3 rounded-lg p-3"
        style={{ background: "var(--color-bg-card)", border: `1px solid ${color}` }}
      >
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[16px] font-bold text-white"
          style={{ background: color }}
        >
          {data.score}
        </div>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wider" style={{ color }}>
            {data.band}
          </p>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">out of 100</p>
        </div>
      </div>
      <div className="mt-2 space-y-1.5">
        {components.map((c) => (
          <div key={c.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-[var(--color-text-secondary)]">{c.label}</span>
              <span className="font-medium text-[var(--color-text-primary)]">{c.score}/{c.max}</span>
            </div>
            <div className="mt-0.5 h-1 w-full rounded-full" style={{ background: "var(--color-bg-page)" }}>
              <div className="h-1 rounded-full" style={{ width: `${(c.score / c.max) * 100}%`, background: color }} />
            </div>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-tertiary)]">{c.rationale}</p>
          </div>
        ))}
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
    { key: "budget", label: "Budget", icon: "" },
    { key: "teamSize", label: "Team Size", icon: "" },
    { key: "currentCRM", label: "Current CRM", icon: "" },
    { key: "competitorTools", label: "Point Solutions", icon: "" },
    { key: "decisionTimeline", label: "Timeline", icon: "" },
    { key: "painPoints", label: "Pain Points", icon: "" },
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
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Deal Intelligence
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={extractIntel}
          loading={extracting}
        >
          {extracting ? "Extracting..." : hasData ? "Re-extract" : "Extract from interactions"}
        </Button>
      </div>
      {hasData ? (
        <Card className="mt-2">
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              {fields.map((f) => (
                data[f.key] ? (
                  <div key={f.key}>
                    <p className="text-[10px] text-[var(--color-text-tertiary)]">{f.icon} {f.label}</p>
                    <p className="text-sm text-[var(--color-text-primary)]">{data[f.key]}</p>
                  </div>
                ) : null
              ))}
            </div>
          </CardBody>
        </Card>
      ) : (
        <p className="mt-2 text-xs text-[var(--color-text-tertiary)]">No intelligence extracted yet. Click extract to analyze interactions.</p>
      )}
    </div>
  );
}
