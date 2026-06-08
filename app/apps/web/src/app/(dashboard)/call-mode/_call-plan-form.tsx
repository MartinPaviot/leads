"use client";

/**
 * Shared call-plan controls — the single source of truth for the goal +
 * cadence form used both at first-visit onboarding (CallModeOnboarding) and
 * when editing an existing campaign later (EditCampaignModal). Keeping the
 * fields here means the create and edit surfaces never drift apart.
 */

import { useState } from "react";

export type GoalType = "calls" | "connects" | "meetings";
export type GoalWindow = "day" | "week" | "month";

export interface PlanValue {
  type: GoalType;
  target: number;
  window: GoalWindow;
  /** Days the rep actually calls (0=Sun..6=Sat). */
  workingDays: number[];
  listFrequency: "daily" | "weekly";
  maxAttempts: number;
  windowDays: number;
}

export const DEFAULT_PLAN: PlanValue = {
  type: "calls",
  target: 1000,
  window: "week",
  workingDays: [1, 2, 3, 4, 5],
  listFrequency: "daily",
  maxAttempts: 8,
  windowDays: 15,
};

// Mirror of lib/voice/campaign.dailyCallsForGoal for instant client preview.
export function dailyCalls(type: GoalType, target: number, window: GoalWindow, daysPerWeek: number): number {
  const t = Math.max(0, Math.floor(target));
  if (!t) return 0;
  const calls = type === "calls" ? t : type === "connects" ? Math.ceil(t / 0.25) : Math.ceil(t / 0.05);
  const days = window === "day" ? 1 : window === "week" ? Math.min(7, daysPerWeek || 5) : (daysPerWeek ? Math.round(daysPerWeek * 4.3) : 22);
  return Math.max(1, Math.ceil(calls / days));
}

const TYPES: { key: GoalType; label: string }[] = [
  { key: "calls", label: "Calls" },
  { key: "connects", label: "Connects" },
  { key: "meetings", label: "Meetings" },
];
const WINDOWS: { key: GoalWindow; label: string }[] = [
  { key: "day", label: "per day" },
  { key: "week", label: "this week" },
  { key: "month", label: "this month" },
];
const DAYS: { i: number; l: string }[] = [
  { i: 1, l: "Mo" }, { i: 2, l: "Tu" }, { i: 3, l: "We" }, { i: 4, l: "Th" },
  { i: 5, l: "Fr" }, { i: 6, l: "Sa" }, { i: 0, l: "Su" },
];

export function segBtn(active: boolean): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
    background: active ? "var(--color-accent-soft)" : "transparent",
    color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
    transition: "all .12s",
  };
}

const labelCls = "text-[11px] font-medium uppercase tracking-wide";
const labelStyle = { color: "var(--color-text-tertiary)" } as React.CSSProperties;

/** Controlled state + derived numbers + the API payload, shared by both surfaces. */
export function useCallPlan(initial?: Partial<PlanValue> | null) {
  const [value, setValue] = useState<PlanValue>({ ...DEFAULT_PLAN, ...(initial ?? {}) });
  const set = (patch: Partial<PlanValue>) => setValue((v) => ({ ...v, ...patch }));
  const daysPerWeek = Math.max(1, value.workingDays.length);
  const perDay = dailyCalls(value.type, value.target, value.window, daysPerWeek);
  const payload = {
    goal: { type: value.type, target: value.target, window: value.window, daysPerWeek },
    maxAttempts: value.maxAttempts,
    windowDays: value.windowDays,
    listFrequency: value.listFrequency,
    workingDays: value.workingDays,
  };
  return { value, set, daysPerWeek, perDay, payload };
}

/** Objective + how many + working days. */
export function GoalSection({ value, set }: { value: PlanValue; set: (p: Partial<PlanValue>) => void }) {
  return (
    <>
      <div>
        <label className={labelCls} style={labelStyle}>Objective</label>
        <div className="mt-1.5 flex gap-1.5">
          {TYPES.map((tt) => (
            <button key={tt.key} type="button" style={segBtn(value.type === tt.key)} onClick={() => set({ type: tt.key })}>
              {tt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-end gap-3">
        <div className="flex-1">
          <label className={labelCls} style={labelStyle}>How many</label>
          <input
            type="number"
            min={1}
            value={value.target}
            onChange={(e) => set({ target: Math.max(0, parseInt(e.target.value || "0", 10)) })}
            className="mt-1.5 w-full rounded-lg px-3 py-2 text-[14px]"
            style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
          />
        </div>
        <div className="flex gap-1.5 pb-0.5">
          {WINDOWS.map((w) => (
            <button key={w.key} type="button" style={segBtn(value.window === w.key)} onClick={() => set({ window: w.key })}>
              {w.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label className={labelCls} style={labelStyle}>Working days</label>
        <div className="mt-1.5 flex gap-1">
          {DAYS.map((d) => {
            const on = value.workingDays.includes(d.i);
            return (
              <button
                key={d.i}
                type="button"
                onClick={() => set({ workingDays: on ? value.workingDays.filter((x) => x !== d.i) : [...value.workingDays, d.i] })}
                style={{ ...segBtn(on), padding: "6px 0", width: 40, textAlign: "center" }}
              >
                {d.l}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Fresh-list frequency + follow-up cadence. */
export function CadenceSection({ value, set }: { value: PlanValue; set: (p: Partial<PlanValue>) => void }) {
  return (
    <>
      <div>
        <label className={labelCls} style={labelStyle}>Fresh list</label>
        <div className="mt-1.5 flex gap-1.5">
          <button type="button" style={segBtn(value.listFrequency === "daily")} onClick={() => set({ listFrequency: "daily" })}>Every working day</button>
          <button type="button" style={segBtn(value.listFrequency === "weekly")} onClick={() => set({ listFrequency: "weekly" })}>Weekly</button>
        </div>
      </div>

      <div className="mt-4">
        <label className={labelCls} style={labelStyle}>Follow-up cadence</label>
        <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--color-text-secondary)" }}>
          up to
          <input type="number" min={1} max={20} value={value.maxAttempts}
            onChange={(e) => set({ maxAttempts: Math.min(20, Math.max(1, parseInt(e.target.value || "8", 10))) })}
            className="w-12 rounded-md px-2 py-1.5 text-center text-[13px]" style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }} />
          &times;, over
          <input type="number" min={1} max={60} value={value.windowDays}
            onChange={(e) => set({ windowDays: Math.min(60, Math.max(1, parseInt(e.target.value || "15", 10))) })}
            className="w-12 rounded-md px-2 py-1.5 text-center text-[13px]" style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }} />
          days
        </div>
      </div>
    </>
  );
}

/** Live plan summary derived entirely from the user's choices. */
export function PlanPreview({ value, perDay, daysPerWeek }: { value: PlanValue; perDay: number; daysPerWeek: number }) {
  return (
    <div className="rounded-lg px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}>
      Plan: <strong style={{ color: "var(--color-text-primary)" }}>{perDay} calls / day</strong> across <strong style={{ color: "var(--color-text-primary)" }}>{daysPerWeek} day{daysPerWeek === 1 ? "" : "s"}/week</strong> · fresh list <strong style={{ color: "var(--color-text-primary)" }}>{value.listFrequency === "weekly" ? "weekly" : "every working day"}</strong> · retry up to <strong style={{ color: "var(--color-text-primary)" }}>{value.maxAttempts}&times;</strong> over <strong style={{ color: "var(--color-text-primary)" }}>{value.windowDays} days</strong>.
    </div>
  );
}
