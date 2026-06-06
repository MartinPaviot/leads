"use client";

/**
 * First-visit Call Mode onboarding — captures the rep's objective (any goal)
 * and spins up a goal-driven campaign. Shown when the tenant has no active
 * call campaign yet. Structured controls are the reliable path; the
 * "describe it" box is the chat-first shortcut (LLM-parsed server-side).
 */

import { useState } from "react";
import { Target, Loader2, Phone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GrowTextarea } from "@/components/ui/grow-textarea";
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
const DAYS: { i: number; l: string }[] = [
  { i: 1, l: "Mo" }, { i: 2, l: "Tu" }, { i: 3, l: "We" }, { i: 4, l: "Th" },
  { i: 5, l: "Fr" }, { i: 6, l: "Sa" }, { i: 0, l: "Su" },
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
  // The user defines their own rhythm — nothing is hardcoded.
  const [workingDays, setWorkingDays] = useState<number[]>([1, 2, 3, 4, 5]); // Mon-Fri (0=Sun)
  const [listFrequency, setListFrequency] = useState<"daily" | "weekly">("daily");
  const [maxAttempts, setMaxAttempts] = useState<number>(8);
  const [windowDays, setWindowDays] = useState<number>(15);
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const daysPerWeek = Math.max(1, workingDays.length);
  // After submit: the honest result — list ready / building / needs ICP — so
  // the user never lands on an empty cockpit or a Twilio dead-end.
  const [result, setResult] = useState<
    { campaign: Campaign; calls: QueueItem[]; callableTotal: number; sourcing: boolean; hasIcp: boolean } | null
  >(null);
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null);

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
      toast("Calling plan set", "success");
      setResult({
        campaign: data.campaign,
        calls: data.calls || [],
        callableTotal: data.callableTotal ?? 0,
        sourcing: !!data.sourcing,
        hasIcp: !!data.hasIcp,
      });
      // Whether dialing can start (number connected) drives the result CTA.
      fetch("/api/calls/config")
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => setVoiceReady(c ? !!c.ready : false))
        .catch(() => setVoiceReady(false));
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
    <div className="flex h-full w-full items-center justify-center overflow-auto p-6">
      <div
        className="w-full max-w-lg rounded-2xl p-7"
        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog, 0 12px 40px rgba(0,0,0,0.18))" }}
      >
        {!result && (
        <>
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
            <Target size={18} />
          </div>
          <div>
            <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
              Set your calling goal
            </h2>
            <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              Elevay builds your enriched call list on the rhythm you set, and dials on your cadence so no lead slips through.
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

        {/* Working days — the rep picks the days they actually call. */}
        <div className="mt-4">
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Working days</label>
          <div className="mt-1.5 flex gap-1">
            {DAYS.map((d) => {
              const on = workingDays.includes(d.i);
              return (
                <button
                  key={d.i}
                  type="button"
                  onClick={() => setWorkingDays((w) => (on ? w.filter((x) => x !== d.i) : [...w, d.i]))}
                  style={{ ...segBtn(on), padding: "6px 0", width: 40, textAlign: "center" }}
                >
                  {d.l}
                </button>
              );
            })}
          </div>
        </div>

        {/* List frequency + follow-up cadence — fully user-defined. */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Fresh list</label>
            <div className="mt-1.5 flex gap-1.5">
              <button type="button" style={segBtn(listFrequency === "daily")} onClick={() => setListFrequency("daily")}>Every working day</button>
              <button type="button" style={segBtn(listFrequency === "weekly")} onClick={() => setListFrequency("weekly")}>Weekly</button>
            </div>
          </div>
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Follow-up cadence</label>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px]" style={{ color: "var(--color-text-secondary)" }}>
              up to
              <input type="number" min={1} max={20} value={maxAttempts}
                onChange={(e) => setMaxAttempts(Math.min(20, Math.max(1, parseInt(e.target.value || "8", 10))))}
                className="w-12 rounded-md px-2 py-1.5 text-center text-[13px]" style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }} />
              &times;, over
              <input type="number" min={1} max={60} value={windowDays}
                onChange={(e) => setWindowDays(Math.min(60, Math.max(1, parseInt(e.target.value || "15", 10))))}
                className="w-12 rounded-md px-2 py-1.5 text-center text-[13px]" style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }} />
              days
            </div>
          </div>
        </div>

        {/* Live plan preview — entirely from the user's choices. */}
        <div className="mt-5 rounded-lg px-3.5 py-3 text-[13px] leading-relaxed" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}>
          Plan: <strong style={{ color: "var(--color-text-primary)" }}>{perDay} calls / day</strong> across <strong style={{ color: "var(--color-text-primary)" }}>{daysPerWeek} day{daysPerWeek === 1 ? "" : "s"}/week</strong> · fresh list <strong style={{ color: "var(--color-text-primary)" }}>{listFrequency === "weekly" ? "weekly" : "every working day"}</strong> · retry up to <strong style={{ color: "var(--color-text-primary)" }}>{maxAttempts}&times;</strong> over <strong style={{ color: "var(--color-text-primary)" }}>{windowDays} days</strong>.
        </div>

        <Button
          variant="gradient"
          className="mt-5 w-full"
          disabled={submitting || target <= 0}
          onClick={() => submit({ goal: { type, target, window, daysPerWeek }, maxAttempts, windowDays, listFrequency, workingDays })}
        >
          {submitting ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} />}
          Start calling
        </Button>

        {/* Free-text shortcut */}
        <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-border-subtle, var(--color-border-default))" }}>
          <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Or describe it</label>
          <div className="mt-1.5 flex items-end gap-2">
            <GrowTextarea
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              onSubmit={() => { if (phrase.trim()) submit({ phrase: phrase.trim(), maxAttempts, windowDays, listFrequency, workingDays }); }}
              placeholder='e.g. "book 10 demos this month" or "200 dials a day"'
              className="flex-1"
              style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
            />
            <Button variant="outline" disabled={submitting || !phrase.trim()} onClick={() => submit({ phrase: phrase.trim(), maxAttempts, windowDays, listFrequency, workingDays })}>
              Set
            </Button>
          </div>
        </div>
        </>
        )}

        {result && (
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
                <Check size={18} />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>{result.campaign.name}</h2>
                <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {result.campaign.dailyQuota} calls/day · retry up to {result.campaign.maxAttempts}&times; over {result.campaign.windowDays} days
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-lg px-3.5 py-3 text-[13px]" style={{ background: "var(--color-bg-hover)", color: "var(--color-text-secondary)" }}>
              {result.calls.length > 0 ? (
                <span><strong style={{ color: "var(--color-text-primary)" }}>{result.calls.length} prospect{result.calls.length === 1 ? "" : "s"}</strong> ready to call today.</span>
              ) : result.sourcing ? (
                <span className="inline-flex items-start gap-1.5"><Loader2 size={13} className="mt-0.5 shrink-0 animate-spin" /> Building your list — finding prospects that match your ICP and resolving their numbers. New prospects appear here through the day.</span>
              ) : !result.hasIcp ? (
                <span>Tell Elevay who to call: set your ideal customer on the Accounts page (&ldquo;Describe ICP&rdquo;), and your list builds automatically on the schedule you set.</span>
              ) : (
                <span>No reachable prospects yet — import contacts or refine your ICP, then your list fills in.</span>
              )}
            </div>

            {voiceReady === false && (
              <div className="mt-3 rounded-lg px-3.5 py-2.5 text-[12.5px]" style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}>
                Connect a phone number to start dialing — <a href="/settings/sending-infrastructure" className="font-medium underline">Settings → Voice</a>.
              </div>
            )}

            <Button variant="gradient" className="mt-5 w-full" onClick={() => onCreated(result.campaign, result.calls)}>
              <Phone size={15} /> Open call cockpit
            </Button>
            {!result.hasIcp && (
              <a href="/accounts" className="mt-2.5 block text-center text-[12px] transition-colors hover:underline" style={{ color: "var(--color-accent)" }}>
                Define your ICP on Accounts &rarr;
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
