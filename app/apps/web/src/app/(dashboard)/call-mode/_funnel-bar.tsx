"use client";

/**
 * Campaign funnel bar — makes the autopilot legible at a glance on Call Mode:
 * goal progress (today vs quota, week vs target), cadence state (due / in
 * cadence / reached / exhausted), and enrichment coverage (callable pool).
 * Reads /api/calls/campaign/stats. Renders nothing when there's no campaign.
 *
 * Kept to a single low-height strip — label and value sit on one line so the
 * KPIs don't steal vertical space from the cockpit content.
 */

import { useEffect, useState } from "react";

interface Stats {
  campaign: { id: string; name: string; dailyQuota: number; weeklyTarget: number } | null;
  goal: { type: "calls" | "connects" | "meetings"; target: number; window: string } | null;
  goalDone: number;
  progress: { callsToday: number; callsWeek: number; connectsWeek: number; meetingsWeek: number; dailyQuota: number };
  cadence: { queued: number; in_progress: number; connected: number; converted: number; exhausted: number; dnc: number; dueToday: number; total: number };
  coverage: { targets: number; withPhone: number };
}

const GOAL_NOUN: Record<string, string> = { calls: "calls", connects: "connects", meetings: "meetings" };

const muted = { color: "var(--color-text-tertiary)", fontWeight: 400 } as React.CSSProperties;

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="mt-0.5 h-0.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-border-default)" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--color-accent)" }} />
    </div>
  );
}

/** One compact KPI cell: label and value on a single baseline-aligned line,
 * with an optional thin progress bar underneath. */
function Cell({
  label,
  children,
  bar,
  style,
}: {
  label: string;
  children: React.ReactNode;
  bar?: { done: number; total: number };
  style?: React.CSSProperties;
}) {
  return (
    <div className="px-3.5 py-1.5" style={style}>
      <div className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className="text-[10px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
          {label}
        </span>
        <span className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {children}
        </span>
      </div>
      {bar && <Bar done={bar.done} total={bar.total} />}
    </div>
  );
}

export function CampaignFunnelBar() {
  const [s, setS] = useState<Stats | null>(null);
  // Call Mode is per-user, but the numbers can be shared at the team level.
  const [scope, setScope] = useState<"me" | "team">("me");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/calls/campaign/stats?scope=${scope}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.campaign) setS(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [scope]);

  if (!s || !s.campaign) return null;

  const noun = s.goal ? GOAL_NOUN[s.goal.type] : "calls";
  const reached = s.cadence.connected + s.cadence.converted;
  const cov = s.coverage.targets;
  const divider = { borderLeft: "1px solid var(--color-border-default)" } as React.CSSProperties;
  const weekTarget = s.goal?.target ?? s.campaign.weeklyTarget;

  return (
    // Flush full-width strip (matches the app's FilterBar / BulkActionsBar
    // convention) so the cockpit is framed edge-to-edge instead of floating an
    // inset card above full-bleed columns.
    <div
      className="flex w-full flex-wrap items-center"
      style={{ background: "var(--color-bg-card)", borderBottom: "1px solid var(--color-border-default)" }}
    >
      {/* Me / Team scope — per-user Call Mode, shareable team totals */}
      <div className="px-3.5 py-1.5" style={{ display: "flex", alignItems: "center" }}>
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)" }}>
          {(["me", "team"] as const).map((k) => {
            const active = scope === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setScope(k)}
                className="rounded px-2 py-0.5 text-[11px] font-medium transition-colors"
                style={{
                  background: active ? "var(--color-accent-soft)" : "transparent",
                  color: active ? "var(--color-accent)" : "var(--color-text-tertiary)",
                  cursor: "pointer",
                }}
              >
                {k === "me" ? "Me" : "Team"}
              </button>
            );
          })}
        </div>
      </div>

      <Cell label="Today" bar={{ done: s.progress.callsToday, total: s.progress.dailyQuota }} style={{ minWidth: 140, flex: "1 1 140px" }}>
        {s.progress.callsToday}<span style={muted}> / {s.progress.dailyQuota} calls</span>
      </Cell>

      <Cell label="Week" bar={{ done: s.goalDone, total: weekTarget }} style={{ ...divider, minWidth: 150, flex: "1 1 150px" }}>
        {s.goalDone}<span style={muted}> / {weekTarget} {noun}</span>
      </Cell>

      <Cell label="Meetings" style={{ ...divider, minWidth: 100 }}>
        {s.progress.meetingsWeek}<span style={muted}> this week</span>
      </Cell>

      <Cell label="Cadence" style={{ ...divider, minWidth: 200, flex: "1 1 200px" }}>
        <span style={{ fontWeight: 400, fontSize: "12px", color: "var(--color-text-secondary)" }}>
          {s.cadence.dueToday} due · {s.cadence.queued} in cadence · {reached} reached · {s.cadence.exhausted} exhausted
        </span>
      </Cell>

      {cov > 0 && (
        <Cell label="Callable" style={{ ...divider, minWidth: 120 }}>
          {s.coverage.withPhone}<span style={muted}> / {cov} have a phone</span>
        </Cell>
      )}
    </div>
  );
}
