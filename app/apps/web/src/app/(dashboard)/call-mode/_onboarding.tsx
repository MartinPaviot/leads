"use client";

/**
 * First-visit Call Mode onboarding — captures the rep's objective (any goal)
 * and spins up a goal-driven campaign. Shown when the tenant has no active
 * call campaign yet. Structured controls are the reliable path; the
 * "describe it" box is the chat-first shortcut (LLM-parsed server-side).
 */

import { useState } from "react";
import { Target, Loader2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

type GoalType = "calls" | "connects" | "meetings";
type GoalWindow = "day" | "week" | "month";

interface Campaign {
  id: string;
  name: string;
  dailyQuota: number;
  maxAttempts: number;
  windowDays: number;
}
interface QueueItem {
  contactId: string;
}

// Mirror of lib/voice/campaign.dailyCallsForGoal for instant client preview.
function dailyCalls(type: GoalType, target: number, window: GoalWindow, daysPerWeek: number): number {
  const t = Math.max(0, Math.floor(target));
  if (!t) return 0;
  const calls = type === "calls" ? t : type === "connects" ? Math.ceil(t / 0.25) : Math.ceil(t / 0.05);
  const days = window === "day" ? 1 : window === "week" ? Math.min(7, daysPerWeek || 5) : (daysPerWeek ? Math.round(daysPerWeek * 4.3) : 22);
  return Math.max(1, Math.ceil(calls / days));
}

const TYPES: { key: GoalType; label: string; hint: string }[] = [
  { key: "calls", label: "Calls", hint: "dials to make" },
  { key: "connects", label: "Connects", hint: "live conversations" },
  { key: "meetings", label: "Meetings", hint: "demos booked" },
];
const WINDOWS: { key: GoalWindow; label: string }[] = [
  { key: "day", label: "per day" },
  { key: "week", label: "this week" },
  { key: "month", label: "this month" },
];

export function CallModeOnboarding({
  onCreated,
}: {
  onCreated: (campaign: Campaign, calls: QueueItem[]) => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<GoalType>("calls");
  const [target, setTarget] = useState<number>(1000);
  const [window, setWindow] = useState<GoalWindow>("week");
  const [daysPerWeek, setDaysPerWeek] = useState<number>(5);
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const perDay = dailyCalls(type, target, window, daysPerWeek);

  async function submit(payload: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/calls/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Couldn't set up the campaign", "error");
        return;
      }
      toast("Calling plan set — your list is ready", "success");
      onCreated(data.campaign, data.calls || []);
    } catch {
      toast("Network error — try again", "error");
    } finally {
      setSubmitting(false);
    }
  }

  const segBtn = (active: boolean): React.CSSProperties => ({
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    border: `1px solid ${active ? "var(--color-accent)" : "var(--color-border-default)"}`,
    background: active ? "var(--color-accent-soft)" : "transparent",
    color: active ? "var(--color-accent)" : "var(--color-text-secondary)",
    transition: "all .12s",
  });

  return (
    <div
      className="absolute inset-0 z-20 flex items-center justify-center p-6"
      style={{ background: "color-mix(in srgb, var(--color-bg-base) 80%, transparent)", backdropFilter: "none" }}
    >
      <div
        className="w-full max-w-lg rounded-2xl p-7"
        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-lg, 0 12px 40px rgba(0,0,0,0.18))" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
            <Target size={18} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
              Set your calling goal
            </h2>
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Elevay builds a fresh, enriched call list every morning and keeps dialing on a cadence so no lead slips through.
            </p>
          </div>
        </div>

        {/* Goal type */}
        <div className="mt-5">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Objective</label>
          <div className="mt-1.5 flex gap-1.5">
            {TYPES.map((tt) => (
              <button key={tt.key} type="button" style={segBtn(type === tt.key)} onClick={() => setType(tt.key)}>
                {tt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Target + window */}
        <div className="mt-4 flex items-end gap-3">
          <div className="flex-1">
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>How many</label>
            <input
              type="number"
              min={1}
              value={target}
              onChange={(e) => setTarget(Math.max(0, parseInt(e.target.value || "0", 10)))}
              className="mt-1.5 w-full rounded-lg px-3 py-2 text-[14px]"
              style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
            />
          </div>
          <div className="flex gap-1.5 pb-0.5">
            {WINDOWS.map((w) => (
              <button key={w.key} type="button" style={segBtn(window === w.key)} onClick={() => setWindow(w.key)}>
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Days per week (week/month only) */}
        {window !== "day" && (
          <div className="mt-4">
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Working days / week</label>
            <input
              type="number"
              min={1}
              max={7}
              value={daysPerWeek}
              onChange={(e) => setDaysPerWeek(Math.min(7, Math.max(1, parseInt(e.target.value || "5", 10))))}
              className="mt-1.5 w-24 rounded-lg px-3 py-2 text-[14px]"
              style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
            />
          </div>
        )}

        {/* Live plan preview */}
        <div className="mt-5 rounded-lg px-3.5 py-3 text-[13px]" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}>
          Plan: <strong style={{ color: "var(--color-text-primary)" }}>{perDay} calls / day</strong>, each prospect retried up to <strong style={{ color: "var(--color-text-primary)" }}>8&times;</strong> over <strong style={{ color: "var(--color-text-primary)" }}>15 days</strong> until reached.
        </div>

        <Button
          variant="gradient"
          className="mt-5 w-full"
          disabled={submitting || target <= 0}
          onClick={() => submit({ goal: { type, target, window, daysPerWeek: window === "day" ? undefined : daysPerWeek } })}
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} />}
          Start calling
        </Button>

        {/* Free-text shortcut */}
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-border-subtle, var(--color-border-default))" }}>
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Or describe it</label>
          <div className="mt-1.5 flex gap-2">
            <input
              type="text"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && phrase.trim()) submit({ phrase: phrase.trim() }); }}
              placeholder='e.g. "book 10 demos this month" or "200 dials a day"'
              className="flex-1 rounded-lg px-3 py-2 text-[13px]"
              style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
            />
            <Button variant="outline" disabled={submitting || !phrase.trim()} onClick={() => submit({ phrase: phrase.trim() })}>
              Set
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
