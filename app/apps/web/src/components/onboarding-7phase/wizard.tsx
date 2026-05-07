"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  trackPhaseSubmitted,
  trackWizardOpened,
  trackCompletionAttempt,
  isFreshStart,
  recordPhaseEntry,
  type PhaseTransitionRecord,
} from "@/lib/analytics/onboarding-telemetry";
import { executeWithRetry } from "@/lib/onboarding/retry";
import {
  resolveResumePhase,
  canNavigateToPhase,
  canFinalize,
} from "@/lib/onboarding/resume";

async function fetchWithStatus(
  url: string,
  init?: RequestInit,
): Promise<{ status: number | null; body: unknown }> {
  try {
    const res = await fetch(url, init);
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }
    return { status: res.status, body };
  } catch {
    return { status: null, body: null };
  }
}
import {
  ArrowRight,
  Check,
  Loader2,
  AlertTriangle,
  Sparkles,
  Inbox,
  Calendar,
  Radio,
  Mic,
  ListOrdered,
  MessageSquare,
} from "lucide-react";
import { FounderLedUpsell } from "./founder-led-upsell";
import { resolvePlaybook, type Playbook } from "@/lib/onboarding/playbooks";

/**
 * MONACO-PARITY-03 — 7-phase onboarding wizard.
 *
 * Sam Blond verbatim: "Onboarding is where Monaco wins or loses."
 *
 * This component is the front-end that consumes the API endpoints
 * shipped earlier in this run:
 *   - GET  /api/onboarding/state
 *   - POST /api/onboarding/phase/:n
 *   - POST /api/onboarding/complete
 *
 * Architecture choices:
 *   - One component, seven phase render branches. Easier to read at
 *     this size than seven files; refactor if any phase grows past
 *     ~100 lines of UI.
 *   - Server enforces every gate. The UI shows the gate state but
 *     never blocks navigation client-side without checking the
 *     server response — copy-pasted forms can't bypass.
 *   - Live checklist sidebar mirrors the server checklist response
 *     so the founder always sees what's left.
 */

type GateKey =
  | "tam_size"
  | "tam_relevance"
  | "email_sync"
  | "calendar_sync"
  | "custom_signals"
  | "active_sequence"
  | "pipeline_stages"
  | "coaching_query"
  | "contact_present";

interface ChecklistGate {
  key: GateKey | string;
  required: boolean;
  pass: boolean;
  reason?: string;
}

interface OnboardingState {
  currentPhase: number;
  completedPhases: number[];
  phaseData: Record<string, unknown>;
  startedAt: string;
  completedAt: string | null;
  checklist: {
    gates: ChecklistGate[];
    allHardPassed: boolean;
    failingHard: string[];
  };
  /** Surfaced from the API for client telemetry (P0-3 task 3.1).
   *  Optional so prior callers don't break ; null/undefined disables
   *  telemetry without throwing. */
  userId?: string | null;
  tenantId?: string | null;
}

const PHASE_META: Array<{
  n: number;
  title: string;
  blurb: string;
  icon: typeof Sparkles;
}> = [
  { n: 1, title: "Diagnostic", blurb: "Your situation + ICP one-liner.", icon: Sparkles },
  { n: 2, title: "ICP & TAM", blurb: "Best customers, anti-ICP, live TAM.", icon: Inbox },
  { n: 3, title: "Email & Calendar", blurb: "Connect Gmail/Outlook + Calendar.", icon: Calendar },
  { n: 4, title: "Signals", blurb: "Configure ≥3 custom buying signals.", icon: Radio },
  { n: 5, title: "Voice & Sequences", blurb: "Capture voice, approve a sequence.", icon: Mic },
  { n: 6, title: "Pipeline", blurb: "Define your stages.", icon: ListOrdered },
  { n: 7, title: "Coaching", blurb: "Ask one question to activate.", icon: MessageSquare },
];

export function OnboardingWizard() {
  const router = useRouter();
  const [state, setState] = useState<OnboardingState | null>(null);
  const [activePhase, setActivePhase] = useState<number>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  // P0-3 task 3.1 — telemetry bookkeeping. We track three things :
  //  1. The wizard mount event (started or resumed) — fires once.
  //  2. The current phase entry timestamp — used for per-phase
  //     duration when the user submits.
  //  3. A "did we already fire mount?" guard so re-renders don't
  //     spam events.
  const mountedRef = useRef(false);
  const phaseEntryRef = useRef<PhaseTransitionRecord | null>(null);

  const refreshState = useCallback(async () => {
    try {
      const result = await executeWithRetry(() =>
        fetchWithStatus("/api/onboarding/state"),
      );
      if (
        result.status === null ||
        result.status < 200 ||
        result.status >= 300 ||
        !result.body
      ) {
        throw new Error(
          result.status === null
            ? "Network error"
            : `HTTP ${result.status} after ${result.attempts} attempt(s)`,
        );
      }
      const data = result.body as OnboardingState;
      setState(data);
      // P0-3 task 3.5 — pure resume policy decides where to land.
      // First mount snaps to server's currentPhase ; subsequent
      // refreshes preserve the user's manual nav.
      setActivePhase((p) => {
        const decision = resolveResumePhase(
          {
            currentPhase: data.currentPhase,
            completedPhases: data.completedPhases ?? [],
            completedAt: data.completedAt,
          },
          { currentlyActive: p, isFirstLoad: !mountedRef.current },
        );
        return decision.phase;
      });

      // First successful state load → emit started/resumed once.
      if (!mountedRef.current) {
        mountedRef.current = true;
        const fresh = isFreshStart({
          completedPhases: data.completedPhases ?? [],
          currentPhase: data.currentPhase,
        });
        trackWizardOpened(
          { userId: data.userId ?? null, tenantId: data.tenantId ?? null },
          { isFresh: fresh, resumeAtPhase: data.currentPhase },
        );
        // Stamp the entry timestamp for whichever phase the user
        // is now sitting on so the first submit reports duration.
        phaseEntryRef.current = recordPhaseEntry(data.currentPhase);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  // Re-stamp phase entry whenever the user navigates between phases —
  // duration is "time spent on the visible phase", not "time since
  // wizard mount", so mid-phase nav resets the clock.
  useEffect(() => {
    phaseEntryRef.current = recordPhaseEntry(activePhase);
  }, [activePhase]);

  const submitPhase = useCallback(
    async (n: number, payload: unknown): Promise<boolean> => {
      setSubmitting(true);
      setError(null);
      const enteredAt = phaseEntryRef.current?.enteredAt ?? Date.now();
      const startedAt = state?.startedAt
        ? new Date(state.startedAt).getTime()
        : null;
      const telemetryProps = {
        userId: state?.userId ?? null,
        tenantId: state?.tenantId ?? null,
      };
      try {
        const result = await executeWithRetry(() =>
          fetchWithStatus(`/api/onboarding/phase/${n}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }),
        );
        const res = { ok: result.status !== null && result.status >= 200 && result.status < 300, status: result.status ?? 0 };
        const json = (result.body ?? {}) as Record<string, unknown>;
        if (!res.ok) {
          const msgs = Array.isArray(json.issues)
            ? json.issues.map((i: { path: string; message: string }) =>
                `${i.path}: ${i.message}`,
              )
            : [json.error ?? "Unknown error"];
          setError(msgs.join("\n"));
          trackPhaseSubmitted(
            telemetryProps,
            n,
            {
              success: false,
              validationErrors: Array.isArray(json.issues)
                ? json.issues.length
                : undefined,
            },
            enteredAt,
            startedAt,
          );
          return false;
        }
        await refreshState();
        const next = Math.min(7, n + 1);
        setActivePhase(next);
        trackPhaseSubmitted(
          telemetryProps,
          n,
          { success: true },
          enteredAt,
          startedAt,
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Network error");
        trackPhaseSubmitted(
          telemetryProps,
          n,
          { success: false },
          enteredAt,
          startedAt,
        );
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [refreshState, state],
  );

  const completeOnboarding = useCallback(async () => {
    setCompleting(true);
    setError(null);
    const startedAt = state?.startedAt
      ? new Date(state.startedAt).getTime()
      : Date.now();
    const telemetryProps = {
      userId: state?.userId ?? null,
      tenantId: state?.tenantId ?? null,
    };
    try {
      const result = await executeWithRetry(() =>
        fetchWithStatus("/api/onboarding/complete", { method: "POST" }),
      );
      const res = { ok: result.status !== null && result.status >= 200 && result.status < 300, status: result.status ?? 0 };
      const json = (result.body ?? {}) as Record<string, unknown>;
      if (!res.ok) {
        if (Array.isArray(json.failingGates)) {
          setError(
            "Onboarding not complete:\n" +
              json.failingGates
                .map((g: { key: string; reason?: string }) => `• ${g.key}: ${g.reason ?? ""}`)
                .join("\n"),
          );
        } else {
          setError(json.error ?? "Cannot complete yet.");
        }
        await refreshState();
        trackCompletionAttempt(telemetryProps, {
          success: false,
          failingGatesCount: Array.isArray(json.failingGates)
            ? json.failingGates.length
            : undefined,
          durationMs: Date.now() - startedAt,
        });
        return;
      }
      trackCompletionAttempt(telemetryProps, {
        success: true,
        durationMs: Date.now() - startedAt,
      });
      // Success — bounce to home.
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      trackCompletionAttempt(telemetryProps, {
        success: false,
        durationMs: Date.now() - startedAt,
      });
    } finally {
      setCompleting(false);
    }
  }, [router, refreshState, state]);

  const completedSet = useMemo(
    () => new Set(state?.completedPhases ?? []),
    [state],
  );

  if (!state) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin" size={20} style={{ color: "var(--color-text-tertiary)" }} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <header>
        <h1 className="text-[22px] font-bold tracking-tight" style={{ color: "var(--color-text-primary)" }}>
          Set up your sales engine
        </h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--color-text-tertiary)" }}>
          Seven phases. The system blocks each step until the data is good enough — that's the difference between a working pipeline and a pretty empty one.
        </p>
      </header>

      {/* Premium upsell — visible only when not yet completed. */}
      {!state.completedAt && <FounderLedUpsell />}

      <div className="grid gap-6 md:grid-cols-[1fr_280px]">
        {/* Left: phase content */}
        <div
          className="rounded-xl p-5 space-y-4"
          style={{
            background: "var(--color-bg-card)",
            border: "1px solid var(--color-border-default)",
          }}
        >
          <PhaseStepper
            activePhase={activePhase}
            completedSet={completedSet}
            onSelect={(n) => {
              // Pure helper enforces nav rules (completed + current
              // visit, no jumps ahead, range clamp).
              if (
                canNavigateToPhase(
                  {
                    currentPhase: state.currentPhase,
                    completedPhases: state.completedPhases ?? [],
                    completedAt: state.completedAt,
                  },
                  n,
                )
              ) {
                setActivePhase(n);
              }
            }}
          />

          <div className="pt-4">
            <PhaseBody
              phase={activePhase}
              priorData={state.phaseData}
              onSubmit={(payload) => submitPhase(activePhase, payload)}
              submitting={submitting}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-lg p-3 text-[12px] whitespace-pre-line"
              style={{
                background: "rgba(220,38,38,0.08)",
                color: "var(--color-error, #b91c1c)",
                border: "1px solid rgba(220,38,38,0.25)",
              }}
            >
              <div className="flex items-start gap-2">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {activePhase === 7 &&
            canFinalize(
              {
                currentPhase: state.currentPhase,
                completedPhases: state.completedPhases ?? [],
                completedAt: state.completedAt,
              },
              state.checklist.allHardPassed,
            ) && (
              <button
                type="button"
                onClick={completeOnboarding}
                disabled={completing}
                className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13px] font-semibold disabled:opacity-50"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-accent), var(--color-accent-hover))",
                  color: "white",
                }}
              >
                {completing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Finalise onboarding
              </button>
            )}
        </div>

        {/* Right: live checklist */}
        <ChecklistSidebar gates={state.checklist.gates} />
      </div>
    </div>
  );
}

function PhaseStepper({
  activePhase,
  completedSet,
  onSelect,
}: {
  activePhase: number;
  completedSet: Set<number>;
  onSelect: (n: number) => void;
}) {
  return (
    <ol className="flex flex-wrap gap-2">
      {PHASE_META.map((p) => {
        const done = completedSet.has(p.n);
        const active = p.n === activePhase;
        return (
          <li key={p.n}>
            <button
              type="button"
              onClick={() => onSelect(p.n)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium transition-colors"
              style={{
                background: active
                  ? "var(--color-accent-soft, rgba(99,102,241,0.10))"
                  : done
                    ? "var(--color-success-soft, rgba(16,185,129,0.10))"
                    : "var(--color-bg-hover)",
                color: active
                  ? "var(--color-accent, #6366f1)"
                  : done
                    ? "var(--color-success, #059669)"
                    : "var(--color-text-secondary)",
                border: active ? "1px solid var(--color-accent, #6366f1)" : "1px solid transparent",
              }}
            >
              {done ? <Check size={11} /> : <span>{p.n}</span>}
              <span>{p.title}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function ChecklistSidebar({ gates }: { gates: ChecklistGate[] }) {
  return (
    <aside
      className="rounded-xl p-4 space-y-2 h-fit"
      style={{
        background: "var(--color-bg-card)",
        border: "1px solid var(--color-border-default)",
      }}
    >
      <h2 className="text-[12px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        Live checklist
      </h2>
      <ul className="space-y-1.5">
        {gates.map((g) => (
          <li key={g.key} className="flex items-start gap-2 text-[12px]">
            <span
              className="mt-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full"
              style={{
                background: g.pass
                  ? "var(--color-success-soft, rgba(16,185,129,0.15))"
                  : g.required
                    ? "rgba(220,38,38,0.10)"
                    : "var(--color-bg-hover)",
                color: g.pass
                  ? "var(--color-success, #059669)"
                  : g.required
                    ? "var(--color-error, #b91c1c)"
                    : "var(--color-text-tertiary)",
              }}
            >
              {g.pass ? <Check size={9} /> : <span className="block h-1 w-1 rounded-full bg-current" />}
            </span>
            <div className="min-w-0">
              <div style={{ color: "var(--color-text-primary)" }}>{labelForGate(g.key)}</div>
              {!g.pass && g.reason && (
                <div className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {g.reason}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function labelForGate(key: string): string {
  switch (key) {
    case "tam_size":
      return "TAM ≥ 30 accounts";
    case "tam_relevance":
      return "≥3 A-grade accounts";
    case "email_sync":
      return "Email synced (≥10 in 7d)";
    case "calendar_sync":
      return "Calendar synced (≥1 event)";
    case "custom_signals":
      return "≥3 custom signals";
    case "active_sequence":
      return "≥1 active sequence";
    case "pipeline_stages":
      return "Pipeline stages";
    case "coaching_query":
      return "First coaching query";
    case "contact_present":
      return "Contacts present";
    default:
      return key;
  }
}

// ── Phase bodies ─────────────────────────────────────────────

function PhaseBody({
  phase,
  priorData,
  onSubmit,
  submitting,
}: {
  phase: number;
  priorData: Record<string, unknown>;
  onSubmit: (payload: unknown) => Promise<boolean>;
  submitting: boolean;
}) {
  switch (phase) {
    case 1:
      return <Phase1 priorData={priorData} onSubmit={onSubmit} submitting={submitting} />;
    case 2:
      return <Phase2 priorData={priorData} onSubmit={onSubmit} submitting={submitting} />;
    case 3:
      return <Phase3 priorData={priorData} onSubmit={onSubmit} submitting={submitting} />;
    case 4:
      return <Phase4 priorData={priorData} onSubmit={onSubmit} submitting={submitting} />;
    case 5:
      return <Phase5 priorData={priorData} onSubmit={onSubmit} submitting={submitting} />;
    case 6:
      return <Phase6 priorData={priorData} onSubmit={onSubmit} submitting={submitting} />;
    case 7:
      return <Phase7 priorData={priorData} onSubmit={onSubmit} submitting={submitting} />;
    default:
      return null;
  }
}

interface PhaseProps {
  priorData: Record<string, unknown>;
  onSubmit: (payload: unknown) => Promise<boolean>;
  submitting: boolean;
}

function Phase1({ priorData, onSubmit, submitting }: PhaseProps) {
  const prior = (priorData["1"] as Record<string, unknown>) ?? {};
  const priorIcp = (prior.icp as Record<string, unknown>) ?? {};
  const [situation, setSituation] = useState<string>((prior.situation as string) ?? "founder_solo");
  const [dealsToDate, setDealsToDate] = useState<number>(Number(prior.dealsToDate ?? 0));
  const [industry, setIndustry] = useState<string>((priorIcp.industry as string) ?? "");
  const [sizeRange, setSizeRange] = useState<string>((priorIcp.sizeRange as string) ?? "");
  const [buyer, setBuyer] = useState<string>((priorIcp.buyerPersona as string) ?? "");
  const [raw, setRaw] = useState<string>((priorIcp.raw as string) ?? "");

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          situation,
          dealsToDate,
          icp: { industry, sizeRange, buyerPersona: buyer, raw },
        });
      }}
      className="space-y-3"
    >
      <SectionLabel n={1} title="Diagnostic" />
      <Field label="Situation">
        <select
          value={situation}
          onChange={(e) => setSituation(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        >
          <option value="founder_solo">Founder solo</option>
          <option value="founder_team">Founders 2-3</option>
          <option value="founder_with_sdr">Founder + 1 SDR</option>
          <option value="team_5plus">Sales team ≥5</option>
          <option value="other">Other</option>
        </select>
      </Field>
      <Field label="Deals closed to date">
        <input
          type="number"
          min={0}
          value={dealsToDate}
          onChange={(e) => setDealsToDate(Number(e.target.value))}
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <Field label="ICP — industry">
        <input
          type="text"
          value={industry}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Devtools, fintech, healthtech…"
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <Field label="ICP — size range">
        <input
          type="text"
          value={sizeRange}
          onChange={(e) => setSizeRange(e.target.value)}
          placeholder="11-50 employees, $1M-$10M ARR…"
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <Field label="ICP — buyer persona">
        <input
          type="text"
          value={buyer}
          onChange={(e) => setBuyer(e.target.value)}
          placeholder="Head of Engineering, VP Sales…"
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <Field label="ICP — one sentence">
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="VC-backed devtools 11-50 selling AI infra to Head of Engineering, US-based"
          rows={2}
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <SubmitButton submitting={submitting} label="Save & continue" />
    </form>
  );
}

function Phase2({ priorData, onSubmit, submitting }: PhaseProps) {
  const prior = (priorData["2"] as Record<string, unknown>) ?? {};
  const [best, setBest] = useState<string>(
    Array.isArray(prior.bestCustomers) ? (prior.bestCustomers as string[]).join("\n") : "",
  );
  const [anti, setAnti] = useState<string>(
    Array.isArray(prior.antiIcp) ? (prior.antiIcp as string[]).join("\n") : "",
  );
  const [confirmed, setConfirmed] = useState<boolean>(Boolean(prior.relevanceConfirmed));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const bestCustomers = best.split("\n").map((s) => s.trim()).filter(Boolean);
        const antiIcp = anti.split("\n").map((s) => s.trim()).filter(Boolean);
        onSubmit({ bestCustomers, antiIcp, relevanceConfirmed: confirmed });
      }}
      className="space-y-3"
    >
      <SectionLabel n={2} title="ICP & TAM" />
      <Field label="Your 5 best customers (one per line, or 5 ideal prospects)">
        <textarea
          value={best}
          onChange={(e) => setBest(e.target.value)}
          rows={5}
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <Field label="3 companies you do NOT want as customers (anti-ICP)">
        <textarea
          value={anti}
          onChange={(e) => setAnti(e.target.value)}
          rows={3}
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I'll review the live TAM once it builds and mark ≥3 A-grade accounts as relevant.
      </label>
      <SubmitButton submitting={submitting} label="Save & continue" />
    </form>
  );
}

function Phase3({ priorData, onSubmit, submitting }: PhaseProps) {
  const prior = (priorData["3"] as Record<string, unknown>) ?? {};
  const [emailProvider, setEmailProvider] = useState<string>(
    (prior.emailProvider as string) ?? "gmail",
  );
  const [calendarProvider, setCalendarProvider] = useState<string>(
    (prior.calendarProvider as string) ?? "google",
  );
  const [recallConnected, setRecallConnected] = useState<boolean>(
    Boolean(prior.recallConnected),
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ emailProvider, calendarProvider, recallConnected });
      }}
      className="space-y-3"
    >
      <SectionLabel n={3} title="Email & Calendar" />
      <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Connect via Settings → Mail & Calendar, then mark the providers below.
      </p>
      <Field label="Email provider">
        <select
          value={emailProvider}
          onChange={(e) => setEmailProvider(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        >
          <option value="gmail">Gmail</option>
          <option value="outlook">Outlook</option>
          <option value="none">Not connected yet</option>
        </select>
      </Field>
      <Field label="Calendar provider">
        <select
          value={calendarProvider}
          onChange={(e) => setCalendarProvider(e.target.value)}
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        >
          <option value="google">Google Calendar</option>
          <option value="microsoft">Microsoft Calendar</option>
          <option value="none">Not connected yet</option>
        </select>
      </Field>
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
        <input type="checkbox" checked={recallConnected} onChange={(e) => setRecallConnected(e.target.checked)} />
        Recall.ai bot connected (Settings → Integrations).
      </label>
      <SubmitButton submitting={submitting} label="Save & continue" />
    </form>
  );
}

function Phase4({ priorData, onSubmit, submitting }: PhaseProps) {
  const prior = (priorData["4"] as Record<string, unknown>) ?? {};
  // Resolve the vertical playbook from Phase-1 ICP industry input.
  // The playbook ships 5 canonical signals + 3 sequence templates
  // tailored to the founder's vertical — pre-filling them beats a
  // blank field by far in time-to-first-value (audit Sprint-3).
  const phase1 = (priorData["1"] as Record<string, unknown>) ?? {};
  const phase1Icp = (phase1.icp as Record<string, unknown>) ?? {};
  const industry = (phase1Icp.industry as string) ?? "";
  const playbook: Playbook = resolvePlaybook(industry);

  const initialSignals = Array.isArray(prior.customSignals)
    ? (prior.customSignals as Array<{ question: string; rationale: string }>)
    : // Pre-fill the 3 first playbook signals as starter rows the
      // founder can edit / extend / replace. Better than blank inputs.
      playbook.signals.slice(0, 3).map((s) => ({
        question: s.label,
        rationale: s.rationale,
      }));
  const [signals, setSignals] = useState(initialSignals);

  const update = (idx: number, key: "question" | "rationale", value: string) => {
    setSignals((cur) => cur.map((s, i) => (i === idx ? { ...s, [key]: value } : s)));
  };

  /** Add a playbook signal that's not yet in the list. */
  const addPlaybookSignal = (sigKey: string) => {
    const sig = playbook.signals.find((s) => s.key === sigKey);
    if (!sig) return;
    setSignals((cur) => [
      ...cur,
      { question: sig.label, rationale: sig.rationale },
    ]);
  };

  const usedKeys = new Set(
    signals
      .map((s) => playbook.signals.find((p) => p.label === s.question)?.key)
      .filter((k): k is string => !!k),
  );
  const unusedPlaybookSignals = playbook.signals.filter(
    (s) => !usedKeys.has(s.key),
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ customSignals: signals.filter((s) => s.question && s.rationale) });
      }}
      className="space-y-3"
    >
      <SectionLabel n={4} title="Signals" />
      <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Three buying signals at minimum. Each is a phrase the system can boolean-answer per account.
      </p>
      {/* Playbook context — surfaces which vertical playbook is
          driving the suggestions. The founder sees what we inferred
          from Phase 1 + can override by editing rows. */}
      <div
        className="rounded-md p-2 text-[11px]"
        style={{
          background: "var(--color-accent-soft, rgba(99,102,241,0.08))",
          border: "1px solid rgba(99,102,241,0.20)",
          color: "var(--color-text-secondary)",
        }}
      >
        Playbook : <strong>{playbook.label}</strong>. Pre-filled 3 canonical signals — edit, replace, or add more below.
      </div>
      {signals.map((s, i) => (
        <div key={i} className="rounded-lg p-3 space-y-2" style={{ border: "1px solid var(--color-border-default)" }}>
          <Field label={`Signal ${i + 1} — question`}>
            <input
              type="text"
              value={s.question}
              onChange={(e) => update(i, "question", e.target.value)}
              placeholder="Are they hiring a Head of Growth?"
              className="w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
            />
          </Field>
          <Field label="Why this signal matters">
            <input
              type="text"
              value={s.rationale}
              onChange={(e) => update(i, "rationale", e.target.value)}
              placeholder="A new Head of Growth means a new outbound budget"
              className="w-full rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
            />
          </Field>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSignals((c) => [...c, { question: "", rationale: "" }])}
          className="text-[12px] underline"
          style={{ color: "var(--color-accent)" }}
        >
          + Add a blank signal
        </button>
        {unusedPlaybookSignals.length > 0 && (
          <>
            <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
              · or pull from playbook :
            </span>
            {unusedPlaybookSignals.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => addPlaybookSignal(s.key)}
                className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                style={{
                  background: "var(--color-bg-hover)",
                  color: "var(--color-text-secondary)",
                  border: "1px solid var(--color-border-default)",
                }}
              >
                + {s.label}
              </button>
            ))}
          </>
        )}
      </div>
      <SubmitButton submitting={submitting} label="Save & continue" />
    </form>
  );
}

function Phase5({ priorData, onSubmit, submitting }: PhaseProps) {
  const prior = (priorData["5"] as Record<string, unknown>) ?? {};
  const initialEmails = Array.isArray(
    (prior.voiceSamples as Record<string, unknown>)?.emails,
  )
    ? ((prior.voiceSamples as Record<string, unknown>).emails as string[]).join("\n---\n")
    : "";
  const [emailsText, setEmailsText] = useState(initialEmails);
  const [loomUrl, setLoomUrl] = useState<string>(
    ((prior.voiceSamples as Record<string, unknown>)?.loomUrl as string) ?? "",
  );
  const [seqIds, setSeqIds] = useState<string>(
    Array.isArray(prior.approvedSequenceIds)
      ? (prior.approvedSequenceIds as string[]).join(", ")
      : "",
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const emails = emailsText
          .split(/\n-{3,}\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        const approvedSequenceIds = seqIds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        onSubmit({
          voiceSamples: { emails, ...(loomUrl ? { loomUrl } : {}) },
          approvedSequenceIds,
        });
      }}
      className="space-y-3"
    >
      <SectionLabel n={5} title="Voice & Sequences" />
      <Field label="Paste 5 emails you've already sent — separate with `---`">
        <textarea
          value={emailsText}
          onChange={(e) => setEmailsText(e.target.value)}
          rows={6}
          placeholder="Subject: …&#10;Body…&#10;---&#10;Subject: …"
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <Field label="Or paste a 60s Loom URL">
        <input
          type="url"
          value={loomUrl}
          onChange={(e) => setLoomUrl(e.target.value)}
          placeholder="https://www.loom.com/share/…"
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <Field label="IDs of sequences you've approved + started (comma-separated)">
        <input
          type="text"
          value={seqIds}
          onChange={(e) => setSeqIds(e.target.value)}
          placeholder="seq_abc123, seq_def456"
          className="w-full rounded-md border px-3 py-2 text-[13px]"
          style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
        />
      </Field>
      <SubmitButton submitting={submitting} label="Save & continue" />
    </form>
  );
}

function Phase6({ priorData, onSubmit, submitting }: PhaseProps) {
  const prior = (priorData["6"] as Record<string, unknown>) ?? {};
  // Pre-fill stages from the resolved playbook (per Phase-1 industry).
  // Devtools / fintech / healthtech / etc each have distinct
  // canonical stages — see `_research/playbooks/<slug>.md` for the
  // rationale per vertical.
  const phase1 = (priorData["1"] as Record<string, unknown>) ?? {};
  const phase1Icp = (phase1.icp as Record<string, unknown>) ?? {};
  const industry = (phase1Icp.industry as string) ?? "";
  const playbook = resolvePlaybook(industry);

  const initialStages = Array.isArray(prior.stages)
    ? (prior.stages as Array<{ id: string; name: string }>)
    : playbook.defaultStages;
  const [stages, setStages] = useState(initialStages);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ stages, confirmedAt: new Date().toISOString() });
      }}
      className="space-y-3"
    >
      <SectionLabel n={6} title="Pipeline" />
      <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Rename stages to match your reality. Sam Blond verbatim: "Stages, risks, and next steps that reflect reality — not rep hygiene."
      </p>
      <ul className="space-y-2">
        {stages.map((s, i) => (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className="text-[10px] font-mono"
              style={{ color: "var(--color-text-tertiary)", width: 60 }}
            >
              {s.id}
            </span>
            <input
              type="text"
              value={s.name}
              onChange={(e) =>
                setStages((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
              className="flex-1 rounded-md border px-3 py-2 text-[13px]"
              style={{ background: "var(--color-bg-base)", borderColor: "var(--color-border-default)" }}
            />
          </li>
        ))}
      </ul>
      <SubmitButton submitting={submitting} label="Save & continue" />
    </form>
  );
}

function Phase7({ onSubmit, submitting }: PhaseProps) {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ firstQueryDone: confirmed });
      }}
      className="space-y-3"
    >
      <SectionLabel n={7} title="Coaching activation" />
      <p className="text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
        Open the chat panel (sidebar) and ask one question — e.g. "What's at risk in my pipeline this week?". Then confirm below.
      </p>
      <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--color-text-secondary)" }}>
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        I asked at least one question and got a response.
      </label>
      <SubmitButton submitting={submitting} label="Mark complete" />
    </form>
  );
}

function SectionLabel({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
        Phase {n}
      </span>
      <span className="text-[15px] font-semibold" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>
        {label}
      </span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function SubmitButton({ submitting, label }: { submitting: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={submitting}
      className="flex items-center justify-center gap-2 rounded-md px-4 py-2 text-[13px] font-medium disabled:opacity-50"
      style={{
        background: "var(--color-accent, #6366f1)",
        color: "white",
      }}
    >
      {submitting ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
      {label}
    </button>
  );
}
