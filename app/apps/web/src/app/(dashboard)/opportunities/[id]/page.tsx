"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight, Gauge, Sparkles, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Calendar, Send, Users, Shield, ShieldAlert, ShieldCheck,
  Target, Trophy, XCircle, CheckCircle2, CircleAlert, Lightbulb, BarChart3,
  ThumbsUp, ThumbsDown, Clock,
} from "lucide-react";
import { ScopedChat } from "@/components/scoped-chat";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { DetailPageSkeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";
import { DealPropertyCell } from "@/components/deal-property-cell";
import { getDealAmountDisplay, formatDealAmount } from "@/lib/deals/amount";

interface Deal {
  id: string;
  name: string;
  stage: string;
  value: number | null;
  projectAmount: number | null;
  platformArr: number | null;
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

// ── Deal Intelligence types ──────────────────────────────────

interface WinProbData {
  probability: number;
  topFactors: string[];
  modelSource: string;
  trainedAt: string | null;
  sampleSize: number;
}

interface StallIndicator {
  type: string;
  severity: "high" | "medium" | "low";
  detail: string;
  /** Concrete evidence rows the API now ships alongside each
   *  indicator. Render inline so the *why* is visible at first
   *  glance — not buried behind a hover tooltip. */
  evidence?: string[];
}

interface SuggestedIntervention {
  action: string;
  priority: number;
  reasoning: string;
}

interface StallPrediction {
  dealId: string;
  dealName: string;
  stallProbability: number;
  daysUntilLikelyStall: number;
  indicators: StallIndicator[];
  suggestedInterventions: SuggestedIntervention[];
}

interface WinLossAnalysis {
  dealId: string;
  outcome: "won" | "lost";
  keyFactors: Array<{
    factor: string;
    impact: "positive" | "negative" | "neutral";
    evidence: string;
  }>;
  engagementVelocity: {
    avgDaysBetweenTouches: number;
    benchmark: number;
    verdict: "faster" | "slower" | "normal";
  };
  championTimeline: {
    identified: boolean;
    when?: string;
    who?: string;
  };
  competitorPresence: {
    mentioned: boolean;
    names: string[];
    impactOnOutcome: string;
  };
  objectionHandling: Array<{
    objection: string;
    wasAddressed: boolean;
    outcome: string;
  }>;
  comparisonToSimilar: {
    similarDeals: number;
    avgOutcomeRate: number;
    thisDealsPosition: string;
  };
  lessonsLearned: string[];
  recommendedChanges: string[];
}

export default function DealDetailPage() {
  const params = useParams();
  const router = useRouter();
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

  // Deal intelligence state
  const [winProb, setWinProb] = useState<WinProbData | null>(null);
  const [stallRisk, setStallRisk] = useState<StallPrediction | null>(null);
  const [winLoss, setWinLoss] = useState<WinLossAnalysis | null>(null);
  const [emailComposer, setEmailComposer] = useState<EmailComposerDraft | null>(null);

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

  // Fetch deal intelligence (win probability, stall risk, win/loss)
  const fetchDealIntel = useCallback(async (currentDeal: Deal) => {
    // Win probability — always fetch for open deals
    if (currentDeal.stage !== "won" && currentDeal.stage !== "lost") {
      try {
        const scoreRes = await fetch(`/api/deals/${dealId}/score`);
        if (scoreRes.ok) setWinProb(await scoreRes.json());
      } catch (e) {
        console.warn("opps-detail: score fetch failed", e);
      }

      // Stall risk — fetch all at-risk and filter for this deal
      try {
        const riskRes = await fetch("/api/deals/at-risk");
        if (riskRes.ok) {
          const data = await riskRes.json();
          const thisRisk = (data.predictions || []).find(
            (p: StallPrediction) => p.dealId === dealId
          );
          if (thisRisk) setStallRisk(thisRisk);
        }
      } catch (e) {
        console.warn("opps-detail: stall risk fetch failed", e);
      }
    }

    // Win/loss analysis — only for closed deals
    if (currentDeal.stage === "won" || currentDeal.stage === "lost") {
      try {
        const wlRes = await fetch(`/api/deals/${dealId}/win-loss`);
        if (wlRes.ok) {
          const data = await wlRes.json();
          setWinLoss(data.analysis || null);
        }
      } catch (e) {
        console.warn("opps-detail: win-loss fetch failed", e);
      }
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
          // Trigger deal intelligence fetch after we know the deal stage
          fetchDealIntel(data.deal);
        }
      } catch {
        console.error("Failed to load deal");
      } finally {
        setLoading(false);
      }
    }
    load();
    fetchIntel();
  }, [dealId, fetchIntel, fetchDealIntel]);

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

  async function createFollowUpTask(intervention: SuggestedIntervention) {
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: intervention.action,
          priority: intervention.priority <= 1 ? "high" : "medium",
          dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split("T")[0],
          relatedEntityType: "deal",
          relatedEntityId: dealId,
        }),
      });
      if (res.ok) {
        toast("Task created.", "success");
      } else {
        toast("Failed to create task.", "error");
      }
    } catch {
      toast("Failed to create task.", "error");
    }
  }

  if (loading) return <DetailPageSkeleton avatar="square" />;
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

  const isClosed = deal.stage === "won" || deal.stage === "lost";

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
          <div className="ml-auto">
            <Button
              variant="outline"
              size="sm"
              icon={<Send size={13} />}
              onClick={() =>
                setEmailComposer({
                  to: "",
                  subject: `Re: ${deal.name}`,
                  body: `Hi,\n\n`,
                  dealId,
                })
              }
            >
              Email contact
            </Button>
          </div>
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

        {/* (b) Stall Risk Warning — amber banner when stallProbability > 0.5 */}
        {stallRisk && stallRisk.stallProbability > 0.5 && (
          <div
            className="mt-4 rounded-lg p-4"
            style={{
              background: "var(--color-warning-soft)",
              border: "1px solid var(--color-warning)",
            }}
          >
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={16} style={{ color: "var(--color-warning)" }} />
              <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Stall Risk Detected
              </span>
              <Badge variant={stallRisk.stallProbability >= 0.7 ? "error" : "warning"} size="sm">
                {Math.round(stallRisk.stallProbability * 100)}% probability
              </Badge>
              <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                · est. {stallRisk.daysUntilLikelyStall}d until stall
              </span>
            </div>

            {stallRisk.indicators.length > 0 && (
              <ul className="mb-3 space-y-2">
                {stallRisk.indicators.map((ind, i) => (
                  <li key={i} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: ind.severity === "high"
                            ? "var(--color-error-soft)"
                            : ind.severity === "medium"
                              ? "var(--color-warning-soft)"
                              : "var(--color-bg-hover)",
                          color: ind.severity === "high"
                            ? "var(--color-error)"
                            : ind.severity === "medium"
                              ? "var(--color-warning)"
                              : "var(--color-text-secondary)",
                        }}
                      >
                        {ind.type.replace(/_/g, " ")}
                      </span>
                      <span
                        className="text-[12px]"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {ind.detail}
                      </span>
                    </div>
                    {/* Mètis : the *why* lives next to the alert, not
                        behind a tooltip. The founder reads the
                        evidence first, decides second — no hover
                        required. */}
                    {ind.evidence && ind.evidence.length > 0 && (
                      <ul
                        className="ml-2 list-disc space-y-0.5 pl-4 text-[11px]"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {ind.evidence.map((line, j) => (
                          <li key={j}>{line}</li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {stallRisk.suggestedInterventions.length > 0 && (
              <div className="space-y-1.5">
                {stallRisk.suggestedInterventions.map((intervention, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[12px] flex-1" style={{ color: "var(--color-text-secondary)" }}>
                      {intervention.action}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => createFollowUpTask(intervention)}
                        className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
                        style={{
                          background: "var(--color-bg-card)",
                          color: "var(--color-accent)",
                          border: "1px solid var(--color-border-default)",
                        }}
                        title="Create a task for this intervention"
                      >
                        <Calendar size={11} className="inline mr-1" style={{ verticalAlign: "-1px" }} />
                        Schedule
                      </button>
                      <button
                        onClick={() =>
                          setEmailComposer({
                            to: "",
                            subject: `Following up: ${deal.name}`,
                            body: `Hi,\n\n${intervention.action}\n\n${intervention.reasoning}\n\nBest regards`,
                            dealId,
                          })
                        }
                        className="rounded-md px-2 py-1 text-[11px] font-medium transition-colors"
                        style={{
                          background: "var(--color-bg-card)",
                          color: "var(--color-accent)",
                          border: "1px solid var(--color-border-default)",
                        }}
                        title="Open email composer for re-engagement"
                      >
                        <Send size={11} className="inline mr-1" style={{ verticalAlign: "-1px" }} />
                        Email
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {deal.summary && (
          <Card className="mt-4">
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">Summary</p>
              <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">{deal.summary}</p>
            </CardBody>
          </Card>
        )}

        {/* P0-5 task 5.6 — Autofilled deal intelligence with source
            attribution. Each cell shows the value plus a hover-tooltip
            describing where it came from (email/transcript/manual),
            when, and the LLM confidence. Manual entries surface a
            "manual" badge so the user knows autofill won't overwrite.
            Renders only when at least one autofill field is present. */}
        {(() => {
          const props = deal.properties as Record<string, unknown> | null;
          if (!props) return null;
          const fields = [
            "budget",
            "team_size",
            "current_crm",
            "competitors",
            "timeline",
            "point_solutions",
          ];
          // Hide the section entirely until autofill has any data —
          // avoids an empty card on brand-new deals.
          const anyPresent = fields.some(
            (f) => props[f] !== undefined && props[f] !== null && props[f] !== "",
          );
          if (!anyPresent) return null;
          return (
            <Card className="mt-4">
              <CardBody>
                <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-3">
                  Autofilled intelligence
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <DealPropertyCell properties={props} fieldName="budget" label="Budget" />
                  <DealPropertyCell properties={props} fieldName="team_size" label="Team size" />
                  <DealPropertyCell properties={props} fieldName="current_crm" label="Current CRM" />
                  <DealPropertyCell properties={props} fieldName="timeline" label="Timeline" />
                  <DealPropertyCell properties={props} fieldName="competitors" label="Competitors" />
                  <DealPropertyCell properties={props} fieldName="point_solutions" label="Point solutions" />
                </div>
              </CardBody>
            </Card>
          );
        })()}

        {/* (c) Stakeholder Map — from deal properties */}
        <StakeholderMap deal={deal} />

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

        {/* (d) Win/Loss Post-Mortem — only for closed deals */}
        {isClosed && winLoss && <WinLossCard analysis={winLoss} />}

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
      <div className="w-[300px] flex-shrink-0 overflow-auto p-6" style={{ borderLeft: "1px solid var(--color-border-default)" }}>
        {/* (a) Win Probability Card */}
        {winProb && !isClosed && <WinProbabilityCard data={winProb} />}

        {/* Y2 — health score card */}
        {health && <HealthCard data={health} />}

        <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">Deal details</h3>
        <div className="mt-4 space-y-3">
          {(() => {
            // B2 — never blend project bookings + platform ARR. The
            // helper enforces the split; legacy deals (value only)
            // fall back to a single line.
            const amounts = getDealAmountDisplay({
              value: deal.value,
              projectAmount: deal.projectAmount,
              platformArr: deal.platformArr,
            });
            if (amounts.isSplit) {
              return (
                <>
                  <div>
                    <p className="text-xs text-[var(--color-text-tertiary)]">Project bookings</p>
                    <p className="text-sm text-[var(--color-text-primary)]">{formatDealAmount(amounts.project)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-tertiary)]">Platform ARR</p>
                    <p className="text-sm text-[var(--color-text-primary)]">{formatDealAmount(amounts.platform)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[var(--color-text-tertiary)]">Total bookings</p>
                    <p className="text-sm text-[var(--color-text-primary)]">{formatDealAmount(amounts.total)}</p>
                  </div>
                </>
              );
            }
            return (
              <div>
                <p className="text-xs text-[var(--color-text-tertiary)]">Value</p>
                <p className="text-sm text-[var(--color-text-primary)]">{formatDealAmount(amounts.total)}</p>
              </div>
            );
          })()}
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

      {emailComposer && (
        <EmailComposerPanel
          draft={emailComposer}
          onClose={() => setEmailComposer(null)}
        />
      )}
    </div>
  );
}

// ── (a) Win Probability Card ─────────────────────────────────

function WinProbabilityCard({ data }: { data: WinProbData }) {
  const pct = Math.round(data.probability * 100);
  const color =
    pct >= 70
      ? "var(--color-success)"
      : pct >= 40
        ? "var(--color-warning)"
        : "var(--color-error)";

  return (
    <div className="mb-6">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-[var(--color-text-tertiary)]">
        <Target size={13} /> Win Probability
      </h3>
      <div
        className="mt-3 rounded-lg p-4"
        style={{ background: "var(--color-bg-card)", border: `1px solid ${color}` }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
            style={{ background: color }}
          >
            {pct}%
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold" style={{ color }}>
              {pct >= 70 ? "Strong" : pct >= 40 ? "Moderate" : "Weak"}
            </p>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              {data.modelSource === "naive_bayes"
                ? `Based on ${data.sampleSize} similar deals`
                : "Stage-based estimate"}
            </p>
          </div>
        </div>

        {data.topFactors.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {data.topFactors.slice(0, 3).map((factor, i) => {
              const isPositive = !factor.toLowerCase().includes("no ") && !factor.toLowerCase().includes("negative") && !factor.toLowerCase().includes("slow");
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{
                    background: isPositive ? "var(--color-success-soft)" : "var(--color-error-soft)",
                    color: isPositive ? "var(--color-success)" : "var(--color-error)",
                  }}
                >
                  {isPositive ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {factor.length > 40 ? factor.slice(0, 37) + "..." : factor}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Y2 — Health Score Card ───────────────────────────────────

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

// ── (c) Stakeholder Map ──────────────────────────────────────

function StakeholderMap({ deal }: { deal: Deal }) {
  const props = deal.properties as Record<string, unknown> | null;
  if (!props) return null;

  // Pull stakeholders from deal properties. These are typically set by
  // the deal analyzer or extracted from email intelligence.
  const stakeholders = (props.stakeholders as Array<{
    name: string;
    title?: string;
    role?: string;
    engagementScore?: number;
    lastInteraction?: string;
  }>) || [];

  // Also check for champion / blocker signals from other properties
  const championSignals = (props.championSignals as string[]) || [];
  const decisionMaker = props.extractedDecisionMaker as string | undefined;

  // If no stakeholder data at all, don't render the section
  if (stakeholders.length === 0 && championSignals.length === 0 && !decisionMaker) return null;

  const roleColors: Record<string, { bg: string; color: string; icon: typeof ShieldCheck }> = {
    champion: { bg: "var(--color-success-soft)", color: "var(--color-success)", icon: ShieldCheck },
    economic_buyer: { bg: "var(--color-accent-soft, rgba(37,99,235,0.08))", color: "var(--color-accent)", icon: Target },
    technical_evaluator: { bg: "var(--color-info-soft)", color: "var(--color-info)", icon: Shield },
    blocker: { bg: "var(--color-error-soft)", color: "var(--color-error)", icon: ShieldAlert },
    influencer: { bg: "var(--color-warning-soft)", color: "var(--color-warning)", icon: Users },
    user: { bg: "var(--color-bg-hover)", color: "var(--color-text-secondary)", icon: Users },
  };

  // Determine coverage
  const roles = new Set(stakeholders.map((s) => s.role?.toLowerCase() || "unknown"));
  const hasChampion = roles.has("champion") || championSignals.length > 0;
  const hasEconomicBuyer = roles.has("economic_buyer") || !!decisionMaker;
  const hasTechnicalEval = roles.has("technical_evaluator");

  const coverageItems = [
    { label: "Champion", met: hasChampion },
    { label: "Economic buyer", met: hasEconomicBuyer },
    { label: "Technical evaluator", met: hasTechnicalEval },
  ];

  const strategy = props.stakeholderStrategy as string | undefined;

  return (
    <Card className="mt-4">
      <CardBody>
        <div className="flex items-center gap-2 mb-3">
          <Users size={14} style={{ color: "var(--color-text-tertiary)" }} />
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Stakeholder Map</p>
        </div>

        {/* Stakeholder cards */}
        {stakeholders.length > 0 && (
          <div className="grid grid-cols-2 gap-2 mb-3">
            {stakeholders.map((s, i) => {
              const roleKey = s.role?.toLowerCase() || "user";
              const rc = roleColors[roleKey] || roleColors.user;
              const RoleIcon = rc.icon;
              return (
                <div
                  key={i}
                  className="rounded-lg p-2.5"
                  style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                      {s.name}
                    </span>
                  </div>
                  {s.title && (
                    <p className="text-[11px] mb-1" style={{ color: "var(--color-text-tertiary)" }}>{s.title}</p>
                  )}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: rc.bg, color: rc.color }}
                    >
                      <RoleIcon size={9} />
                      {(s.role || "unknown").replace(/_/g, " ")}
                    </span>
                  </div>
                  {typeof s.engagementScore === "number" && (
                    <div className="mt-1">
                      <div className="flex items-center justify-between text-[10px] mb-0.5">
                        <span style={{ color: "var(--color-text-tertiary)" }}>Engagement</span>
                        <span className="font-medium" style={{ color: "var(--color-text-secondary)" }}>{s.engagementScore}/10</span>
                      </div>
                      <div className="h-1 w-full rounded-full" style={{ background: "var(--color-bg-hover)" }}>
                        <div
                          className="h-1 rounded-full"
                          style={{
                            width: `${(s.engagementScore / 10) * 100}%`,
                            background: s.engagementScore >= 7 ? "var(--color-success)" : s.engagementScore >= 4 ? "var(--color-warning)" : "var(--color-error)",
                          }}
                        />
                      </div>
                    </div>
                  )}
                  {s.lastInteraction && (
                    <p className="mt-1 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                      Last: {new Date(s.lastInteraction).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Coverage checklist */}
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">Coverage</p>
          <div className="flex items-center gap-3">
            {coverageItems.map((item) => (
              <div key={item.label} className="flex items-center gap-1">
                {item.met ? (
                  <CheckCircle2 size={12} style={{ color: "var(--color-success)" }} />
                ) : (
                  <CircleAlert size={12} style={{ color: "var(--color-error)" }} />
                )}
                <span
                  className="text-[11px] font-medium"
                  style={{ color: item.met ? "var(--color-text-secondary)" : "var(--color-error)" }}
                >
                  {item.label}
                </span>
              </div>
            ))}
          </div>
          {/* Highlight gaps */}
          {coverageItems.filter((c) => !c.met).length > 0 && (
            <p className="mt-1.5 text-[11px] font-medium" style={{ color: "var(--color-error)" }}>
              {coverageItems.filter((c) => !c.met).map((c) => `No ${c.label.toLowerCase()} identified`).join(". ")}
            </p>
          )}
        </div>

        {strategy && (
          <div className="mt-2 rounded-md p-2" style={{ background: "var(--color-bg-page)" }}>
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1">Strategy</p>
            <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{strategy}</p>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

// ── (d) Win/Loss Post-Mortem Card ────────────────────────────

function WinLossCard({ analysis }: { analysis: WinLossAnalysis }) {
  const isWon = analysis.outcome === "won";

  return (
    <Card className="mt-6" style={{
      borderLeft: isWon ? "3px solid var(--color-success)" : "3px solid var(--color-error)",
    }}>
      <CardBody>
        <div className="flex items-center gap-2 mb-3">
          {isWon ? <Trophy size={16} style={{ color: "var(--color-success)" }} /> : <XCircle size={16} style={{ color: "var(--color-error)" }} />}
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            {isWon ? "Win Analysis" : "Loss Analysis"}
          </p>
        </div>

        {/* Key Factors */}
        {analysis.keyFactors.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">Key Factors</p>
            <div className="space-y-1.5">
              {analysis.keyFactors.map((f, i) => (
                <div key={i} className="flex items-start gap-2">
                  {f.impact === "positive" ? (
                    <ThumbsUp size={12} className="mt-0.5 shrink-0" style={{ color: "var(--color-success)" }} />
                  ) : f.impact === "negative" ? (
                    <ThumbsDown size={12} className="mt-0.5 shrink-0" style={{ color: "var(--color-error)" }} />
                  ) : (
                    <Minus size={12} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{f.factor}</p>
                    <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{f.evidence}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Engagement Velocity */}
        <div className="mb-3 flex items-center gap-4 rounded-md p-2" style={{ background: "var(--color-bg-page)" }}>
          <div className="flex items-center gap-1.5">
            <Clock size={12} style={{ color: "var(--color-text-tertiary)" }} />
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>Velocity</span>
          </div>
          <span className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            {analysis.engagementVelocity.avgDaysBetweenTouches >= 0
              ? `${analysis.engagementVelocity.avgDaysBetweenTouches}d`
              : "N/A"}
            {" "}between touches
          </span>
          <Badge
            variant={analysis.engagementVelocity.verdict === "faster" ? "success" : analysis.engagementVelocity.verdict === "slower" ? "error" : "neutral"}
            size="sm"
          >
            {analysis.engagementVelocity.verdict} vs benchmark ({analysis.engagementVelocity.benchmark}d)
          </Badge>
        </div>

        {/* Lessons Learned */}
        {analysis.lessonsLearned.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)] mb-1.5">Lessons Learned</p>
            <div className="space-y-1">
              {analysis.lessonsLearned.map((lesson, i) => (
                <div
                  key={i}
                  className="flex items-start gap-2 rounded-md p-2"
                  style={{ background: "var(--color-bg-page)" }}
                >
                  <Lightbulb size={12} className="mt-0.5 shrink-0" style={{ color: "var(--color-warning)" }} />
                  <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{lesson}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comparison */}
        {analysis.comparisonToSimilar.similarDeals > 0 && (
          <div className="flex items-center gap-2 rounded-md p-2" style={{ background: "var(--color-bg-page)" }}>
            <BarChart3 size={12} style={{ color: "var(--color-text-tertiary)" }} />
            <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
              {analysis.comparisonToSimilar.thisDealsPosition}
              {" "}({analysis.comparisonToSimilar.similarDeals} similar deals, {analysis.comparisonToSimilar.avgOutcomeRate}% win rate)
            </p>
          </div>
        )}
      </CardBody>
    </Card>
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
