"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, TrendingDown, TrendingUp, Activity, ChevronDown } from "lucide-react";
import { AIThinking, ConfidenceState } from "@/components/ai-ui";
import { OnboardingVelocityTile } from "@/components/onboarding-velocity-tile";
import { EvalRunDrilldown } from "@/components/evals/eval-run-drilldown";
import { SettingsHeader } from "@/components/ui/settings-header";

/**
 * Sprint-1 audit follow-up — admin dashboard surface for the
 * `/api/admin/llm-evals` endpoint.
 *
 * Three sections :
 *   1. Calls aggregate per surface — total cost, latency p95,
 *      error rate, retry rate, fallback rate.
 *   2. Eval-runs timeline — pass-rate per suite over the last
 *      8 weeks. Drift is visible at a glance.
 *   3. Recent terminal failures — for incident triage.
 */
interface CallsRow {
  surfaceId: string;
  promptId: string;
  total: number;
  okRate: number;
  errorCount: number;
  timeoutCount: number;
  fallbackRate: number;
  retryRate: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
}

interface EvalRow {
  /** Surfaced from the API so the dashboard can deep-link into the
   *  per-case drill-down. */
  id: string;
  surfaceId: string;
  promptId: string;
  createdAt: string;
  casesTotal: number;
  casesPassed: number;
  casesErrored: number;
  passRate: number;
  metrics: Record<string, number>;
  totalLatencyMs: number;
  totalCostUsd: number | null;
}

interface FailureRow {
  id: string;
  surfaceId: string;
  promptId: string;
  model: string;
  outcome: string;
  attempts: number;
  fallbackTriggered: boolean;
  latencyMs: number;
  errorMessage: string | null;
  createdAt: string;
}

interface DashboardData {
  windowDays: number;
  callsBySurface: CallsRow[];
  evalRuns: EvalRow[];
  recentFailures: FailureRow[];
}

function formatUsd(n: number): string {
  if (n < 0.01) return `$${(n * 100).toFixed(3)}¢`;
  if (n < 1) return `$${n.toFixed(4)}`;
  if (n < 100) return `$${n.toFixed(2)}`;
  return `$${Math.round(n).toLocaleString()}`;
}

function formatMs(n: number): string {
  if (n < 1000) return `${Math.round(n)}ms`;
  return `${(n / 1000).toFixed(1)}s`;
}

function formatPercent(n: number, decimals = 0): string {
  return `${(n * 100).toFixed(decimals)}%`;
}

function relativeTime(iso: string): string {
  const dt = new Date(iso).getTime();
  if (!Number.isFinite(dt)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - dt) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function LlmEvalsDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState<number>(7);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/llm-evals?days=${days}`);
      if (!res.ok) {
        if (res.status === 403) throw new Error("Admin role required");
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as DashboardData;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  // Group eval runs by surfaceId + promptId for the timeline display.
  const evalGroups = (data?.evalRuns ?? []).reduce<Record<string, EvalRow[]>>((acc, r) => {
    const k = `${r.surfaceId}|${r.promptId}`;
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});

  // Per-case drill-down — exclusive : at most one open at a time.
  // Click a timeline bar OR the explicit "Inspect latest" button.
  const [drilldownRunId, setDrilldownRunId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <SettingsHeader
            title="LLM observability"
            subtitle="Cost, latency, retry, fallback per surface · eval-suite drift over time · recent terminal failures."
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-md border px-2 py-1 text-[12px]"
            style={{ background: "var(--color-bg-card)", borderColor: "var(--color-border-default)" }}
          >
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px]"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
              color: "var(--color-text-secondary)",
            }}
          >
            <RefreshCw size={11} />
            Refresh
          </button>
        </div>
      </header>

      {/* P0-3 follow-up : onboarding-velocity admin tile. Renders
          itself when the caller is admin AND there's at least one
          started onboarding row ; hides silently otherwise. */}
      <OnboardingVelocityTile />

      {loading && <AIThinking step="Loading observability snapshot…" />}

      {error && !loading && (
        <div
          role="alert"
          className="rounded-lg p-3 text-[12px]"
          style={{
            background: "rgba(220,38,38,0.08)",
            color: "var(--color-error, #b91c1c)",
            border: "1px solid rgba(220,38,38,0.25)",
          }}
        >
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          {/* ── Calls aggregate per surface ─────────────────────────── */}
          <section
            className="rounded-xl"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <header className="flex items-center justify-between p-4">
              <div>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Calls aggregate
                </h2>
                <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Per surface × prompt-version, last {data.windowDays} day{data.windowDays > 1 ? "s" : ""}.
                </p>
              </div>
              <Activity size={14} style={{ color: "var(--color-text-tertiary)" }} />
            </header>
            {data.callsBySurface.length === 0 ? (
              <div className="px-4 pb-4 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                No calls in window. The wrapper writes here once a surface adopts `llmCall`.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr style={{ color: "var(--color-text-tertiary)" }}>
                    <th className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wider">Surface · prompt</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider">Calls</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider">OK rate</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider">Retry %</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider">Fallback %</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider">Avg / p95</th>
                    <th className="px-4 py-2 text-right text-[10px] font-semibold uppercase tracking-wider">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.callsBySurface.map((row) => {
                    const okHigh = row.okRate >= 0.98;
                    const okMid = row.okRate >= 0.90;
                    return (
                      <tr key={`${row.surfaceId}-${row.promptId}`} style={{ borderTop: "1px solid var(--color-border-default)" }}>
                        <td className="px-4 py-2.5">
                          <div className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {row.surfaceId}
                          </div>
                          <div className="font-mono text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                            {row.promptId}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{row.total.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className="tabular-nums"
                            style={{
                              color: okHigh
                                ? "var(--color-success, #059669)"
                                : okMid
                                  ? "var(--color-warning, #d97706)"
                                  : "var(--color-error, #b91c1c)",
                            }}
                          >
                            {formatPercent(row.okRate, 1)}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
                          {formatPercent(row.retryRate, 1)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
                          {formatPercent(row.fallbackRate, 1)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "var(--color-text-secondary)" }}>
                          {formatMs(row.avgLatencyMs)} / {formatMs(row.p95LatencyMs)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {formatUsd(row.totalCostUsd)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          {/* ── Eval-run timeline ───────────────────────────────────── */}
          <section
            className="rounded-xl p-4"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <header className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Eval-suite drift
                </h2>
                <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Pass-rate per suite over the last 8 weeks. Drops surface prompt regression.
                </p>
              </div>
            </header>
            {Object.keys(evalGroups).length === 0 ? (
              <div className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                No eval runs yet. The weekly cron fires Mondays 02:00 UTC.
              </div>
            ) : (
              <div className="space-y-3">
                {Object.entries(evalGroups).map(([key, runs]) => {
                  const sorted = [...runs].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                  );
                  const first = sorted[0];
                  const last = sorted[sorted.length - 1];
                  const trend =
                    sorted.length < 2
                      ? "flat"
                      : last.passRate > first.passRate
                        ? "up"
                        : last.passRate < first.passRate
                          ? "down"
                          : "flat";
                  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Activity;
                  const trendColor =
                    trend === "up"
                      ? "var(--color-success, #059669)"
                      : trend === "down"
                        ? "var(--color-error, #b91c1c)"
                        : "var(--color-text-tertiary)";
                  return (
                    <div key={key} className="rounded-lg p-3" style={{ background: "var(--color-bg-hover)" }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[12px] font-medium" style={{ color: "var(--color-text-primary)" }}>
                            {last.surfaceId}
                          </div>
                          <div className="font-mono text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                            {last.promptId}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <ConfidenceState
                            level={
                              last.passRate >= 0.95
                                ? "verified"
                                : last.passRate >= 0.80
                                  ? "likely"
                                  : last.passRate >= 0.60
                                    ? "uncertain"
                                    : "unverified"
                            }
                            label={`Latest ${formatPercent(last.passRate)}`}
                            reason={`${last.casesPassed}/${last.casesTotal} cases passed`}
                          />
                          <TrendIcon size={13} style={{ color: trendColor }} />
                        </div>
                      </div>
                      {/* Mini timeline of pass-rates — click a bar
                          to drill into that run's per-case detail. */}
                      <div className="mt-2 flex h-6 items-end gap-0.5">
                        {sorted.map((r) => {
                          const h = Math.max(2, Math.round(r.passRate * 24));
                          const active = drilldownRunId === r.id;
                          return (
                            <button
                              key={r.id}
                              type="button"
                              onClick={() => setDrilldownRunId(r.id)}
                              title={`${new Date(r.createdAt).toLocaleDateString()} — ${formatPercent(r.passRate)} (${r.casesPassed}/${r.casesTotal}) — click to inspect`}
                              className="flex-1 rounded-sm transition-opacity"
                              style={{
                                height: `${h}px`,
                                background:
                                  r.passRate >= 0.95
                                    ? "var(--color-success, #059669)"
                                    : r.passRate >= 0.80
                                      ? "var(--color-warning, #d97706)"
                                      : "var(--color-error, #b91c1c)",
                                opacity: active ? 1 : 0.7,
                                outline: active
                                  ? "2px solid var(--color-accent, #6366f1)"
                                  : undefined,
                                outlineOffset: active ? "1px" : undefined,
                                cursor: "pointer",
                              }}
                              aria-label={`Inspect run from ${new Date(r.createdAt).toLocaleDateString()}`}
                            />
                          );
                        })}
                      </div>
                      {/* Inspect-latest CTA — the bar tooltip is a
                          discoverability gap, this is the obvious one. */}
                      <button
                        type="button"
                        onClick={() => setDrilldownRunId(last.id)}
                        className="mt-2 flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium"
                        style={{
                          background: "var(--color-bg-card)",
                          color: "var(--color-text-secondary)",
                          border: "1px solid var(--color-border-default)",
                        }}
                      >
                        Inspect latest <ChevronDown size={10} aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {drilldownRunId && (
            <EvalRunDrilldown
              runId={drilldownRunId}
              onClose={() => setDrilldownRunId(null)}
            />
          )}

          {/* ── Recent failures ─────────────────────────────────────── */}
          <section
            className="rounded-xl"
            style={{ background: "var(--color-bg-card)", border: "1px solid var(--color-border-default)" }}
          >
            <header className="flex items-center justify-between p-4">
              <div>
                <h2 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  Recent terminal failures
                </h2>
                <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  Calls that ended in error or timeout — for incident triage.
                </p>
              </div>
              {data.recentFailures.length > 0 && (
                <AlertTriangle size={14} style={{ color: "var(--color-error, #b91c1c)" }} />
              )}
            </header>
            {data.recentFailures.length === 0 ? (
              <div className="px-4 pb-4 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                No failures in window — clean.
              </div>
            ) : (
              <ul className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
                {data.recentFailures.map((f) => (
                  <li key={f.id} className="px-4 py-2.5 text-[12px]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                          style={{
                            background:
                              f.outcome === "timeout"
                                ? "rgba(217,119,6,0.10)"
                                : "rgba(220,38,38,0.10)",
                            color:
                              f.outcome === "timeout"
                                ? "var(--color-warning, #d97706)"
                                : "var(--color-error, #b91c1c)",
                          }}
                        >
                          {f.outcome}
                        </span>
                        <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                          {f.surfaceId}
                        </span>
                        <span className="font-mono text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                          {f.promptId} · {f.model}
                        </span>
                        {f.fallbackTriggered && (
                          <span className="text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
                            (fallback fired)
                          </span>
                        )}
                      </div>
                      <span style={{ color: "var(--color-text-tertiary)" }}>
                        {formatMs(f.latencyMs)} · {f.attempts}× · {relativeTime(f.createdAt)}
                      </span>
                    </div>
                    {f.errorMessage && (
                      <div
                        className="mt-1 truncate font-mono text-[11px]"
                        style={{ color: "var(--color-text-secondary)" }}
                        title={f.errorMessage}
                      >
                        {f.errorMessage}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
