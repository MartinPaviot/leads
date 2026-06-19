"use client";

/**
 * First-visit Call Mode onboarding — captures the rep's objective (any goal)
 * and spins up a goal-driven campaign. Shown when the tenant has no active
 * call campaign yet. Structured controls are the reliable path; the
 * "describe it" box is the chat-first shortcut (LLM-parsed server-side).
 *
 * Split into two short steps so the card always fits the screen. The same
 * goal + cadence controls power the later "Edit plan" modal — see
 * `_call-plan-form.tsx`.
 */

import { useState } from "react";
import { Target, Loader2, Phone, Check, ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GrowTextarea } from "@/components/ui/grow-textarea";
import { useToast } from "@/components/ui/toast";
import { useCallPlan, GoalSection, CadenceSection, PlanPreview } from "./_call-plan-form";

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

export function CallModeOnboarding({
  onCreated,
}: {
  onCreated: (campaign: Campaign, calls: QueueItem[]) => void;
}) {
  const { toast } = useToast();
  const { value, set, daysPerWeek, perDay, payload } = useCallPlan();
  const [phrase, setPhrase] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  // After submit: the honest result — list ready / building / needs ICP — so
  // the user never lands on an empty cockpit or a Twilio dead-end.
  const [result, setResult] = useState<
    { campaign: Campaign; calls: QueueItem[]; callableTotal: number; sourcing: boolean; hasIcp: boolean } | null
  >(null);
  const [voiceReady, setVoiceReady] = useState<boolean | null>(null);

  async function submit(body: Record<string, unknown>) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/calls/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
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

  return (
    <div className="flex h-full w-full items-center justify-center p-4">
      <div
        className="flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col rounded-2xl"
        style={{ background: "var(--color-bg-elevated)", border: "1px solid var(--color-border-default)", boxShadow: "var(--shadow-dialog, 0 12px 40px rgba(0,0,0,0.18))" }}
      >
        {!result && (
        <>
        {/* Pinned header */}
        <div className="flex items-center gap-2.5 px-5 pt-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}>
            <Target size={16} />
          </div>
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>
              {step === 1 ? "Set your calling goal" : "List & cadence"}
            </h2>
            <p className="truncate text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              {step === 1 ? "What do you want to hit, and when?" : "How Elevay sources and retries."}
            </p>
          </div>
          <span className="ml-auto shrink-0 text-[11px] font-medium tabular-nums" style={{ color: "var(--color-text-tertiary)" }}>{step}/2</span>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {step === 1 && (
        <>
          <GoalSection value={value} set={set} />

          {/* Free-text shortcut */}
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--color-border-subtle, var(--color-border-default))" }}>
            <label className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>Or describe it</label>
            <div className="mt-1.5 flex items-end gap-2">
              <GrowTextarea
                value={phrase}
                onChange={(e) => setPhrase(e.target.value)}
                onSubmit={() => { if (phrase.trim()) submit({ phrase: phrase.trim(), maxAttempts: value.maxAttempts, windowDays: value.windowDays, listFrequency: value.listFrequency, workingDays: value.workingDays }); }}
                placeholder='e.g. "book 10 demos this month"'
                className="flex-1"
                style={{ background: "var(--color-bg-base)", border: "1px solid var(--color-border-default)", color: "var(--color-text-primary)" }}
              />
              <Button variant="outline" disabled={submitting || !phrase.trim()} onClick={() => submit({ phrase: phrase.trim(), maxAttempts: value.maxAttempts, windowDays: value.windowDays, listFrequency: value.listFrequency, workingDays: value.workingDays })}>
                Set
              </Button>
            </div>
          </div>
        </>
        )}

        {step === 2 && (
        <>
          <CadenceSection value={value} set={set} />
          <div className="mt-4">
            <PlanPreview value={value} perDay={perDay} daysPerWeek={daysPerWeek} />
          </div>
        </>
        )}
        </div>

        {/* Pinned footer */}
        <div className="flex items-center gap-2 border-t px-5 py-4" style={{ borderColor: "var(--color-border-subtle, var(--color-border-default))" }}>
          {step === 2 && (
            <Button variant="outline" onClick={() => setStep(1)}>
              <ArrowLeft size={15} /> Back
            </Button>
          )}
          {step === 1 ? (
            <Button variant="gradient" className="flex-1" disabled={value.target <= 0} onClick={() => setStep(2)}>
              Continue <ArrowRight size={15} />
            </Button>
          ) : (
            <Button
              variant="gradient"
              className="flex-1"
              disabled={submitting || value.target <= 0}
              onClick={() => submit(payload)}
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Phone size={15} />}
              Start calling
            </Button>
          )}
        </div>
        </>
        )}

        {result && (
          <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: "var(--color-success-soft)", color: "var(--color-success)" }}>
                <Check size={16} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-[15px] font-semibold" style={{ color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>{result.campaign.name}</h2>
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
              <div className="mt-3 rounded-lg px-3.5 py-3 text-[13px]" style={{ background: "var(--color-warning-soft)", color: "var(--color-warning)" }}>
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
