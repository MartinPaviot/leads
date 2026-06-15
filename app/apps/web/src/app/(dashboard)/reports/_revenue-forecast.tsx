"use client";

/**
 * Revenue forecast card for /reports — surfaces GET /api/analytics/forecast
 * (lib/analytics/rev-equation.ts). The honest read: a revenue RANGE (never a
 * bare point), the binding bottleneck, and the funnel rates behind it, with an
 * inline monthly-goal setter that feeds the coverage/bottleneck diagnosis.
 */

import { useState, useEffect, useCallback } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, Loader2, Target, Check, AlertCircle } from "lucide-react";

interface ForecastData {
  windowDays: number;
  goalSet: boolean;
  inputs: { contacted: number; replied: number; qualified: number; proposal: number; won: number; acv: number; activeDeals: number };
  expectedDeals: number;
  revenue: { mean: number; p10: number; p90: number; cvPercent: number };
  rates: Record<string, number>;
  rateSource: Record<string, "observed" | "prior">;
  bottleneck: "demand" | "conversion" | "capacity";
  coverage: { dealsNeeded: number; oppsInPlay: number; ratio: number } | null;
  dataConfidence: "prior-dominated" | "blending" | "data-dominated";
  diagnosis: string;
  notes: string[];
}

const STAGE_ORDER = ["reply", "replyToBooked", "bookedToShowed", "showedToQualified", "qualifiedToProposal", "proposalToWon"] as const;
const STAGE_LABELS: Record<string, string> = {
  reply: "Contact → reply",
  replyToBooked: "Reply → meeting",
  bookedToShowed: "Meeting → showed",
  showedToQualified: "Showed → qualified",
  qualifiedToProposal: "Qualified → proposal",
  proposalToWon: "Proposal → won",
};

const BOTTLENECK: Record<ForecastData["bottleneck"], { label: string; variant: "warning" | "info" | "error" }> = {
  demand: { label: "Demand-constrained", variant: "warning" },
  conversion: { label: "Conversion-constrained", variant: "info" },
  capacity: { label: "At capacity", variant: "error" },
};

const CONFIDENCE: Record<ForecastData["dataConfidence"], string> = {
  "prior-dominated": "Mostly benchmark priors",
  blending: "Blending your data",
  "data-dominated": "Your data",
};

function money(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return `$${Math.round(n)}`;
}

export function RevenueForecast() {
  const [data, setData] = useState<ForecastData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [goalInput, setGoalInput] = useState("");
  const [savingGoal, setSavingGoal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [fRes, gRes] = await Promise.all([
        fetch("/api/analytics/forecast"),
        fetch("/api/analytics/revenue-goal"),
      ]);
      if (!fRes.ok) throw new Error(`Failed to load forecast (${fRes.status})`);
      const f = (await fRes.json()) as ForecastData;
      setData(f);
      if (gRes.ok) {
        const g = (await gRes.json()) as { monthly: number | null };
        setGoalInput(g.monthly != null ? String(g.monthly) : "");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load forecast");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveGoal = useCallback(async () => {
    setSavingGoal(true);
    setError(null);
    try {
      const res = await fetch("/api/analytics/revenue-goal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthly: goalInput.trim() === "" ? null : goalInput }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Failed to save goal");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save goal");
    } finally {
      setSavingGoal(false);
    }
  }, [goalInput, load]);

  if (loading) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Loader2 size={14} className="animate-spin" /> Computing the revenue forecast…
          </div>
        </CardBody>
      </Card>
    );
  }
  if (error && !data) {
    return (
      <Card>
        <CardBody>
          <p className="text-[13px]" style={{ color: "var(--color-error)" }}>{error}</p>
        </CardBody>
      </Card>
    );
  }
  if (!data) return null;

  const bn = BOTTLENECK[data.bottleneck];

  return (
    <Card>
      <CardBody>
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-soft)" }}>
              <TrendingUp size={16} style={{ color: "var(--color-accent)" }} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Revenue forecast</h3>
              <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>Run-rate over the last {data.windowDays} days</p>
            </div>
          </div>
          <Badge variant="neutral" size="sm">{CONFIDENCE[data.dataConfidence]}</Badge>
        </div>

        {/* Range — the headline, never a bare point */}
        <div className="mt-4 flex items-end gap-3">
          <span className="text-[28px] font-bold leading-none tabular-nums" style={{ color: "var(--color-text-primary)" }}>
            {money(data.revenue.mean)}
          </span>
          <span className="pb-0.5 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            range {money(data.revenue.p10)} – {money(data.revenue.p90)} · ±{data.revenue.cvPercent}%
          </span>
        </div>
        <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          ≈ {data.expectedDeals.toFixed(1)} closed-won deals at current rates
          {data.inputs.acv > 0 ? ` · ACV ${money(data.inputs.acv)}` : ""}
        </p>

        {/* Bottleneck + diagnosis */}
        <div className="mt-4 rounded-lg p-3" style={{ background: "var(--color-bg-page)" }}>
          <div className="flex items-center gap-2">
            <Badge variant={bn.variant} size="sm">{bn.label}</Badge>
            {data.coverage && (
              <span className="text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
                {data.coverage.ratio.toFixed(1)}× coverage · {data.coverage.oppsInPlay} in play / {data.coverage.dealsNeeded} needed
              </span>
            )}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{data.diagnosis}</p>
        </div>

        {/* Monthly goal setter */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            <Target size={13} style={{ color: "var(--color-text-tertiary)" }} /> Monthly revenue goal
          </div>
          <div className="flex items-center gap-1 rounded-md border px-2" style={{ borderColor: "var(--color-border-default)", background: "var(--color-bg-card)" }}>
            <span className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>$</span>
            <input
              type="text"
              inputMode="numeric"
              value={goalInput}
              onChange={(e) => setGoalInput(e.target.value)}
              placeholder="e.g. 50000"
              className="h-7 w-28 bg-transparent text-[12px] outline-none tabular-nums"
              style={{ color: "var(--color-text-primary)" }}
              onKeyDown={(e) => { if (e.key === "Enter" && !savingGoal) saveGoal(); }}
            />
          </div>
          <Button variant="outline" size="sm" loading={savingGoal} onClick={saveGoal}>
            {savingGoal ? "Saving…" : "Save goal"}
          </Button>
          {!data.goalSet && (
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              Set a goal for a real bottleneck read.
            </span>
          )}
        </div>

        {/* Funnel rates */}
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Funnel rates</p>
          <div className="mt-2 grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
            {STAGE_ORDER.map((s) => (
              <div key={s} className="flex items-center justify-between text-[12px]">
                <span style={{ color: "var(--color-text-secondary)" }}>{STAGE_LABELS[s]}</span>
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums font-medium" style={{ color: "var(--color-text-primary)" }}>
                    {(data.rates[s] * 100).toFixed(data.rates[s] < 0.1 ? 1 : 0)}%
                  </span>
                  <span
                    className="text-[10px] uppercase tracking-wide"
                    style={{ color: data.rateSource[s] === "observed" ? "var(--color-success)" : "var(--color-text-muted)" }}
                    title={data.rateSource[s] === "observed" ? "From your data" : "Benchmark prior (not enough of your data yet)"}
                  >
                    {data.rateSource[s] === "observed" ? "yours" : "prior"}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Notes */}
        {data.notes.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {data.notes.map((n, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span className="leading-relaxed">{n}</span>
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
