"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Clock, Calendar, CheckSquare, Zap, MessageSquare, TrendingUp, Users, Building2, DollarSign, AlertTriangle, ArrowRight, X, Mail, Send, Bell, Search } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmailComposerPanel } from "@/components/email-composer-panel";
import type { EmailComposerDraft } from "@/components/email-composer-panel";
import { OnboardingWizard } from "@/components/onboarding-wizard";
import { OnboardingChat } from "@/components/onboarding-chat";
import { AgentFeed } from "@/components/agent-feed";
import { trackEvent } from "@/components/posthog-provider";
import { OnboardingV2Wrapper } from "@/components/onboarding-v2-wrapper";
import { WarmLeadPrompt } from "@/components/WarmLeadPrompt";
import { useOnboardingVersion } from "@/hooks/use-onboarding-version";
import { TAMRevealNotification } from "@/components/TAMRevealNotification";
import { ScalingPathPrompt } from "@/components/ScalingPathPrompt";
import { CompanyLogo } from "@/components/ui/company-logo";
import { HotInboundsWidget } from "@/components/hot-inbounds-widget";
import { HotVisitorsWidget } from "@/components/hot-visitors-widget";
import { VisitorIdCapBanner } from "@/components/visitor-id-cap-banner";

interface Action {
  action: string;
  why: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  entityType?: string;
  entityId?: string;
  contactEmail?: string;
  contactTitle?: string;
  companyName?: string;
  companyDomain?: string;
  dealValue?: number;
  dealStage?: string;
  daysSilent?: number;
  lastEmailSubject?: string;
  lastEmailSnippet?: string;
}

interface Insight {
  id: string;
  title: string;
  description: string;
  severity: "critical" | "high" | "medium" | "info";
  category: "alert" | "trend" | "pattern" | "opportunity";
  suggestedAction: string;
}

interface DashboardSummary {
  greeting: string;
  firstName: string;
  role: string | null;
  challenge: string | null;
  weekSummary: {
    sequencesLaunched: number;
    responsesReceived: number;
    meetingsBooked: number;
    opportunitiesClosed: number;
  };
  // H6 — optional prev-window counts. Older server builds may not
  // return this; delta rendering skips gracefully when absent.
  weekSummaryPrev?: {
    sequencesLaunched: number;
    responsesReceived: number;
    meetingsBooked: number;
    opportunitiesClosed: number;
  };
  founderMetrics?: {
    pipelineValue: number;
    activeDeals: number;
    wonValue: number;
    winRate: number | null;
    totalContacts: number;
    totalAccounts: number;
    emailsSent7d: number;
    openRate: number | null;
    dealsAtRisk: Array<{
      id: string;
      name: string;
      stage: string;
      value: number | null;
      daysSilent: number;
    }>;
  };
  todayTasks: Array<{
    id: string;
    title: string;
    dueDate: string | null;
    priority: string;
    account: string | null;
    overdue: boolean;
  }>;
  todayMeetings: Array<{
    id: string;
    title: string;
    time: string;
  }>;
}

const priorityVariants: Record<string, "error" | "warning" | "info" | "neutral"> = {
  critical: "error",
  high: "warning",
  medium: "info",
  low: "neutral",
};

// Category → lucide icon + color. Matches Monaco's daily dashboard
// iconography where each action type has a consistent visual anchor
// (🔔 nudge, ↩️ respond, 🔗 setup). We use lucide glyphs — see
// feedback_no-emoji-in-ui.md for why we don't ship emoji characters.
const categoryIcons: Record<string, { icon: typeof Bell; tint: string }> = {
  rescue:    { icon: Bell,           tint: "var(--color-error)" },
  follow_up: { icon: MessageSquare,  tint: "var(--color-accent)" },
  research:  { icon: Search,         tint: "var(--color-info)" },
  send:      { icon: Send,           tint: "var(--color-success)" },
  setup:     { icon: CheckSquare,    tint: "var(--color-text-secondary)" },
};

const severityVariants: Record<string, "error" | "warning" | "info" | "success"> = {
  critical: "error",
  high: "warning",
  medium: "info",
  info: "success",
};

export default function DashboardPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loadingActions, setLoadingActions] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingHasGoogle, setOnboardingHasGoogle] = useState(false);
  const [onboardingHasMicrosoft, setOnboardingHasMicrosoft] = useState(false);
  const [onboardingEmail, setOnboardingEmail] = useState<string | undefined>();
  const [onboardingName, setOnboardingName] = useState<string | undefined>();
  const [onboardingUserId, setOnboardingUserId] = useState<string | undefined>();
  const [onboardingInitialStep, setOnboardingInitialStep] = useState<string | null>(null);
  // WS-2/3 — consolidated onboarding version hook. Returns "v1" | "v2"
  // based on all v2 feature flags. When version === "v2", only the
  // confirmation card renders; when "v1", the full wizard renders. No
  // dual-render is possible.
  const { version: onboardingVersion, flags: onboardingFlags } = useOnboardingVersion();
  const [emailComposer, setEmailComposer] = useState<EmailComposerDraft | null>(null);
  const [priorities, setPriorities] = useState<{ contactId: string; name: string; title: string | null; company: string | null; companyDomain: string | null; emailCount: number; topReason: string }[]>([]);
  const [recommendations, setRecommendations] = useState<{ title: string; description: string; urgency: number; entityType: string; entityId: string; suggestedAction: string }[]>([]);
  const [showWelcome, setShowWelcome] = useState(false);
  // WS-6 — ?scalingPath=cold-on-primary-blocked or ?scalingPath=primary-cap-hit
  // triggers the scaling-path prompt on the dashboard. Email-send-worker or
  // any future send path that hits the WS-1 enforcement layer can redirect
  // with this param; the prompt offers Elevay-managed setup or Instantly
  // connect as resolution paths.
  const [scalingPathReason, setScalingPathReason] = useState<
    "cold-on-primary-blocked" | "primary-cap-hit" | null
  >(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);

  useEffect(() => {
    // Detect first-time visit after onboarding
    const params = new URLSearchParams(window.location.search);
    if (params.get("firstTime") === "true" && !localStorage.getItem("leadsens_welcomed")) {
      setShowWelcome(true);
      // Clean up URL without reload
      window.history.replaceState({}, "", "/");
    }
    // WS-6 — surface the scaling-path prompt when a send was just blocked.
    const scaling = params.get("scalingPath");
    if (scaling === "cold-on-primary-blocked" || scaling === "primary-cap-hit") {
      setScalingPathReason(scaling);
    }

    let cancelled = false;

    // Push the onboarding-payload → state fanout into a shared helper
    // so the main hydrate path and the legacy fallback don't drift.
    type OnboardingPayload = {
      needsOnboarding?: boolean;
      hasGoogle?: boolean;
      hasMicrosoft?: boolean;
      email?: string;
      name?: string;
      userId?: string;
      onboardingCurrentStep?: string | null;
    };
    function applyOnboarding(onb: OnboardingPayload | null) {
      if (!onb?.needsOnboarding) return;
      // Respect a prior "Skip for now" so onboarding isn't force-shown on
      // every load (it was a non-dismissable trap over already-set-up
      // tenants — pre-launch audit). Cleared automatically once the server
      // reports onboarding no longer needed.
      try {
        if (localStorage.getItem("elevay_onboarding_dismissed") === "1") return;
      } catch {}
      setShowOnboarding(true);
      setOnboardingHasGoogle(onb.hasGoogle || false);
      setOnboardingHasMicrosoft(onb.hasMicrosoft || false);
      setOnboardingEmail(onb.email);
      setOnboardingName(onb.name);
      setOnboardingUserId(onb.userId);
      setOnboardingInitialStep(
        typeof onb.onboardingCurrentStep === "string" ? onb.onboardingCurrentStep : null
      );
    }

    // H1 — single hydrate round-trip. Server fans out to the six
    // underlying handlers in parallel; any section that fails server-
    // side comes back as `null` and we keep the pre-existing
    // "unloaded section" UX for that bucket.
    fetch("/api/home/hydrate")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (!payload) {
          void fallbackLegacyFetches();
          return;
        }
        applyOnboarding(payload.onboarding as OnboardingPayload | null);
        setSummary((payload.summary as DashboardSummary | null) ?? null);
        setLoadingSummary(false);
        setActions(((payload.actions as { actions?: Action[] } | null)?.actions) ?? []);
        setLoadingActions(false);
        setInsights(((payload.insights as { insights?: Insight[] } | null)?.insights) ?? []);
        setPriorities(
          ((payload.priorities as {
            priorities?: { contactId: string; name: string; title: string | null; company: string | null; companyDomain: string | null; emailCount: number; topReason: string }[];
          } | null)?.priorities) ?? []
        );
        setRecommendations(
          ((payload.recommendations as {
            recommendations?: { title: string; description: string; urgency: number; entityType: string; entityId: string; suggestedAction: string }[];
          } | null)?.recommendations) ?? []
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("home: hydrate fetch failed", err);
        void fallbackLegacyFetches();
      });

    async function fallbackLegacyFetches() {
      const settled = await Promise.allSettled([
        fetch("/api/onboarding/status").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/dashboard/summary").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/actions").then((r) => (r.ok ? r.json() : { actions: [] })),
        fetch("/api/insights").then((r) => (r.ok ? r.json() : { insights: [] })),
        fetch("/api/priorities").then((r) => (r.ok ? r.json() : { priorities: [] })),
        fetch("/api/recommendations").then((r) => (r.ok ? r.json() : { recommendations: [] })),
      ]);
      if (cancelled) return;
      const [onb, sum, act, ins, prio, rec] = settled.map((s) =>
        s.status === "fulfilled" ? s.value : null
      );
      applyOnboarding(onb as OnboardingPayload | null);
      setSummary((sum as DashboardSummary | null) ?? null);
      setLoadingSummary(false);
      setActions(((act as { actions?: Action[] } | null)?.actions) ?? []);
      setLoadingActions(false);
      setInsights(((ins as { insights?: Insight[] } | null)?.insights) ?? []);
      setPriorities(
        ((prio as {
          priorities?: { contactId: string; name: string; title: string | null; company: string | null; companyDomain: string | null; emailCount: number; topReason: string }[];
        } | null)?.priorities) ?? []
      );
      setRecommendations(
        ((rec as {
          recommendations?: { title: string; description: string; urgency: number; entityType: string; entityId: string; suggestedAction: string }[];
        } | null)?.recommendations) ?? []
      );
    }

    return () => {
      cancelled = true;
    };
  }, []);

  // H11 — locale-aware concise date ("Mon, Apr 13" pattern).
  // Computed AFTER mount only. Both `navigator.language` and the local
  // timezone are absent/different during SSR, so formatting the date
  // inline during render made the server HTML ("en-US" + server tz) and
  // the client's first render (browser locale + tz) disagree — a
  // hydration mismatch (React error #418, text content). Deferring to
  // useEffect keeps SSR and the first client render identical (empty),
  // then fills in the localized date. We pick the *short* weekday +
  // month so the header stays dense (Lightfield's pattern; the long form
  // bled into the next line on narrow viewports).
  const [today, setToday] = useState("");
  useEffect(() => {
    setToday(
      // App chrome is English regardless of browser locale (only
      // prospect-facing generated content adapts language), so the header
      // date uses en-US — not navigator.language, which rendered "sam. 6 juin".
      new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      })
    );
  }, []);

  const ws = summary?.weekSummary;

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader icon={<Clock size={15} />} title="Up next" subtitle={today} />

      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Greeting */}
        <div className="mb-1">
          <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            {summary ? `${summary.greeting}, ${summary.firstName}` : "Welcome back"}
          </h1>
          <p className="mt-0.5 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            {summary?.challenge === "Finding leads"
              ? "Your top prospects by fit score."
              : summary?.challenge === "Getting responses"
                ? "Reply rates and follow-up gaps."
                : summary?.challenge === "Closing deals"
                  ? "Pipeline velocity and next steps."
                  : summary?.challenge === "Expanding accounts"
                    ? "Expansion signals across your accounts."
                    : today}
          </p>
        </div>

        {/* Onboarding is the single confirmation-card modal (rendered below).
            The legacy 7-phase wizard banner (→ /onboarding-v3) was removed —
            two parallel onboarding surfaces confused users (pre-launch audit). */}

        {/* P0-2 follow-up : visitor-ID cap banner. Hides itself when
            spend is healthy ; surfaces amber warning within $5/10%
            of cap, red alarm at-or-above cap. */}
        <div className="mb-4">
          <VisitorIdCapBanner />
        </div>

        {/* F010: Agent Activity Feed — primary view */}
        <div className="mb-6">
          <AgentFeed />
        </div>

        {/* MONACO-PARITY-02: Hot inbounds — speed-to-lead window
            (~5 min hot vs 60 min = 9x conversion). The widget hides
            itself when there are no hot leads, so it never adds
            empty-state padding. */}
        <div className="mb-6 grid gap-4 md:grid-cols-2">
          <HotInboundsWidget />
          {/* MONACO-PARITY-04: anonymous-visitor identification
              (Snitcher). Shows TAM accounts that just hit the
              marketing site so the founder can act before the lead
              cold-shops competitors. */}
          <HotVisitorsWidget />
        </div>

        {/* Welcome Banner (first time after onboarding) */}
        {showWelcome && summary?.founderMetrics && (
          <Card className="mt-4" style={{ border: "1px solid var(--color-accent)", background: "var(--color-accent-soft)" }}>
            <CardBody>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                    Your sales engine is ready
                  </p>
                  <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-secondary)" }}>
                    We found {summary.founderMetrics.totalAccounts} prospects and {summary.founderMetrics.totalContacts} contacts matching your criteria.
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => { localStorage.setItem("leadsens_welcomed", "1"); setShowWelcome(false); router.push("/accounts?sort=score&dir=desc"); }}
                      className="rounded-md px-3 py-1.5 text-[12px] font-medium text-white gradient-brand"
                    >
                      Review top accounts
                    </button>
                    <button
                      onClick={() => { localStorage.setItem("leadsens_welcomed", "1"); setShowWelcome(false); router.push("/sequences"); }}
                      className="rounded-md px-3 py-1.5 text-[12px] font-medium"
                      style={{ color: "var(--color-accent)", background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                    >
                      Launch a campaign
                    </button>
                    <button
                      onClick={() => { localStorage.setItem("leadsens_welcomed", "1"); setShowWelcome(false); router.push("/chat?q=Summarize my top prospects"); }}
                      className="rounded-md px-3 py-1.5 text-[12px] font-medium"
                      style={{ color: "var(--color-accent)", background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                    >
                      Ask Elevay
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => { localStorage.setItem("leadsens_welcomed", "1"); setShowWelcome(false); }}
                  className="text-[11px]"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Dismiss
                </button>
              </div>
            </CardBody>
          </Card>
        )}

        {/* WS-3 — Warm-lead prompt, gated by onboarding.v2.warm-lead-prompt.
            Renders only post-onboarding so it doesn't race the wizard. */}
        {onboardingFlags.warmLeadPrompt && !showOnboarding && (
          <div className="mt-4">
            <WarmLeadPrompt />
          </div>
        )}

        {/* WS-6 — scaling-path prompt, surfaced when a send was blocked. */}
        {scalingPathReason && !showOnboarding && (
          <div className="mt-4">
            <ScalingPathPrompt
              reason={scalingPathReason}
              onDismiss={() => setScalingPathReason(null)}
              onResolved={() => setScalingPathReason(null)}
            />
          </div>
        )}

        {/* WS-4 — Async TAM reveal notification. Shown briefly after
            onboarding completes (firstTime param) while the background
            TAM build runs. Self-hides on completion. */}
        {typeof window !== "undefined" &&
          new URLSearchParams(window.location.search).has("firstTime") &&
          !showOnboarding && (
            <div className="mt-4">
              <TAMRevealNotification />
            </div>
          )}

        {/* Weekly Summary — show outbound stats if active, founder stats otherwise */}
        {summary && (() => {
          const outboundTotal = (ws?.sequencesLaunched || 0) + (ws?.responsesReceived || 0) + (ws?.meetingsBooked || 0) + (ws?.opportunitiesClosed || 0);
          const fm = summary.founderMetrics;
          const hasFounderData = fm && (fm.totalAccounts > 0 || fm.totalContacts > 0 || fm.pipelineValue > 0);
          const wsPrev = summary.weekSummaryPrev;

          // H6 — delta is a pure number difference vs the same-length
          // window 7 days earlier. Outbound stats get deltas; founder
          // stats are "running totals" so a delta doesn't read cleanly
          // (totalContacts only goes up) and we omit them.
          type Stat = {
            value: string | number;
            label: string;
            icon: React.ReactNode;
            delta?: number;
          };
          const stats: Stat[] | null = outboundTotal > 0
            ? [
                { value: ws!.sequencesLaunched, label: "sequences", icon: <Zap size={14} />, delta: wsPrev ? ws!.sequencesLaunched - wsPrev.sequencesLaunched : undefined },
                { value: ws!.responsesReceived, label: "responses", icon: <MessageSquare size={14} />, delta: wsPrev ? ws!.responsesReceived - wsPrev.responsesReceived : undefined },
                { value: ws!.meetingsBooked, label: "meetings", icon: <Calendar size={14} />, delta: wsPrev ? ws!.meetingsBooked - wsPrev.meetingsBooked : undefined },
                { value: ws!.opportunitiesClosed, label: "closed", icon: <TrendingUp size={14} />, delta: wsPrev ? ws!.opportunitiesClosed - wsPrev.opportunitiesClosed : undefined },
              ]
            : hasFounderData
              ? [
                  { value: fm!.totalAccounts, label: "accounts", icon: <Building2 size={14} /> },
                  { value: fm!.totalContacts, label: "contacts", icon: <Users size={14} /> },
                  { value: `$${(fm!.pipelineValue / 1000).toFixed(0)}K`, label: "pipeline", icon: <DollarSign size={14} /> },
                  { value: fm!.activeDeals, label: "deals", icon: <TrendingUp size={14} /> },
                ]
              : null;

          if (!stats) return null;

          return (
            <Card className="mt-4">
              <CardBody>
                <div className="flex items-center gap-8">
                  {stats.map((stat) => (
                    <div key={stat.label} className="flex items-center gap-2">
                      <span style={{ color: "var(--color-text-tertiary)" }}>{stat.icon}</span>
                      <span className="text-[18px] font-bold" style={{ color: "var(--color-text-primary)" }}>{stat.value}</span>
                      <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>{stat.label}</span>
                      {/* H6 — WoW delta chip. "→ same" when zero,
                          coloured green/red when non-zero. Suppressed
                          when the prev window data isn't returned
                          (older server) or when prev+current are both
                          zero (a "noise" delta is worse than none). */}
                      {typeof stat.delta === "number" && !(stat.delta === 0 && stat.value === 0) && (
                        <span
                          className="text-[11px] font-medium tabular-nums"
                          style={{
                            color:
                              stat.delta > 0
                                ? "var(--color-success)"
                                : stat.delta < 0
                                  ? "var(--color-error)"
                                  : "var(--color-text-tertiary)",
                          }}
                          title={`${stat.delta > 0 ? "+" : ""}${stat.delta} vs last week`}
                        >
                          {stat.delta > 0 ? `↑ +${stat.delta}` : stat.delta < 0 ? `↓ ${stat.delta}` : "→ same"}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          );
        })()}

        {/* Deals at Risk — augmented with stall prediction data from /api/deals/at-risk */}
        <DealsAtRiskSection
          founderDeals={summary?.founderMetrics?.dealsAtRisk || []}
          onNavigate={(path) => router.push(path)}
        />

        {/* Two Column Layout */}
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
          {/* Left — Actions */}
          <div className="lg:col-span-3">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider flex items-center justify-between" style={{ color: "var(--color-text-tertiary)" }}>
              <span>Your priorities today</span>
              {actions.length > 5 && (
                <button
                  type="button"
                  onClick={() => router.push("/tasks")}
                  className="text-[11px] font-medium normal-case tracking-normal hover:underline"
                  style={{ color: "var(--color-accent)" }}
                >
                  5 of {actions.length} · View all
                </button>
              )}
            </h2>

            {loadingActions ? (
              <div className="mt-3 space-y-2">
                {[1, 2, 3].map((i) => (
                  <Card key={i}>
                    <CardBody>
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="mt-2 h-3 w-1/2" />
                    </CardBody>
                  </Card>
                ))}
              </div>
            ) : actions.length > 0 ? (
              <div className="mt-3 space-y-2">
                {actions.slice(0, 5).map((action, i) => {
                  const catIcon = categoryIcons[action.category];
                  const CatIcon = catIcon?.icon;
                  return (
                  <Card
                    key={i}
                    interactive={!!action.entityId}
                    onClick={() => {
                      // PostHog autocapture sees the card click but
                      // can't normalise the action key or priority —
                      // both feed the home-funnel dashboards.
                      trackEvent("", "home_action_clicked", {
                        action: action.action,
                        priority: action.priority,
                        category: action.category,
                      });
                      setSelectedAction(action);
                    }}
                  >
                    <CardBody className="!py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          {CatIcon && (
                            <CatIcon
                              size={14}
                              className="mt-0.5 shrink-0"
                              style={{ color: catIcon.tint }}
                            />
                          )}
                          <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {action.action}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {action.category === "rescue" && (
                            <Badge variant="error" size="sm">Stalled</Badge>
                          )}
                          <Badge variant={priorityVariants[action.priority] || "neutral"} size="sm">
                            {action.priority}
                          </Badge>
                        </div>
                      </div>
                      <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                        {action.why}
                      </p>
                      {action.entityType === "contact" && action.entityId && (
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
                            View contact
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEmailComposer({
                                to: "",
                                subject: `Following up`,
                                body: `Hi,\n\n${action.action}\n\n${action.why}\n\nWould you have time for a quick call this week?\n\nBest regards`,
                              });
                            }}
                            className="text-[11px] font-medium hover:underline"
                            style={{ color: "var(--color-accent)" }}
                          >
                            Draft email
                          </button>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                  );
                })}
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {(() => {
                  const fm = summary?.founderMetrics;
                  if (fm && fm.totalAccounts > 0 && fm.totalContacts === 0) {
                    return (
                      <Card interactive onClick={() => { router.push("/accounts"); }}>
                        <CardBody className="!py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                                Enrich your {fm.totalAccounts} accounts to discover contacts
                              </p>
                              <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                                Find decision-makers at your TAM companies
                              </p>
                            </div>
                            <ArrowRight size={14} style={{ color: "var(--color-accent)" }} />
                          </div>
                        </CardBody>
                      </Card>
                    );
                  }
                  if (fm && fm.totalContacts > 0 && fm.emailsSent7d === 0) {
                    return (
                      <Card interactive onClick={() => { router.push("/sequences"); }}>
                        <CardBody className="!py-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                                {fm.totalContacts} contacts ready for outreach
                              </p>
                              <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                                Launch a campaign to reach your top prospects
                              </p>
                            </div>
                            <ArrowRight size={14} style={{ color: "var(--color-accent)" }} />
                          </div>
                        </CardBody>
                      </Card>
                    );
                  }
                  return (
                    <Card interactive onClick={() => { router.push("/chat?q=What should I focus on today?"); }}>
                      <CardBody className="!py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                              Ask Elevay for suggestions
                            </p>
                            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                              Get personalized next steps based on your pipeline
                            </p>
                          </div>
                          <ArrowRight size={14} style={{ color: "var(--color-accent)" }} />
                        </div>
                      </CardBody>
                    </Card>
                  );
                })()}
              </div>
            )}

            {/* Insights */}
            {insights.length > 0 && (
              <div className="mt-6">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                  Insights
                </h2>
                <div className="mt-3 space-y-2">
                  {insights.slice(0, 3).map((insight) => (
                    <Card key={insight.id}>
                      <CardBody className="!py-3">
                        <div className="flex items-start gap-2">
                          <Badge variant={severityVariants[insight.severity] || "info"} size="sm">
                            {insight.severity}
                          </Badge>
                          <div>
                            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {insight.title}
                            </p>
                            <p className="mt-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                              {insight.description}
                            </p>
                            <p className="mt-1 text-[12px] font-medium" style={{ color: "var(--color-accent)" }}>
                              {insight.suggestedAction}
                            </p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right — Schedule */}
          <div className="lg:col-span-2">
            {/* Today's Meetings */}
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                Today&apos;s meetings
              </h2>
              {loadingSummary ? (
                <Card className="mt-3">
                  <CardBody><Skeleton className="h-4 w-1/2" /></CardBody>
                </Card>
              ) : summary && summary.todayMeetings.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayMeetings.map((meeting) => (
                    <Card key={meeting.id}>
                      <CardBody className="!py-3">
                        <div className="flex items-center gap-2">
                          <Calendar size={14} style={{ color: "var(--color-text-tertiary)" }} />
                          <div>
                            <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                              {meeting.title}
                            </p>
                            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                              {meeting.time}
                            </p>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                  No meetings today
                </p>
              )}
            </div>

            {/* Hot Contacts — always rendered (right-column anchor); empty
                state keeps the column balanced when activity is quiet. */}
            <div className="mt-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider flex items-center justify-between" style={{ color: "var(--color-text-tertiary)" }}>
                <span><Users size={12} className="inline mr-1" /> Hot contacts</span>
                {priorities.length > 5 && (
                  <button
                    type="button"
                    onClick={() => router.push("/contacts?sort=priority")}
                    className="text-[11px] font-medium normal-case tracking-normal hover:underline"
                    style={{ color: "var(--color-accent)" }}
                  >
                    5 of {priorities.length} · View all
                  </button>
                )}
              </h2>
              {priorities.length > 0 ? (
                <div className="mt-3 space-y-1.5">
                  {priorities.slice(0, 5).map((p) => (
                    <Card key={p.contactId} interactive onClick={() => { router.push(`/contacts/${p.contactId}`); }}>
                      <CardBody className="!py-2.5">
                        <div className="flex items-center gap-2">
                          <CompanyLogo domain={p.companyDomain} name={p.name} size={20} />
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium truncate" style={{ color: "var(--color-text-primary)" }}>{p.name}</p>
                            <p className="text-[11px] truncate" style={{ color: "var(--color-text-tertiary)" }}>
                              {p.title ? `${p.title}${p.company ? ` at ${p.company}` : ""}` : p.company || ""}
                            </p>
                          </div>
                          <span className="text-[10px] shrink-0" style={{ color: "var(--color-text-tertiary)" }}>{p.topReason}</span>
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                  No hot contacts yet — they&apos;ll appear when activity picks up.
                </p>
              )}
            </div>

            {/* Smart Recommendations — kept hidden when empty (the "This
                week" section title implies content; an empty version
                feels broken). View-all routes through chat since there
                isn't a dedicated /recommendations index. */}
            {recommendations.length > 0 && (
              <div className="mt-6">
                <h2 className="text-[12px] font-semibold uppercase tracking-wider flex items-center justify-between" style={{ color: "var(--color-text-tertiary)" }}>
                  <span><TrendingUp size={12} className="inline mr-1" /> This week</span>
                  {recommendations.length > 3 && (
                    <button
                      type="button"
                      onClick={() => router.push("/chat?q=Show me all my recommendations")}
                      className="text-[11px] font-medium normal-case tracking-normal hover:underline"
                      style={{ color: "var(--color-accent)" }}
                    >
                      3 of {recommendations.length} · View all
                    </button>
                  )}
                </h2>
                <div className="mt-3 space-y-1.5">
                  {recommendations.slice(0, 3).map((r, i) => (
                    <Card key={i} interactive onClick={() => {
                      if (r.entityType === "contact") router.push(`/contacts/${r.entityId}`);
                      else if (r.entityType === "company") router.push(`/accounts`);
                      else if (r.entityType === "deal") router.push(`/opportunities`);
                      else if (r.entityType === "campaign") router.push(`/sequences`);
                    }}>
                      <CardBody className="!py-2.5">
                        <p className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>{r.title}</p>
                        <p className="text-[11px] mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>{r.description}</p>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Today's Tasks */}
            <div className="mt-6">
              <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
                Tasks due
              </h2>
              {loadingSummary ? (
                <Card className="mt-3">
                  <CardBody><Skeleton className="h-4 w-1/2" /></CardBody>
                </Card>
              ) : summary && summary.todayTasks.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {summary.todayTasks.map((task) => (
                    <Card key={task.id}>
                      <CardBody className="!py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2">
                            <CheckSquare size={14} className="mt-0.5 shrink-0" style={{ color: "var(--color-text-tertiary)" }} />
                            <div>
                              <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                                {task.title}
                              </p>
                              {task.account && (
                                <p className="text-[12px]" style={{ color: "var(--color-accent)" }}>
                                  {task.account}
                                </p>
                              )}
                            </div>
                          </div>
                          {task.overdue && <Badge variant="error" size="sm">Overdue</Badge>}
                        </div>
                      </CardBody>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
                  No tasks due today
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Inline Priority Preview Panel */}
      {selectedAction && (
        <>
          <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.3)" }} onClick={() => setSelectedAction(null)} />
          <div className="slide-in-right fixed right-0 top-0 z-50 flex h-full w-[400px] flex-col" style={{ background: "var(--color-bg-card)", borderLeft: "1px solid var(--color-border-default)" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <div className="flex items-center gap-2">
                {selectedAction.companyDomain && <CompanyLogo domain={selectedAction.companyDomain} name={selectedAction.companyName || "?"} size={20} />}
                <div>
                  <p className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>{selectedAction.action}</p>
                  {selectedAction.contactTitle && <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{selectedAction.contactTitle}{selectedAction.companyName ? ` at ${selectedAction.companyName}` : ""}</p>}
                </div>
              </div>
              <button onClick={() => setSelectedAction(null)} className="rounded p-1" style={{ color: "var(--color-text-muted)" }}><X size={16} /></button>
            </div>

            {/* Context */}
            <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
              {/* Priority + reason */}
              <div className="flex items-center gap-2">
                <Badge variant={priorityVariants[selectedAction.priority] || "neutral"} size="sm">{selectedAction.priority}</Badge>
                {selectedAction.category === "rescue" && <Badge variant="error" size="sm">Stalled{selectedAction.daysSilent ? ` ${selectedAction.daysSilent}d` : ""}</Badge>}
                {selectedAction.dealValue && <span className="text-[12px] font-medium" style={{ color: "var(--color-success)" }}>${selectedAction.dealValue.toLocaleString()}</span>}
              </div>
              <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>{selectedAction.why}</p>

              {/* Last email */}
              {selectedAction.lastEmailSubject && (
                <div className="rounded-lg p-3" style={{ background: "var(--color-bg-page)", border: "1px solid var(--color-border-default)" }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <Mail size={12} style={{ color: "var(--color-text-tertiary)" }} />
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Last email</span>
                  </div>
                  <p className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{selectedAction.lastEmailSubject}</p>
                  {selectedAction.lastEmailSnippet && (
                    <p className="mt-1 text-[12px] line-clamp-4" style={{ color: "var(--color-text-secondary)" }}>{selectedAction.lastEmailSnippet}</p>
                  )}
                </div>
              )}

              {/* AI-drafted nudge */}
              {selectedAction.entityType === "contact" && selectedAction.contactEmail && (
                <div className="rounded-lg p-3" style={{ background: "var(--color-accent-soft)", border: "1px solid color-mix(in srgb, var(--color-accent) 20%, transparent)" }}>
                  <div className="flex items-center gap-1.5 mb-2">
                    <TrendingUp size={12} style={{ color: "var(--color-accent)" }} />
                    <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--color-accent)" }}>Suggested follow-up</span>
                  </div>
                  <p className="text-[13px] font-medium mb-1" style={{ color: "var(--color-text-primary)" }}>
                    Re: {selectedAction.lastEmailSubject || "Following up"}
                  </p>
                  <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
                    Hi — I wanted to follow up on my previous message. {selectedAction.daysSilent && selectedAction.daysSilent > 7 ? "It's been a while and I wanted to make sure this didn't slip through the cracks." : "Do you have a few minutes to connect this week?"} Would love to find a time that works.
                  </p>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="shrink-0 flex items-center gap-2 px-4 py-3" style={{ borderTop: "1px solid var(--color-border-default)" }}>
              {selectedAction.contactEmail ? (
                <button
                  onClick={() => {
                    setEmailComposer({
                      to: selectedAction.contactEmail || "",
                      subject: `Re: ${selectedAction.lastEmailSubject || "Following up"}`,
                      body: `Hi,\n\nI wanted to follow up on my previous message. ${selectedAction.daysSilent && selectedAction.daysSilent > 7 ? "It's been a while — wanted to make sure this didn't fall through the cracks." : "Do you have a few minutes to connect this week?"}\n\nBest regards`,
                    });
                    setSelectedAction(null);
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold text-white gradient-brand"
                >
                  <Send size={14} /> Send follow-up
                </button>
              ) : (
                <button
                  onClick={() => {
                    const href = selectedAction.entityType === "contact" ? `/contacts/${selectedAction.entityId}` : `/opportunities`;
                    window.location.href = href;
                  }}
                  className="flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-medium"
                  style={{ color: "var(--color-accent)", background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
                >
                  View details <ArrowRight size={14} />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {emailComposer && (
        <EmailComposerPanel
          draft={emailComposer}
          onClose={() => setEmailComposer(null)}
        />
      )}

      {/* Onboarding — consolidated via useOnboardingVersion().
          When version === "v2", only the confirmation card renders.
          When version === "v1", the full wizard renders. Only one
          branch is ever mounted; no dual-render is possible. */}
      {showOnboarding && (
        onboardingVersion === "v3" ? (
          <OnboardingChat
            hasGoogle={onboardingHasGoogle}
            hasMicrosoft={onboardingHasMicrosoft}
            userEmail={onboardingEmail}
            userName={onboardingName}
            companyDomain={undefined}
            onComplete={() => {
              setShowOnboarding(false);
              window.location.href = "/?firstTime=true";
            }}
          />
        ) : onboardingVersion === "v2" ? (
          <OnboardingV2Wrapper
            userId={onboardingUserId}
            userEmail={onboardingEmail}
            userName={onboardingName}
            onComplete={() => {
              setShowOnboarding(false);
              try { localStorage.removeItem("elevay_onboarding_dismissed"); } catch {}
              window.location.href = "/?firstTime=true";
            }}
            onDismiss={() => {
              setShowOnboarding(false);
              try { localStorage.setItem("elevay_onboarding_dismissed", "1"); } catch {}
            }}
          />
        ) : (
          <OnboardingWizard
            hasGoogle={onboardingHasGoogle}
            hasMicrosoft={onboardingHasMicrosoft}
            userEmail={onboardingEmail}
            userName={onboardingName}
            userId={onboardingUserId}
            initialStep={onboardingInitialStep as never}
            onComplete={() => {
              setShowOnboarding(false);
              // Hard reload after onboarding completion so the just-run
              // Inngest TAM-build job has its results picked up by a
              // fresh hydrate pass. SPA push would keep the stale
              // pre-onboarding state.
              window.location.href = "/?firstTime=true";
            }}
          />
        )
      )}
    </div>
  );
}

// ── Deals at Risk Section (augmented with stall predictions) ─

interface StallPrediction {
  dealId: string;
  dealName: string;
  stallProbability: number;
  daysUntilLikelyStall: number;
  indicators: Array<{ type: string; severity: string; detail: string }>;
  suggestedInterventions: Array<{ action: string; priority: number; reasoning: string }>;
}

function DealsAtRiskSection({
  founderDeals,
  onNavigate,
}: {
  founderDeals: Array<{
    id: string;
    name: string;
    stage: string;
    value: number | null;
    daysSilent: number;
  }>;
  onNavigate: (path: string) => void;
}) {
  const [predictions, setPredictions] = useState<StallPrediction[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/deals/at-risk")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPredictions(data.predictions || []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  // Merge: use stall predictions when available, fall back to founder metrics
  const mergedDeals = loaded && predictions.length > 0
    ? predictions.slice(0, 5).map((p) => {
        const founderDeal = founderDeals.find((d) => d.id === p.dealId);
        return {
          id: p.dealId,
          name: p.dealName,
          value: founderDeal?.value ?? null,
          daysSilent: founderDeal?.daysSilent ?? 0,
          stallProbability: p.stallProbability,
          daysUntilStall: p.daysUntilLikelyStall,
          topIntervention: p.suggestedInterventions[0]?.action || null,
        };
      })
    : founderDeals.slice(0, 3).map((d) => ({
        id: d.id,
        name: d.name,
        value: d.value,
        daysSilent: d.daysSilent,
        stallProbability: null as number | null,
        daysUntilStall: null as number | null,
        topIntervention: null as string | null,
      }));

  if (mergedDeals.length === 0) return null;

  const totalCount = loaded && predictions.length > 0 ? predictions.length : founderDeals.length;

  return (
    <div className="mt-3">
      <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wider flex items-center justify-between" style={{ color: "var(--color-text-tertiary)" }}>
        <span><AlertTriangle size={12} className="mr-1 inline" /> Deals at risk</span>
        {totalCount > 3 && (
          <button
            type="button"
            onClick={() => onNavigate("/opportunities")}
            className="text-[11px] font-medium normal-case tracking-normal hover:underline"
            style={{ color: "var(--color-accent)" }}
          >
            {Math.min(mergedDeals.length, 3)} of {totalCount} · View all
          </button>
        )}
      </h2>
      <div className="space-y-1.5">
        {mergedDeals.slice(0, 3).map((deal) => (
          <Card key={deal.id} interactive onClick={() => onNavigate(`/opportunities/${deal.id}`)}>
            <CardBody className="!py-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>{deal.name}</span>
                <div className="flex items-center gap-2">
                  {deal.value != null && deal.value > 0 && (
                    <span className="text-[11px] font-medium" style={{ color: "var(--color-success)" }}>
                      ${deal.value.toLocaleString()}
                    </span>
                  )}
                  {deal.stallProbability !== null ? (
                    <Badge
                      variant={deal.stallProbability >= 0.7 ? "error" : deal.stallProbability >= 0.4 ? "warning" : "neutral"}
                      size="sm"
                    >
                      {Math.round(deal.stallProbability * 100)}% stall risk
                    </Badge>
                  ) : (
                    <Badge
                      variant={deal.daysSilent >= 30 ? "error" : deal.daysSilent >= 14 ? "warning" : "neutral"}
                      size="sm"
                    >
                      Silent {deal.daysSilent}d
                    </Badge>
                  )}
                  {deal.daysUntilStall !== null && (
                    <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                      ~{deal.daysUntilStall}d until stall
                    </span>
                  )}
                </div>
              </div>
              {deal.topIntervention && (
                <p className="mt-1 text-[11px]" style={{ color: "var(--color-accent)" }}>
                  {deal.topIntervention.length > 80 ? deal.topIntervention.slice(0, 77) + "..." : deal.topIntervention}
                </p>
              )}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
