/**
 * Client-side telemetry for the 7-phase onboarding (P0-3 task 3.1).
 *
 * Pure helper module — emits typed events through the existing
 * `trackEvent()` PostHog dispatcher. The wizard imports
 * `useOnboardingTelemetry()` and gets a tracker that knows the user
 * identity + the phase-entry timestamps so duration data fires
 * automatically.
 *
 * Why a custom helper rather than reusing the server-side
 * `posthogEvents.<name>` from `analytics.ts` :
 *   - The server module relies on Node `fetch` + a server env var ;
 *     it can't run in the browser.
 *   - This module mirrors the same event names so PostHog merges
 *     client + server fan-out into one funnel without renames.
 *
 * Tested in `__tests__/onboarding-telemetry.test.ts` — emit ordering,
 * duration math, no-op when userId is unknown.
 */

import { trackEvent } from "@/components/posthog-provider";

export interface OnboardingTelemetryProps {
  userId: string | null;
  tenantId: string | null;
}

export interface PhaseTransitionRecord {
  phase: number;
  enteredAt: number; // millisecond timestamp
}

export type PhaseSubmitOutcome = {
  success: boolean;
  validationErrors?: number;
};

/**
 * Track a phase submit. Computes the duration since the phase was
 * entered (caller maintains the entry timestamp in
 * PhaseTransitionRecord). When userId is null (e.g. session expired
 * mid-flow), emits nothing — telemetry must never throw.
 */
export function trackPhaseSubmitted(
  props: OnboardingTelemetryProps,
  phase: number,
  outcome: PhaseSubmitOutcome,
  enteredAt: number,
  startedAt: number | null,
): void {
  if (!props.userId) return;
  const now = Date.now();
  const durationMs = Math.max(0, now - enteredAt);
  const durationSinceStartMs =
    startedAt != null ? Math.max(0, now - startedAt) : undefined;

  trackEvent(props.userId, "onboarding_v3_phase_submitted", {
    tenantId: props.tenantId,
    phase,
    success: outcome.success,
    validationErrors: outcome.validationErrors,
    durationMs,
    durationSinceStartMs,
  });
}

/**
 * Track wizard mount. Differentiates "first-time start" from "resume"
 * based on whether the tenant has already completed any phase. Emits
 * `onboarding_started` on first session, `onboarding_resumed`
 * subsequently.
 */
export function trackWizardOpened(
  props: OnboardingTelemetryProps,
  args: { isFresh: boolean; resumeAtPhase: number },
): void {
  if (!props.userId) return;
  if (args.isFresh) {
    trackEvent(props.userId, "onboarding_started", {
      userId: props.userId,
      tenantId: props.tenantId,
    });
  } else {
    trackEvent(props.userId, "onboarding_resumed", {
      fromStep: `phase_${args.resumeAtPhase}`,
      tenantId: props.tenantId,
    });
  }
}

export interface CompletionTrack {
  success: boolean;
  failingGatesCount?: number;
  durationMs: number;
}

export function trackCompletionAttempt(
  props: OnboardingTelemetryProps,
  args: CompletionTrack,
): void {
  if (!props.userId) return;
  trackEvent(props.userId, "onboarding_v3_completed", {
    tenantId: props.tenantId,
    success: args.success,
    failingGatesCount: args.failingGatesCount,
    durationMs: args.durationMs,
  });
}

/**
 * Pure : derive whether this is a fresh start. Used by the wizard
 * mount to decide which event to fire. Treats `completedPhases` of
 * 0 length AND no recent activity as fresh.
 */
export function isFreshStart(state: {
  completedPhases: ReadonlyArray<number>;
  currentPhase: number;
}): boolean {
  return state.completedPhases.length === 0 && state.currentPhase === 1;
}

/**
 * Track a phase entry (user landed on phase X). Pure — caller
 * computes the timestamp ; this function returns the record so the
 * caller can stash it in state.
 */
export function recordPhaseEntry(phase: number): PhaseTransitionRecord {
  return { phase, enteredAt: Date.now() };
}
