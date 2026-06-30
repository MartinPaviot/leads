"use client";

import { useState, useEffect } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { AlertTriangle, TrendingUp, TrendingDown, Minus, Mail, ShieldAlert, MessageSquare, ArrowDown } from "lucide-react";

interface MailboxHealth {
  id: string;
  emailAddress: string;
  status: string;
  healthScore: number;
  sentToday: number;
  dailyLimit: number;
  bounceCount7d: number;
}

interface DeliverabilityData {
  totalSent: number;
  totalOpened: number;
  totalReplied: number;
  totalBounced: number;
  spamComplaints: number;
  openRate: number;
  replyRate: number;
  bounceRate: number;
  spamRate: number;
  healthScore: number;
  healthLabel: string;
  warnings: string[];
  enrollmentsByStatus: Record<string, number>;
  mailboxHealth?: MailboxHealth[];
  // Week-over-week comparison data from the API
  prevWeek?: {
    openRate: number;
    replyRate: number;
    bounceRate: number;
    spamRate: number;
    totalSent: number;
  };
}

// Actionable recommendation derived from current metrics
interface Recommendation {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  action: string;
}

function getRecommendations(data: DeliverabilityData): Recommendation[] {
  const recs: Recommendation[] = [];

  if (data.spamRate > 0.1) {
    recs.push({
      severity: "critical",
      title: "Spam rate exceeds Gmail threshold",
      description: `Your spam complaint rate is ${data.spamRate}%, above the 0.1% threshold that triggers domain throttling.`,
      action: "Review email content for spam triggers, remove disengaged recipients, and add a visible unsubscribe link to every outbound email.",
    });
  }

  if (data.bounceRate > 5) {
    recs.push({
      severity: "critical",
      title: "High bounce rate detected",
      description: `Bounce rate is ${data.bounceRate}%, above the 5% safe threshold. This damages sender reputation.`,
      action: "Reduce send volume immediately. Verify email addresses before sending and remove invalid contacts from your lists.",
    });
  } else if (data.bounceRate > 2) {
    recs.push({
      severity: "warning",
      title: "Bounce rate trending up",
      description: `Bounce rate is ${data.bounceRate}%, approaching the 5% danger zone.`,
      action: "Enable email verification for new contacts and review recent list imports for invalid addresses.",
    });
  }

  if (data.totalSent > 10 && data.openRate < 15) {
    recs.push({
      severity: "warning",
      title: "Low open rate",
      description: `Only ${data.openRate}% of emails are being opened, below the 15% minimum for healthy outreach.`,
      action: "Improve subject lines with personalization, test shorter subject lines, and verify your sending domain has proper SPF/DKIM/DMARC records.",
    });
  } else if (data.totalSent > 10 && data.openRate < 25) {
    recs.push({
      severity: "info",
      title: "Open rate could improve",
      description: `Open rate is ${data.openRate}%. Industry top performers achieve 30%+.`,
      action: "A/B test subject lines and send at optimal times (Tuesday-Thursday, 9-11am recipient local time).",
    });
  }

  if (data.totalSent > 20 && data.replyRate < 2) {
    recs.push({
      severity: "warning",
      title: "Very low reply rate",
      description: `Reply rate is ${data.replyRate}%, indicating emails may not be reaching the right audience or resonating.`,
      action: "Review email personalization, tighten ICP targeting, and test shorter, more conversational copy.",
    });
  }

  // Mailbox capacity warnings
  if (data.mailboxHealth) {
    for (const mb of data.mailboxHealth) {
      if (mb.sentToday >= mb.dailyLimit * 0.9) {
        recs.push({
          severity: "warning",
          title: `${mb.emailAddress} nearing daily limit`,
          description: `Sent ${mb.sentToday}/${mb.dailyLimit} today (${Math.round((mb.sentToday / mb.dailyLimit) * 100)}% capacity).`,
          action: "Add another sending mailbox or increase the daily limit for this mailbox in settings.",
        });
      }
      if (mb.bounceCount7d > 5) {
        recs.push({
          severity: "warning",
          title: `${mb.emailAddress} has ${mb.bounceCount7d} bounces this week`,
          description: "Repeated bounces from a single mailbox can trigger provider blocks.",
          action: "Pause sending from this mailbox until bounce causes are identified and resolved.",
        });
      }
    }
  }

  return recs;
}

function getTrendArrow(current: number, previous: number | undefined, inverse = false) {
  if (previous === undefined || previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 0.5) return { icon: Minus, color: "text-[var(--color-text-muted)]", label: "No change" };
  const isUp = diff > 0;
  const isGood = inverse ? !isUp : isUp;
  return {
    icon: isUp ? TrendingUp : TrendingDown,
    color: isGood ? "text-emerald-400" : "text-red-400",
    label: `${isUp ? "+" : ""}${diff.toFixed(1)}% vs last week`,
  };
}

function getMailboxHealthColor(score: number) {
  if (score >= 80) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function getMailboxStatusBadge(status: string): { variant: "success" | "warning" | "error" | "info"; label: string } {
  switch (status) {
    case "active": return { variant: "success", label: "Active" };
    case "warming_up": return { variant: "info", label: "Warming up" };
    case "paused": return { variant: "warning", label: "Paused" };
    case "suspended": return { variant: "error", label: "Suspended" };
    default: return { variant: "info", label: status };
  }
}

/**
 * Domain authentication checker. Wires the existing /api/deliverability/verify
 * endpoint (real SPF/DKIM/DMARC/MX DNS lookups) into the page — it was built
 * but never surfaced, so the founder had no way to see their DNS auth status.
 */
function DnsAuthCheck({ defaultDomain }: { defaultDomain?: string }) {
  const [domain, setDomain] = useState(defaultDomain ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    domain: string;
    score: number;
    checks: Record<string, { status: string; record?: string; details?: string }>;
    recommendations: string[];
  } | null>(null);

  useEffect(() => {
    if (defaultDomain && !domain) setDomain(defaultDomain);
  }, [defaultDomain]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run() {
    if (!domain.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/deliverability/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain: domain.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Check failed");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  const badge = (s: string): { variant: "success" | "warning" | "error"; label: string } =>
    s === "pass"
      ? { variant: "success", label: "Pass" }
      : s === "fail"
        ? { variant: "error", label: "Fail" }
        : { variant: "warning", label: "Missing" };

  const ROWS: Array<[string, string]> = [
    ["spf", "SPF"],
    ["dkim", "DKIM"],
    ["dmarc", "DMARC"],
    ["mx", "MX"],
  ];

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
              Domain authentication (SPF / DKIM / DMARC)
            </p>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              The DNS records that decide whether your mail reaches the inbox.
            </p>
          </div>
          {result && (
            <Badge variant={result.score >= 75 ? "success" : result.score >= 50 ? "warning" : "error"} size="md">
              {result.score}/100
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <input
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="yourdomain.com"
            className="flex-1 rounded-md px-3 py-1.5 text-[13px]"
            style={{ background: "var(--color-bg-card)", color: "var(--color-text-primary)", border: "1px solid var(--color-border-default)" }}
            onKeyDown={(e) => { if (e.key === "Enter") run(); }}
          />
          <button
            onClick={run}
            disabled={loading || !domain.trim()}
            className="rounded-md px-3 py-1.5 text-[12px] font-medium text-white"
            style={{ background: "var(--color-accent)", opacity: loading || !domain.trim() ? 0.6 : 1 }}
          >
            {loading ? "Checking..." : "Check DNS"}
          </button>
        </div>
        {error && <p className="text-[12px] text-red-400">{error}</p>}
        {result && (
          <div className="space-y-1.5">
            {ROWS.map(([key, label]) => {
              const c = result.checks[key] || { status: "missing" };
              const b = badge(c.status);
              return (
                <div key={key} className="flex items-center justify-between gap-3 rounded-md px-3 py-1.5" style={{ background: "var(--color-bg-page)" }}>
                  <span className="text-[12px] font-medium text-[var(--color-text-primary)]">{label}</span>
                  <div className="flex items-center gap-2 min-w-0">
                    {c.details && <span className="text-[11px] truncate text-[var(--color-text-tertiary)]">{c.details}</span>}
                    <Badge variant={b.variant} size="sm">{b.label}</Badge>
                  </div>
                </div>
              );
            })}
            {result.recommendations.length > 0 && (
              <ul className="mt-2 space-y-1">
                {result.recommendations.map((r, i) => (
                  <li key={i} className="text-[11px] text-[var(--color-text-secondary)]">• {r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default function DeliverabilityPage() {
  const [data, setData] = useState<DeliverabilityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/deliverability")
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch((e) => console.warn("deliverability: fetch failed", e))
      .finally(() => setLoading(false));
  }, []);

  function getHealthColor(label: string) {
    if (label === "excellent") return "text-emerald-400";
    if (label === "good") return "text-blue-400";
    if (label === "fair") return "text-amber-400";
    return "text-red-400";
  }

  function getHealthBadgeVariant(label: string): "success" | "warning" | "error" | "info" {
    if (label === "excellent") return "success";
    if (label === "good") return "info";
    if (label === "fair") return "warning";
    return "error";
  }

  function getRateColor(rate: number, goodThreshold: number, badThreshold: number, inverse = false) {
    if (inverse) {
      if (rate <= goodThreshold) return "text-emerald-400";
      if (rate <= badThreshold) return "text-amber-400";
      return "text-red-400";
    }
    if (rate >= goodThreshold) return "text-emerald-400";
    if (rate >= badThreshold) return "text-amber-400";
    return "text-red-400";
  }

  function getBounceRateBg(rate: number) {
    if (rate <= 2) return "border-emerald-500/20 bg-emerald-500/5";
    if (rate <= 5) return "border-amber-500/20 bg-amber-500/5";
    return "border-red-500/20 bg-red-500/5";
  }

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Deliverability" subtitle="Email sending health and monitoring" />
        <div className="flex-1 overflow-auto px-4 py-6">
          {/* Domain authentication (SPF / DKIM / DMARC) card — full width */}
          <div className="skeleton-row mb-4 rounded-lg p-4" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
            <div className="mb-3">
              <div className="skeleton h-3.5 w-64 rounded" />
              <div className="skeleton mt-1.5 h-2.5 w-72 rounded" />
            </div>
            <div className="flex items-center gap-2">
              <div className="skeleton h-8 flex-1 rounded-md" />
              <div className="skeleton h-8 w-24 rounded-md" />
            </div>
          </div>
          {/* KPI grid — Sent / Open / Reply / Bounce / Spam / Replied */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton-row rounded-lg p-4" style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}>
                <div className="skeleton h-2.5 w-12 rounded" />
                <div className="skeleton mt-2 h-6 w-14 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Deliverability" subtitle="Email sending health and monitoring" />
        <div className="px-4 py-6">
          <p className="text-sm text-[var(--color-text-tertiary)]">Failed to load deliverability data.</p>
        </div>
      </div>
    );
  }

  const recommendations = getRecommendations(data);
  const criticalRecs = recommendations.filter((r) => r.severity === "critical");
  const warningRecs = recommendations.filter((r) => r.severity === "warning");
  const infoRecs = recommendations.filter((r) => r.severity === "info");

  const openRateTrend = getTrendArrow(data.openRate, data.prevWeek?.openRate);
  const replyRateTrend = getTrendArrow(data.replyRate, data.prevWeek?.replyRate);
  const bounceRateTrend = getTrendArrow(data.bounceRate, data.prevWeek?.bounceRate, true);
  const spamRateTrend = getTrendArrow(data.spamRate, data.prevWeek?.spamRate, true);

  return (
    <div className="flex h-full flex-col animate-content-in">
      <PageHeader title="Deliverability" subtitle="Email sending health and monitoring">
        {data.totalSent === 0 ? (
          <Badge variant="info" size="md">No emails sent yet</Badge>
        ) : (
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Health Score</p>
              <p className={`text-2xl font-bold ${getHealthColor(data.healthLabel)}`}>
                {data.healthScore}
              </p>
            </div>
            <Badge variant={getHealthBadgeVariant(data.healthLabel)} size="md">
              {data.healthLabel.toUpperCase()}
            </Badge>
          </div>
        )}
      </PageHeader>

      <div className="flex-1 overflow-auto px-4 py-6">
        {/* Domain authentication (SPF/DKIM/DMARC) — wires the /verify endpoint */}
        <div className="mb-4">
          <DnsAuthCheck defaultDomain={data.mailboxHealth?.[0]?.emailAddress?.split("@")[1]} />
        </div>

        {/* Actionable Recommendations */}
        {criticalRecs.length > 0 && (
          <div className="space-y-2 mb-4">
            {criticalRecs.map((rec, i) => (
              <div key={i} className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
                <div className="flex items-start gap-3">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0 text-red-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-red-300">{rec.title}</p>
                    <p className="mt-1 text-[12px] text-red-300/80">{rec.description}</p>
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2">
                      <ArrowDown size={12} className="mt-0.5 shrink-0 text-red-400 rotate-[-90deg]" />
                      <p className="text-[11px] font-medium text-red-200">{rec.action}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {warningRecs.length > 0 && (
          <div className="space-y-2 mb-4">
            {warningRecs.map((rec, i) => (
              <div key={i} className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-amber-300">{rec.title}</p>
                    <p className="mt-1 text-[12px] text-amber-300/80">{rec.description}</p>
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2">
                      <ArrowDown size={12} className="mt-0.5 shrink-0 text-amber-400 rotate-[-90deg]" />
                      <p className="text-[11px] font-medium text-amber-200">{rec.action}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {infoRecs.length > 0 && (
          <div className="space-y-2 mb-4">
            {infoRecs.map((rec, i) => (
              <div key={i} className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex items-start gap-3">
                  <MessageSquare size={18} className="mt-0.5 shrink-0 text-blue-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-blue-300">{rec.title}</p>
                    <p className="mt-1 text-[12px] text-blue-300/80">{rec.description}</p>
                    <div className="mt-2 flex items-start gap-2 rounded-md bg-blue-500/10 px-3 py-2">
                      <ArrowDown size={12} className="mt-0.5 shrink-0 text-blue-400 rotate-[-90deg]" />
                      <p className="text-[11px] font-medium text-blue-200">{rec.action}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Legacy warnings (from API) that aren't covered by recommendations */}
        {data.warnings.length > 0 && recommendations.length === 0 && (
          <div className="space-y-2">
            {data.warnings.map((w, i) => (
              <div key={i} className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">
                {w}
              </div>
            ))}
          </div>
        )}

        {/* KPI Grid — hidden until something has actually been sent. With zero
            sends, getRateColor paints Open/Reply rate at 0% in alarming RED (a
            deliverability "problem" that's really just "nothing sent yet"), and
            the grid would render at the same time as the "No emails sent yet"
            empty state below — a contradictory, broken-looking double state. */}
        {data.totalSent > 0 && (
        <div className={`${recommendations.length > 0 || data.warnings.length > 0 ? "" : ""} grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3`}>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Sent</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">{data.totalSent}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Open Rate</p>
              <div className="flex items-end gap-1.5">
                <p className={`mt-1 text-2xl font-semibold ${getRateColor(data.openRate, 30, 15)}`}>
                  {data.openRate}%
                </p>
                {openRateTrend && (
                  <div className={`flex items-center gap-0.5 pb-1 ${openRateTrend.color}`} title={openRateTrend.label}>
                    <openRateTrend.icon size={12} />
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Reply Rate</p>
              <div className="flex items-end gap-1.5">
                <p className={`mt-1 text-2xl font-semibold ${getRateColor(data.replyRate, 5, 2)}`}>
                  {data.replyRate}%
                </p>
                {replyRateTrend && (
                  <div className={`flex items-center gap-0.5 pb-1 ${replyRateTrend.color}`} title={replyRateTrend.label}>
                    <replyRateTrend.icon size={12} />
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Bounce Rate</p>
              <div className={`mt-1 rounded-md border px-2 py-1 ${getBounceRateBg(data.bounceRate)}`}>
                <div className="flex items-end gap-1.5">
                  <p className={`text-2xl font-semibold ${getRateColor(data.bounceRate, 2, 5, true)}`}>
                    {data.bounceRate}%
                  </p>
                  {bounceRateTrend && (
                    <div className={`flex items-center gap-0.5 pb-1 ${bounceRateTrend.color}`} title={bounceRateTrend.label}>
                      <bounceRateTrend.icon size={12} />
                    </div>
                  )}
                </div>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Spam Rate</p>
              <div className="flex items-end gap-1.5">
                <p className={`mt-1 text-2xl font-semibold ${getRateColor(data.spamRate, 0.05, 0.1, true)}`}>
                  {data.spamRate}%
                </p>
                {spamRateTrend && (
                  <div className={`flex items-center gap-0.5 pb-1 ${spamRateTrend.color}`} title={spamRateTrend.label}>
                    <spamRateTrend.icon size={12} />
                  </div>
                )}
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Replied</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--color-text-primary)]">{data.totalReplied}</p>
            </CardBody>
          </Card>
        </div>
        )}

        {/* Domain Health per Mailbox */}
        {data.mailboxHealth && data.mailboxHealth.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Mailbox Health
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.mailboxHealth.map((mb) => {
                const statusBadge = getMailboxStatusBadge(mb.status);
                const usagePercent = mb.dailyLimit > 0 ? Math.round((mb.sentToday / mb.dailyLimit) * 100) : 0;
                return (
                  <Card key={mb.id}>
                    <CardBody>
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Mail size={14} className="shrink-0 text-[var(--color-text-muted)]" />
                          <p className="text-[12px] font-medium text-[var(--color-text-primary)] truncate">{mb.emailAddress}</p>
                        </div>
                        <Badge variant={statusBadge.variant} size="sm">{statusBadge.label}</Badge>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2">
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Health</p>
                          <p className={`text-[14px] font-bold ${getMailboxHealthColor(mb.healthScore)}`}>{mb.healthScore}</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Sent today</p>
                          <p className="text-[14px] font-bold text-[var(--color-text-primary)]">{mb.sentToday}/{mb.dailyLimit}</p>
                        </div>
                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)]">Bounces (7d)</p>
                          <p className={`text-[14px] font-bold ${mb.bounceCount7d > 5 ? "text-red-400" : mb.bounceCount7d > 0 ? "text-amber-400" : "text-emerald-400"}`}>{mb.bounceCount7d}</p>
                        </div>
                      </div>
                      {/* Usage bar */}
                      <div className="mt-2">
                        <div className="h-1.5 w-full rounded-full bg-[var(--color-bg-page)]">
                          <div
                            className={`h-1.5 rounded-full transition-all ${usagePercent >= 90 ? "bg-red-400" : usagePercent >= 70 ? "bg-amber-400" : "bg-emerald-400"}`}
                            style={{ width: `${Math.min(usagePercent, 100)}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[9px] text-[var(--color-text-muted)]">{usagePercent}% daily capacity used</p>
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Enrollment Status */}
        {Object.keys(data.enrollmentsByStatus).length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]">
              Sequence Enrollments
            </h2>
            <div className="mt-3 flex gap-3 flex-wrap">
              {Object.entries(data.enrollmentsByStatus).map(([status, count]) => (
                <Card key={status}>
                  <div className="px-4 py-2">
                    <span className="text-xs text-[var(--color-text-tertiary)] capitalize">{status}</span>
                    <span className="ml-2 text-sm font-semibold text-[var(--color-text-primary)]">{count}</span>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}

        {data.totalSent === 0 && (
          <div className="mt-8 flex flex-1 items-center justify-center">
            <div className="text-center">
              <p className="text-lg text-[var(--color-text-tertiary)]">No emails sent yet</p>
              <p className="mt-1 text-sm text-[var(--color-text-tertiary)]">
                Start sending sequences to see deliverability metrics.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
