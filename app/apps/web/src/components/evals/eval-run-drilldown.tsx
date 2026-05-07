"use client";

/**
 * EvalRunDrilldown — modal-ish panel that fetches per-case detail
 * for a single `eval_runs` row and renders failed/errored/passed
 * groups with snippets + error messages.
 *
 * Used by the LLM-evals admin dashboard to drill into a regressing
 * eval. The panel is mounted inline (not in a portal) so the
 * dashboard scroll stays predictable ; a close button collapses it.
 */

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  Filter,
} from "lucide-react";

interface CaseRow {
  id: string;
  caseId: string;
  passed: boolean;
  errored: boolean;
  latencyMs: number;
  errorMessage: string | null;
  outputSnippet: string | null;
  createdAt: string | null;
}

interface RunDetail {
  id: string;
  surfaceId: string;
  promptId: string;
  casesTotal: number;
  casesPassed: number;
  casesErrored: number;
  casesFailed: number;
  metrics: Record<string, number>;
  totalLatencyMs: number;
  totalCostUsd: number | null;
  createdAt: string | null;
}

interface EvalRunDrilldownProps {
  runId: string;
  onClose: () => void;
}

export function EvalRunDrilldown({ runId, onClose }: EvalRunDrilldownProps) {
  const [data, setData] = useState<{
    run: RunDetail;
    cases: CaseRow[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [onlyFailing, setOnlyFailing] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/eval-runs/${encodeURIComponent(runId)}/cases${
            onlyFailing ? "?onlyFailing=1" : ""
          }`,
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, onlyFailing]);

  return (
    <div
      className="rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <header
        className="flex items-center justify-between border-b p-4"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <div>
          <h3
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Run detail
          </h3>
          {data?.run && (
            <p
              className="mt-0.5 text-[11px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              {data.run.surfaceId} ·{" "}
              <span className="font-mono">{data.run.promptId}</span> ·{" "}
              {data.run.createdAt
                ? new Date(data.run.createdAt).toLocaleString()
                : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOnlyFailing((s) => !s)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px]"
            style={{
              background: onlyFailing
                ? "var(--color-accent-soft, rgba(99,102,241,0.10))"
                : "var(--color-bg-card)",
              color: onlyFailing
                ? "var(--color-accent, #6366f1)"
                : "var(--color-text-secondary)",
              border: "1px solid var(--color-border-default)",
            }}
            title={
              onlyFailing
                ? "Show passing cases too"
                : "Hide passing cases (show only failures + errors)"
            }
          >
            <Filter size={10} aria-hidden />
            {onlyFailing ? "Failing only" : "All cases"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1"
            style={{
              background: "var(--color-bg-card)",
              color: "var(--color-text-tertiary)",
            }}
            aria-label="Close drill-down"
          >
            <X size={13} />
          </button>
        </div>
      </header>

      {loading && (
        <div className="flex items-center gap-2 p-4 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
          <Loader2 size={13} className="animate-spin" /> Loading per-case detail…
        </div>
      )}

      {error && !loading && (
        <div
          role="alert"
          className="m-4 rounded-lg p-3 text-[12px]"
          style={{
            background: "rgba(220,38,38,0.08)",
            color: "var(--color-error, #b91c1c)",
            border: "1px solid rgba(220,38,38,0.25)",
          }}
        >
          <div className="flex items-start gap-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {data && !loading && (
        <>
          <SummaryStrip run={data.run} />
          <CaseList cases={data.cases} onlyFailing={onlyFailing} />
        </>
      )}
    </div>
  );
}

function SummaryStrip({ run }: { run: RunDetail }) {
  const passRate = run.casesTotal ? run.casesPassed / run.casesTotal : 0;
  return (
    <div
      className="grid grid-cols-4 gap-3 border-b p-4"
      style={{ borderColor: "var(--color-border-default)" }}
    >
      <Stat label="Total" value={String(run.casesTotal)} />
      <Stat
        label="Passed"
        value={String(run.casesPassed)}
        color="var(--color-success, #059669)"
      />
      <Stat
        label="Failed"
        value={String(run.casesFailed)}
        color={run.casesFailed > 0 ? "var(--color-error, #b91c1c)" : undefined}
      />
      <Stat
        label="Errored"
        value={String(run.casesErrored)}
        color={
          run.casesErrored > 0 ? "var(--color-warning, #d97706)" : undefined
        }
      />
      <Stat
        label="Pass rate"
        value={`${(passRate * 100).toFixed(0)}%`}
        color={
          passRate >= 0.95
            ? "var(--color-success, #059669)"
            : passRate >= 0.8
              ? "var(--color-warning, #d97706)"
              : "var(--color-error, #b91c1c)"
        }
      />
      <Stat
        label="Total latency"
        value={`${(run.totalLatencyMs / 1000).toFixed(1)}s`}
      />
      {run.totalCostUsd != null && (
        <Stat label="Cost" value={`$${run.totalCostUsd.toFixed(4)}`} />
      )}
      {Object.entries(run.metrics).slice(0, 1).map(([k, v]) => (
        <Stat
          key={k}
          label={k}
          value={typeof v === "number" ? v.toFixed(2) : String(v)}
        />
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div>
      <div
        className="text-[10px] uppercase tracking-wider"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {label}
      </div>
      <div
        className="mt-0.5 text-[14px] font-semibold tabular-nums"
        style={{ color: color ?? "var(--color-text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}

function CaseList({
  cases,
  onlyFailing,
}: {
  cases: CaseRow[];
  onlyFailing: boolean;
}) {
  if (cases.length === 0) {
    return (
      <div
        className="p-4 text-[12px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        {onlyFailing
          ? "No failing or errored cases — every case in this run passed."
          : "No per-case detail recorded for this run (legacy run pre-eval-case-runs)."}
      </div>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: "var(--color-border-default)" }}>
      {cases.map((c) => (
        <li key={c.id} className="px-4 py-3">
          <div className="flex items-start gap-3">
            <CaseStatusIcon passed={c.passed} errored={c.errored} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-[12px] font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {c.caseId}
                </span>
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] tabular-nums"
                  style={{
                    background: "var(--color-bg-hover)",
                    color: "var(--color-text-tertiary)",
                  }}
                >
                  {c.latencyMs}ms
                </span>
              </div>
              {c.errorMessage && (
                <p
                  className="mt-1 rounded p-2 text-[11px]"
                  style={{
                    background: "rgba(220,38,38,0.06)",
                    color: "var(--color-error, #b91c1c)",
                    border: "1px solid rgba(220,38,38,0.20)",
                  }}
                >
                  <span className="font-semibold">Error : </span>
                  {c.errorMessage}
                </p>
              )}
              {c.outputSnippet && (
                <pre
                  className="mt-1 overflow-x-auto whitespace-pre-wrap rounded p-2 text-[11px]"
                  style={{
                    background: "var(--color-bg-page)",
                    color: "var(--color-text-secondary)",
                    border: "1px solid var(--color-border-default)",
                    maxHeight: 220,
                    overflowY: "auto",
                  }}
                >
                  {c.outputSnippet}
                </pre>
              )}
              {!c.errorMessage && !c.outputSnippet && (
                <p
                  className="mt-1 text-[11px] italic"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  (no output snippet recorded)
                </p>
              )}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function CaseStatusIcon({
  passed,
  errored,
}: {
  passed: boolean;
  errored: boolean;
}) {
  if (errored) {
    return (
      <AlertTriangle
        size={14}
        className="mt-0.5 shrink-0"
        style={{ color: "var(--color-warning, #d97706)" }}
        aria-label="Errored"
      />
    );
  }
  if (passed) {
    return (
      <CheckCircle2
        size={14}
        className="mt-0.5 shrink-0"
        style={{ color: "var(--color-success, #059669)" }}
        aria-label="Passed"
      />
    );
  }
  return (
    <XCircle
      size={14}
      className="mt-0.5 shrink-0"
      style={{ color: "var(--color-error, #b91c1c)" }}
      aria-label="Failed"
    />
  );
}
