"use client";

/**
 * Cohort insights card for /reports — surfaces GET /api/analytics/cohorts
 * (lib/insights/cohort-engine.ts). The honest version: very few claims, each
 * one that survived multiple-comparison correction, and a plain "nothing
 * stands out" when that is the truth (no p-hacked vanity segments).
 */

import { useState, useEffect } from "react";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, Loader2, FlaskConical, TrendingUp } from "lucide-react";

interface Cohort {
  dimension: string;
  value: string;
  n: number;
  won: number;
  rate: number;
  baselineRate: number;
  lift: number;
  tier: "insight" | "hypothesis" | "observation";
  recommendation: string;
}
interface CohortData {
  totalClosed: number;
  insights: Cohort[];
  hypotheses: Cohort[];
  summary: string;
}

const DIM_LABEL: Record<string, string> = { industry: "Industry", persona: "Persona" };

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function CohortRow({ c, kind }: { c: Cohort; kind: "insight" | "hypothesis" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--color-bg-page)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[13px] font-semibold capitalize" style={{ color: "var(--color-text-primary)" }}>{c.value}</span>
        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{DIM_LABEL[c.dimension] || c.dimension}</span>
        <Badge variant={kind === "insight" ? "success" : "warning"} size="sm">
          {c.lift.toFixed(1)}× win rate
        </Badge>
        <span className="text-[11px] tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>
          {pct(c.rate)} vs {pct(c.baselineRate)} baseline · {c.won}/{c.n} won
        </span>
      </div>
      <p className="mt-1.5 text-[12px] leading-relaxed" style={{ color: "var(--color-text-secondary)" }}>{c.recommendation}</p>
    </div>
  );
}

export function CohortInsights() {
  const [data, setData] = useState<CohortData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/analytics/cohorts");
        if (!res.ok) throw new Error(`Failed to load cohorts (${res.status})`);
        const d = (await res.json()) as CohortData;
        if (alive) setData(d);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Failed to load cohorts");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <Card>
        <CardBody>
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
            <Loader2 size={14} className="animate-spin" /> Reading the cohorts…
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

  const hasAny = data.insights.length > 0 || data.hypotheses.length > 0;

  return (
    <Card>
      <CardBody>
        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-soft)" }}>
              <Layers size={16} style={{ color: "var(--color-accent)" }} />
            </div>
            <div>
              <h3 className="text-[14px] font-semibold" style={{ color: "var(--color-text-primary)" }}>Cohort insights</h3>
              <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>{data.totalClosed} closed deals analyzed</p>
            </div>
          </div>
        </div>

        {/* Honest summary — also the empty state */}
        <p className="mt-3 text-[13px] leading-relaxed" style={{ color: hasAny ? "var(--color-text-secondary)" : "var(--color-text-tertiary)" }}>
          {data.summary}
        </p>

        {/* Insights — survived correction */}
        {data.insights.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5">
              <TrendingUp size={12} style={{ color: "var(--color-success)" }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Significant segments</p>
            </div>
            <div className="mt-2 space-y-2">
              {data.insights.map((c, i) => <CohortRow key={`i-${i}`} c={c} kind="insight" />)}
            </div>
          </div>
        )}

        {/* Hypotheses — worth a controlled test, not a conclusion */}
        {data.hypotheses.length > 0 && (
          <div className="mt-4">
            <div className="flex items-center gap-1.5">
              <FlaskConical size={12} style={{ color: "var(--color-warning)" }} />
              <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>Worth testing</p>
            </div>
            <div className="mt-2 space-y-2">
              {data.hypotheses.map((c, i) => <CohortRow key={`h-${i}`} c={c} kind="hypothesis" />)}
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
