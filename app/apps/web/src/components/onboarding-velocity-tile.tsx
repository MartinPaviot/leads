"use client";

/**
 * OnboardingVelocityTile — admin dashboard tile (P0-3 follow-up).
 *
 * Renders :
 *  - Top row : completion rate, p50/p75/p95 TTC in hours.
 *  - Per-phase histogram showing reached / finalised + dropoff
 *    percentage. Phases with > 30% drop-off get a red highlight.
 *
 * Fetches `/api/admin/onboarding-velocity?scope=all` for cross-
 * tenant stats. Hidden when the API returns 403 (caller isn't
 * admin) or when there are zero started rows.
 */

import { useEffect, useState } from "react";
import { Activity, AlertTriangle } from "lucide-react";

interface VelocityStats {
  totalStarted: number;
  totalCompleted: number;
  ttcHoursP50: number | null;
  ttcHoursP75: number | null;
  ttcHoursP95: number | null;
  completionRate: number;
  reachedByPhase: Record<string, number>;
  finalisedByPhase: Record<string, number>;
}

interface VelocityResponse {
  scope: "all" | "tenant";
  asOf: string;
  stats: VelocityStats;
  dropoff: Record<string, number>;
}

const PHASE_LABELS: Record<number, string> = {
  1: "Diagnostic",
  2: "ICP & TAM",
  3: "Email & Cal",
  4: "Signals",
  5: "Voice & Seq",
  6: "Pipeline",
  7: "Coaching",
};

function formatHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function formatPercent(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

export function OnboardingVelocityTile() {
  const [data, setData] = useState<VelocityResponse | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          "/api/admin/onboarding-velocity?scope=all",
        );
        if (res.status === 403 || res.status === 401) {
          if (!cancelled) setHidden(true);
          return;
        }
        if (!res.ok) {
          if (!cancelled) setHidden(true);
          return;
        }
        const payload = (await res.json()) as VelocityResponse;
        if (!cancelled) setData(payload);
      } catch {
        if (!cancelled) setHidden(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (hidden) return null;
  if (!data) return null;
  if (data.stats.totalStarted === 0) return null;

  const { stats, dropoff } = data;
  const phases = [1, 2, 3, 4, 5, 6, 7];
  const maxReached = Math.max(
    ...phases.map((p) => stats.reachedByPhase[String(p)] ?? 0),
    1, // avoid div-by-zero
  );

  return (
    <section
      className="rounded-xl"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <header className="flex items-center justify-between p-4">
        <div>
          <h2
            className="text-[14px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Onboarding velocity
          </h2>
          <p
            className="mt-0.5 text-[11px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            Cross-tenant TTC distribution + per-phase drop-off ·{" "}
            {stats.totalStarted} started, {stats.totalCompleted} finalised.
          </p>
        </div>
        <Activity
          size={14}
          style={{ color: "var(--color-text-tertiary)" }}
          aria-hidden
        />
      </header>

      <div
        className="grid grid-cols-4 gap-3 border-t p-4"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <Stat
          label="Completion"
          value={formatPercent(stats.completionRate)}
          color={
            stats.completionRate >= 0.7
              ? "var(--color-success, #059669)"
              : stats.completionRate >= 0.4
                ? "var(--color-warning, #d97706)"
                : "var(--color-error, #b91c1c)"
          }
        />
        <Stat label="p50 TTC" value={formatHours(stats.ttcHoursP50)} />
        <Stat label="p75 TTC" value={formatHours(stats.ttcHoursP75)} />
        <Stat label="p95 TTC" value={formatHours(stats.ttcHoursP95)} />
      </div>

      <div
        className="border-t p-4"
        style={{ borderColor: "var(--color-border-default)" }}
      >
        <p
          className="mb-3 text-[10px] uppercase tracking-wider"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Per-phase reach + drop-off
        </p>
        <ul className="space-y-2">
          {phases.map((p) => {
            const reached = stats.reachedByPhase[String(p)] ?? 0;
            const finalised = stats.finalisedByPhase[String(p)] ?? 0;
            const drop = dropoff[String(p)] ?? 0;
            const widthPct = Math.max(2, (reached / maxReached) * 100);
            const heavyDropoff = drop > 0.3;
            return (
              <li
                key={p}
                className="grid grid-cols-[100px_1fr_60px_60px] items-center gap-3 text-[11px]"
              >
                <span
                  className="truncate font-medium"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  {p}. {PHASE_LABELS[p]}
                </span>
                <div
                  className="h-2 rounded-full overflow-hidden"
                  style={{ background: "var(--color-bg-page)" }}
                >
                  <div
                    className="h-full"
                    style={{
                      width: `${widthPct}%`,
                      background: heavyDropoff
                        ? "var(--color-error, #b91c1c)"
                        : "var(--color-accent, #6366f1)",
                    }}
                    aria-hidden
                  />
                </div>
                <span
                  className="tabular-nums text-right"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  {reached} / {finalised}
                </span>
                <span
                  className="tabular-nums text-right inline-flex items-center justify-end gap-1"
                  style={{
                    color: heavyDropoff
                      ? "var(--color-error, #b91c1c)"
                      : "var(--color-text-tertiary)",
                  }}
                >
                  {heavyDropoff && <AlertTriangle size={10} aria-hidden />}
                  −{formatPercent(drop)}
                </span>
              </li>
            );
          })}
        </ul>
        <p
          className="mt-3 text-[10px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Reached / finalised counts ; drop-off marks phases where
          &gt; 30% leave before reaching the next phase.
        </p>
      </div>
    </section>
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
        className="mt-0.5 text-[16px] font-semibold tabular-nums"
        style={{ color: color ?? "var(--color-text-primary)" }}
      >
        {value}
      </div>
    </div>
  );
}
