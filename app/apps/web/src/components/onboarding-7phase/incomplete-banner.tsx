"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles, Loader2 } from "lucide-react";

/**
 * MONACO-PARITY-03 — discoverability shim.
 *
 * The new 7-phase wizard lives at /onboarding-v3 but the existing
 * home page is the entry point. Without a banner, the new flow
 * stays invisible. This component polls /api/onboarding/state on
 * mount; when `completedAt` is null it surfaces an inline CTA at
 * the top of the dashboard urging the founder to finish the wizard.
 *
 * Hides itself on completion or when the failingHard list is empty
 * (no further setup needed). Non-invasive — adds zero padding when
 * not displayed.
 */
interface ChecklistGate {
  key: string;
  required: boolean;
  pass: boolean;
}

interface State {
  currentPhase: number;
  completedPhases: number[];
  completedAt: string | null;
  checklist: { gates: ChecklistGate[]; allHardPassed: boolean; failingHard: string[] };
}

export function OnboardingIncompleteBanner() {
  const [state, setState] = useState<State | null>(null);
  const [hidden, setHidden] = useState(false);
  // Founder-led checkout state — when the user clicks the small
  // upsell on the banner, fire `onboarding_v3_founder_led_clicked`
  // (server-emitted by /api/billing/founder-led-checkout) with
  // source="incomplete_banner" and redirect to Stripe.
  const [founderLedBusy, setFounderLedBusy] = useState(false);

  const startFounderLed = async () => {
    setFounderLedBusy(true);
    try {
      const res = await fetch("/api/billing/founder-led-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "incomplete_banner" }),
      });
      const data = await res.json();
      if (res.ok && data.url) window.location.href = data.url as string;
    } catch {
      // Silent — the user can retry from the wizard upsell.
    } finally {
      setFounderLedBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/onboarding/state");
        if (!res.ok) return;
        const data = (await res.json()) as State;
        if (!cancelled) setState(data);
      } catch {
        /* silent — banner just won't appear */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!state || hidden) return null;
  if (state.completedAt) return null;
  if (state.checklist.allHardPassed && state.completedPhases.length >= 7) return null;

  const remaining = state.checklist.failingHard.length;
  const phasesLeft = Math.max(0, 7 - state.completedPhases.length);

  return (
    <div
      className="mb-4 flex items-center justify-between rounded-xl px-4 py-3"
      style={{
        background:
          "linear-gradient(135deg, var(--color-accent-soft, rgba(99,102,241,0.10)), rgba(217,119,6,0.08))",
        border: "1px solid var(--color-accent, #6366f1)",
      }}
    >
      <div className="flex items-center gap-3">
        <Sparkles size={16} style={{ color: "var(--color-accent, #6366f1)" }} />
        <div>
          <p className="text-[13px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Finish setting up your sales engine
          </p>
          <p className="text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
            {phasesLeft > 0
              ? `${phasesLeft} phase${phasesLeft > 1 ? "s" : ""} left`
              : `${remaining} checklist gate${remaining > 1 ? "s" : ""} still failing`}
            {" · the system blocks features that depend on un-set data."}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startFounderLed}
          disabled={founderLedBusy}
          className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[11px] font-medium disabled:opacity-50"
          style={{
            background: "transparent",
            color: "var(--color-text-secondary)",
            border: "1px solid var(--color-border-default)",
          }}
          title="Skip ahead with a 30-min founder-led session ($299)"
        >
          {founderLedBusy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Sparkles size={11} />
          )}
          Skip with Martin
        </button>
        <Link
          href="/onboarding-v3"
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold"
          style={{
            background: "var(--color-accent, #6366f1)",
            color: "white",
          }}
        >
          Continue setup
          <ArrowRight size={12} />
        </Link>
        <button
          type="button"
          onClick={() => setHidden(true)}
          className="text-[11px] underline"
          style={{ color: "var(--color-text-tertiary)" }}
        >
          Hide
        </button>
      </div>
    </div>
  );
}
