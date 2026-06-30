"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Calendar, AlertTriangle, ShieldCheck } from "lucide-react";
import {
  ConfidenceState,
  type ConfidenceLevel,
} from "@/components/ai-ui";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * MONACO-PARITY-CS — daily priority queue page.
 *
 * Sprint-2 audit follow-up. The Founding CS view : 5-20 accounts a
 * day worth touching, ordered by risk × ARR × stale-velocity. Each
 * card shows the composite health score, the weakest axis driving
 * the call-to-action, and the AI-suggested next-action with its
 * underlying citation chips when available.
 *
 * Empty state is informative — if the cron hasn't run yet, the
 * founder sees the explicit "no snapshots today" message rather than
 * a silent blank page.
 */
interface HealthItem {
  snapshotId: string;
  accountId: string;
  accountName: string;
  accountDomain: string | null;
  accountScore: number | null;
  healthScore: number;
  components: { usage: number; sentiment: number; engagement: number; velocity: number; support: number };
  riskLevel: "high" | "medium" | "low" | "thriving" | string;
  suggestedAction: string | null;
  suggestedActionReason: string | null;
  arrExposureUsd: number | null;
  computedAt: string;
}

const RISK_LABEL: Record<string, { label: string; level: ConfidenceLevel }> = {
  high: { label: "High risk", level: "unverified" },
  medium: { label: "Medium risk", level: "likely" },
  low: { label: "Low risk", level: "verified" },
  thriving: { label: "Thriving", level: "verified" },
};

function relativeDate(iso: string): string {
  const dt = new Date(iso).getTime();
  if (!Number.isFinite(dt)) return "";
  const diffH = (Date.now() - dt) / (1000 * 60 * 60);
  if (diffH < 1) return "just now";
  if (diffH < 24) return `${Math.floor(diffH)}h ago`;
  return `${Math.floor(diffH / 24)}d ago`;
}

export default function CsTodayPage() {
  const [items, setItems] = useState<HealthItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/cs/today?limit=20");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { items: HealthItem[] };
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
            Today
          </h1>
          <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            Accounts ranked by risk × ARR. The daily queue a Founding CS would look at first.
          </p>
        </div>
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
          <Calendar size={11} />
          Refresh
        </button>
      </header>

      {loading && (
        <ul className="space-y-2" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <CsTodayCardSkeleton key={i} index={i} />
          ))}
        </ul>
      )}

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

      {!loading && !error && items && items.length === 0 && (
        <div
          className="rounded-xl p-6 text-center"
          style={{
            background: "var(--color-bg-card)",
            border: "1px dashed var(--color-border-default)",
          }}
        >
          <ShieldCheck size={20} className="mx-auto" style={{ color: "var(--color-text-tertiary)" }} />
          <p className="mt-2 text-[13px] font-medium" style={{ color: "var(--color-text-primary)" }}>
            No health snapshots yet.
          </p>
          <p className="mt-1 text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
            The CS health cron runs daily at 04:00 UTC. After it executes, accounts that need attention will appear here, ranked.
          </p>
        </div>
      )}

      {!loading && items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <CsTodayCard key={it.snapshotId} item={it} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Loading footprint — mirrors the loaded {@link CsTodayCard} box
 * ('rounded-xl p-4' with the 3px left rail) so the queue's vertical
 * space is reserved on first load and on refresh, with no reflow when
 * the real cards swap in. Avatar circle + title line + 5 component
 * chips, matching the loaded card's anatomy.
 */
function CsTodayCardSkeleton({ index = 0 }: { index?: number }) {
  const chipWidths = [54, 70, 78, 60, 58];
  return (
    <li>
      <div
        className="skeleton-row flex items-start gap-3 rounded-xl p-4"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
          borderLeft: "3px solid var(--color-border-default)",
        }}
      >
        {/* Avatar */}
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />

        <div className="min-w-0 flex-1 space-y-2">
          {/* Title line */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-3.5 rounded" style={{ width: `${44 + ((index * 17) % 30)}%` }} />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>

          {/* Component chip row */}
          <div className="flex flex-wrap items-center gap-1.5">
            {chipWidths.map((w, i) => (
              <Skeleton key={i} className="h-4 rounded-full" style={{ width: w }} />
            ))}
          </div>
        </div>

        {/* Right-side tail */}
        <Skeleton className="h-3 w-10 shrink-0 rounded" />
      </div>
    </li>
  );
}

function CsTodayCard({ item }: { item: HealthItem }) {
  const riskMeta = RISK_LABEL[item.riskLevel] ?? RISK_LABEL.medium;
  const isUrgent = item.riskLevel === "high";
  const initials = (item.accountName || item.accountDomain || "?").slice(0, 2).toUpperCase();
  const arr = item.arrExposureUsd
    ? `$${Math.round(item.arrExposureUsd).toLocaleString()}`
    : null;

  return (
    <li>
      <Link
        href={`/accounts/${item.accountId}`}
        className="flex items-start gap-3 rounded-xl p-4 transition-colors"
        style={{
          background: "var(--color-bg-card)",
          border: `1px solid ${isUrgent ? "rgba(220,38,38,0.30)" : "var(--color-border-default)"}`,
          borderLeft: `3px solid ${
            isUrgent
              ? "var(--color-error, #dc2626)"
              : item.riskLevel === "medium"
                ? "var(--color-warning, #d97706)"
                : "var(--color-success, #059669)"
          }`,
        }}
      >
        {/* Avatar */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[12px] font-bold uppercase"
          style={{
            background: isUrgent
              ? "rgba(220,38,38,0.10)"
              : "var(--color-bg-hover)",
            color: isUrgent
              ? "var(--color-error, #dc2626)"
              : "var(--color-text-secondary)",
          }}
          aria-hidden
        >
          {initials}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>
              {item.accountName || item.accountDomain || "Unknown account"}
            </span>
            <ConfidenceState
              level={riskMeta.level}
              label={riskMeta.label}
              reason={`Health ${item.healthScore}/100`}
            />
            {arr && (
              <span
                className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: "var(--color-bg-hover)",
                  color: "var(--color-text-secondary)",
                }}
              >
                {arr}
              </span>
            )}
          </div>

          {/* Component breakdown chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]" style={{ color: "var(--color-text-tertiary)" }}>
            {(["usage", "sentiment", "engagement", "velocity", "support"] as const).map((k) => (
              <span
                key={k}
                title={`${k}: ${item.components[k]}/100`}
                className="rounded-full px-1.5 py-0.5"
                style={{
                  background: "var(--color-bg-hover)",
                  color: item.components[k] < 40 ? "var(--color-error, #dc2626)" : item.components[k] < 60 ? "var(--color-warning, #d97706)" : "var(--color-text-tertiary)",
                }}
              >
                {k} {item.components[k]}
              </span>
            ))}
          </div>

          {/* Suggested next action */}
          {item.suggestedAction && (
            <div className="mt-2 flex items-start gap-1.5">
              <AlertTriangle
                size={11}
                className="mt-0.5 shrink-0"
                style={{ color: "var(--color-warning, #d97706)" }}
                aria-hidden
              />
              <div>
                <p className="text-[12px]" style={{ color: "var(--color-text-primary)" }}>
                  {item.suggestedAction}
                </p>
                {item.suggestedActionReason && (
                  <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {item.suggestedActionReason}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right-side tail */}
        <div
          className="flex shrink-0 flex-col items-end gap-1 text-[11px]"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          <span>{relativeDate(item.computedAt)}</span>
          <ArrowUpRight size={11} />
        </div>
      </Link>
    </li>
  );
}
