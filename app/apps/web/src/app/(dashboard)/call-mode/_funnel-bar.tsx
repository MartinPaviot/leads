"use client";

/**
 * Campaign funnel bar — makes the autopilot legible at a glance on Call Mode:
 * goal progress (today vs quota, week vs target), cadence state (due / in
 * cadence / reached / exhausted), and enrichment coverage (callable pool).
 * Reads /api/calls/campaign/stats. Renders nothing when there's no campaign.
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

function Bar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div className="mt-1 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--color-bg-emphasis, var(--color-border-default))" }}>
      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--color-accent)" }} />
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

  const cell = "px-4 py-2.5";
  const labelCls = "text-[10px] font-medium uppercase tracking-wide";
  const labelStyle = { color: "var(--color-text-tertiary)" } as React.CSSProperties;
  const valueCls = "text-[13px] font-semibold";
  const valueStyle = { color: "var(--color-text-primary)" } as React.CSSProperties;
  const divider = { borderLeft: "1px solid var(--color-border-default)" } as React.CSSProperties;

  return (
    // Flush full-width strip (matches the app's FilterBar / BulkActionsBar
    // convention) so the cockpit is framed edge-to-edge instead of floating an
    // inset card above full-bleed columns.
    <div
      className="flex w-full flex-wrap items-stretch"
      style={{ background: "var(--color-bg-card)", borderBottom: "1px solid var(--color-border-default)" }}
    >
      {/* Me / Team scope — per-user Call Mode, shareable team totals */}
      <div className={cell} style={{ display: "flex", alignItems: "center" }}>
        <div className="flex gap-0.5 rounded-md p-0.5" style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)" }}>
          {(["me", "team"] as const).map((k) => {
            const active = scope === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => setScope(k)}
                className="rounded px-2.5 py-1 text-[11px] font-medium transition-colors"
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

      {/* Today vs daily quota */}
      <div className={cell} style={{ minWidth: 150, flex: "1 1 150px" }}>
        <div className={labelCls} style={labelStyle}>Today</div>
        <div className={valueCls} style={valueStyle}>
          {s.progress.callsToday}<span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}> / {s.progress.dailyQuota} calls</span>
        </div>
        <Bar done={s.progress.callsToday} total={s.progress.dailyQuota} />
      </div>

      {/* This week vs goal */}
      <div className={cell} style={{ ...divider, minWidth: 160, flex: "1 1 160px" }}>
        <div className={labelCls} style={labelStyle}>This week</div>
        <div className={valueCls} style={valueStyle}>
          {s.goalDone}<span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}> / {s.goal?.target ?? s.campaign.weeklyTarget} {noun}</span>
        </div>
        <Bar done={s.goalDone} total={s.goal?.target ?? s.campaign.weeklyTarget} />
      </div>

      {/* Meetings booked */}
      <div className={cell} style={{ ...divider, minWidth: 110 }}>
        <div className={labelCls} style={labelStyle}>Meetings</div>
        <div className={valueCls} style={valueStyle}>{s.progress.meetingsWeek}<span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}> this week</span></div>
      </div>

      {/* Cadence state */}
      <div className={cell} style={{ ...divider, minWidth: 220, flex: "1 1 220px" }}>
        <div className={labelCls} style={labelStyle}>Cadence</div>
        <div className="text-[12.5px]" style={{ color: "var(--color-text-secondary)" }}>
          <strong style={valueStyle}>{s.cadence.dueToday}</strong> due · {s.cadence.queued} in cadence · {reached} reached · {s.cadence.exhausted} exhausted
        </div>
      </div>

      {/* Coverage */}
      {cov > 0 && (
        <div className={cell} style={{ ...divider, minWidth: 130 }}>
          <div className={labelCls} style={labelStyle}>Callable</div>
          <div className={valueCls} style={valueStyle}>
            {s.coverage.withPhone}<span style={{ color: "var(--color-text-tertiary)", fontWeight: 400 }}> / {cov} have a phone</span>
          </div>
        </div>
      )}
    </div>
  );
}
