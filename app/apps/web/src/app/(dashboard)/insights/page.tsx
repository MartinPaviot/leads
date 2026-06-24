"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Target,
  DollarSign,
  Activity,
  BarChart3,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Brain,
} from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";

// ── Types ────────────────────────────────────────────────

interface PipelineStage {
  name: string;
  count: number;
  totalValue: number;
  avgAge: number;
}

interface PipelineData {
  stages: PipelineStage[];
  totals: {
    openDeals: number;
    totalValue: number;
    weightedValue: number;
    avgDealSize: number;
  };
  velocity: {
    newDealsThisPeriod: number;
    closedWonThisPeriod: number;
    closedLostThisPeriod: number;
    conversionRate: number | null;
  };
  risks: Array<{
    dealId: string;
    name: string;
    stage: string;
    daysStalled: number;
    bucket: string;
    value: number | null;
  }>;
}

interface Alert {
  type: string;
  severity: string;
  title: string;
  description: string;
  entityType: string;
  entityId: string;
}

interface AlertsData {
  totalAlerts: number;
  bySeverity: { critical: number; high: number; medium: number; low: number };
  alerts: Alert[];
}

interface DealBriefSummary {
  dealId: string;
  dealName: string;
  stage: string;
  value: number | null;
  companyName: string | null;
  riskLevel: string;
  healthScore: number;
  summary: string;
  nextAction: { action: string; owner: string };
}

// ── Component ────────────────────────────────────────────

export default function InsightsPage() {
  const router = useRouter();
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [alerts, setAlerts] = useState<AlertsData | null>(null);
  const [briefs, setBriefs] = useState<DealBriefSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedBrief, setExpandedBrief] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoadError(false);
    (async () => {
      try {
        // Independent lanes: one failing no longer nulls the others (it just
        // leaves that lane empty). Previously a single `.catch(console.error)`
        // swallowed everything and the page rendered 0/$0K with sections hidden.
        const [pRes, aRes, bRes] = await Promise.all([
          fetch("/api/dashboard/pipeline?period=30"),
          fetch("/api/dashboard/alerts"),
          fetch("/api/dashboard/briefs?max=5"),
        ]);
        if (!pRes.ok && !aRes.ok && !bRes.ok) throw new Error("all insights lanes failed");
        const [p, a, b] = await Promise.all([
          pRes.ok ? pRes.json() : null,
          aRes.ok ? aRes.json() : null,
          bRes.ok ? bRes.json() : { briefs: [] },
        ]);
        if (cancelled) return;
        setPipeline(p);
        setAlerts(a);
        setBriefs(b?.briefs || []);
      } catch (e) {
        if (!cancelled) setLoadError(true);
        console.error("insights load failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [reloadKey]);

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Insights" />
        <div className="flex-1 p-5">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-32 rounded-lg"
                style={{ background: "var(--color-bg-secondary)" }}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError && !pipeline && !alerts && briefs.length === 0) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Insights" />
        <div className="flex-1 p-5">
          <div className="flex flex-col items-start gap-3 rounded-lg p-6" style={{ border: "1px solid var(--color-border-default)" }}>
            <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Couldn&apos;t load insights</p>
            <p className="text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>Something went wrong. Your data is safe — try again.</p>
            <button
              type="button"
              onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold"
              style={{ border: "1px solid var(--color-border-default)", color: "var(--color-text-secondary)" }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const stageOrder = ["lead", "qualification", "demo", "trial", "proposal", "negotiation"];

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader title="Insights" />
      <div className="flex-1 overflow-auto p-5 space-y-6">
        {/* Pipeline Overview */}
        <section>
          <h2
            className="flex items-center gap-2 text-sm font-semibold mb-3"
            style={{ color: "var(--color-text-primary)" }}
          >
            <BarChart3 size={16} /> Pipeline
          </h2>
          <div className="grid grid-cols-4 gap-3">
            <MetricCard
              label="Open Deals"
              value={pipeline?.totals.openDeals ?? 0}
              icon={<Target size={14} />}
            />
            <MetricCard
              label="Total Value"
              value={`$${((pipeline?.totals.totalValue ?? 0) / 1000).toFixed(0)}K`}
              icon={<DollarSign size={14} />}
            />
            <MetricCard
              label="Weighted"
              value={`$${((pipeline?.totals.weightedValue ?? 0) / 1000).toFixed(0)}K`}
              icon={<TrendingUp size={14} />}
            />
            <MetricCard
              label="Win Rate"
              value={
                pipeline?.velocity.conversionRate != null
                  ? `${(pipeline.velocity.conversionRate * 100).toFixed(0)}%`
                  : "—"
              }
              icon={<Activity size={14} />}
            />
          </div>

          {/* Stage Funnel */}
          {pipeline && pipeline.stages.length > 0 && (
            <div className="mt-3 flex gap-1">
              {stageOrder.map((stageName) => {
                const stage = pipeline.stages.find((s) => s.name === stageName);
                if (!stage) return null;
                const maxCount = Math.max(...pipeline.stages.map((s) => s.count), 1);
                const width = Math.max((stage.count / maxCount) * 100, 15);
                return (
                  <div
                    key={stageName}
                    className="rounded px-2 py-1.5 text-[11px]"
                    style={{
                      width: `${width}%`,
                      background: "var(--color-bg-secondary)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    <div className="font-medium capitalize">{stageName}</div>
                    <div>
                      {stage.count} · ${(stage.totalValue / 1000).toFixed(0)}K
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Alerts */}
        {alerts && alerts.totalAlerts > 0 && (
          <section>
            <h2
              className="flex items-center gap-2 text-sm font-semibold mb-3"
              style={{ color: "var(--color-text-primary)" }}
            >
              <AlertTriangle size={16} /> Alerts
              <Badge variant={alerts.bySeverity.critical > 0 ? "error" : "neutral"}>
                {alerts.totalAlerts}
              </Badge>
            </h2>
            <div className="space-y-2">
              {alerts.alerts.slice(0, 8).map((alert, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-lg px-3 py-2 text-[13px] cursor-pointer hover:opacity-80"
                  style={{ background: "var(--color-bg-secondary)" }}
                  onClick={() => {
                    if (alert.entityType === "deal") {
                      router.push(`/opportunities/${alert.entityId}`);
                    }
                  }}
                >
                  <SeverityDot severity={alert.severity} />
                  <div className="flex-1 min-w-0">
                    <div
                      className="font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {alert.title}
                    </div>
                    <div
                      className="text-[11px] truncate"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {alert.description}
                    </div>
                  </div>
                  <Badge
                    variant="neutral"
                    className="text-[10px] shrink-0"
                  >
                    {alert.type.replace(/_/g, " ")}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Deal Briefs */}
        {briefs.length > 0 && (
          <section>
            <h2
              className="flex items-center gap-2 text-sm font-semibold mb-3"
              style={{ color: "var(--color-text-primary)" }}
            >
              <Brain size={16} /> Deal Briefs
            </h2>
            <div className="space-y-2">
              {briefs.map((brief) => (
                <div
                  key={brief.dealId}
                  className="rounded-lg px-3 py-2"
                  style={{ background: "var(--color-bg-secondary)" }}
                >
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() =>
                      setExpandedBrief(
                        expandedBrief === brief.dealId ? null : brief.dealId,
                      )
                    }
                  >
                    <div className="flex items-center gap-2">
                      <HealthDot score={brief.healthScore} />
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {brief.dealName}
                      </span>
                      <Badge variant="neutral" className="text-[10px]">
                        {brief.stage}
                      </Badge>
                      {brief.value && (
                        <span
                          className="text-[11px]"
                          style={{ color: "var(--color-text-tertiary)" }}
                        >
                          ${(brief.value / 1000).toFixed(0)}K
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <RiskBadge level={brief.riskLevel} />
                      {expandedBrief === brief.dealId ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </div>
                  </div>
                  {expandedBrief === brief.dealId && (
                    <div className="mt-2 pt-2 border-t" style={{ borderColor: "var(--color-border)" }}>
                      <p
                        className="text-[12px] mb-2"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {brief.summary}
                      </p>
                      <div
                        className="flex items-center gap-2 text-[11px]"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        <ArrowRight size={12} />
                        <span className="font-medium">Next:</span>
                        {brief.nextAction.action}
                        <Badge variant="neutral" className="text-[10px]">
                          {brief.nextAction.owner}
                        </Badge>
                      </div>
                      <button
                        className="mt-2 text-[11px] underline cursor-pointer"
                        style={{ color: "var(--color-primary)" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/opportunities/${brief.dealId}`);
                        }}
                      >
                        View deal
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardBody className="p-3">
        <div
          className="flex items-center gap-1.5 text-[11px] mb-1"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          {icon}
          {label}
        </div>
        <div
          className="text-lg font-semibold"
          style={{ color: "var(--color-text-primary)" }}
        >
          {value}
        </div>
      </CardBody>
    </Card>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "var(--color-error)",
    high: "#ea580c",
    medium: "var(--color-warning)",
    low: "var(--color-text-tertiary)",
  };
  return (
    <div
      className="w-2 h-2 rounded-full mt-1.5 shrink-0"
      style={{ background: colors[severity] || colors.low }}
    />
  );
}

function HealthDot({ score }: { score: number }) {
  const color =
    score >= 70 ? "var(--color-success)"
    : score >= 40 ? "var(--color-warning)"
    : "var(--color-error)";
  return (
    <div
      className="w-2 h-2 rounded-full shrink-0"
      style={{ background: color }}
    />
  );
}

function RiskBadge({ level }: { level: string }) {
  const variants: Record<string, string> = {
    critical: "var(--color-error)",
    high: "#ea580c",
    medium: "var(--color-warning)",
    low: "var(--color-success)",
  };
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded font-medium"
      style={{
        color: variants[level] || variants.low,
        background: `${variants[level] || variants.low}15`,
      }}
    >
      {level}
    </span>
  );
}
