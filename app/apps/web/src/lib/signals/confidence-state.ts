/**
 * 4-state signal confidence classifier.
 *
 * MONACO-PARITY-01 Step 3 — once a signal candidate has been
 * URL-verified (`url-verifier.ts`) and the LLM has reported a numeric
 * confidence, this helper combines both into a single 4-state label
 * that the UI renders as a badge:
 *
 *   - **verified**  : URL HEAD returned 2xx (or known CDN-blocked
 *                     well-formed URL like LinkedIn). The strongest
 *                     guarantee — show in default view, no warning.
 *   - **likely**    : No URL but LLM confidence ≥ 0.70. Still useful
 *                     but the founder should treat it as "probable".
 *                     Default view includes these.
 *   - **uncertain** : No URL and LLM confidence < 0.70. Shown only
 *                     when the founder opts into "Show all".
 *   - **unverified**: URL was provided but HEAD failed (404, DNS,
 *                     timeout, etc). The LLM hallucinated a citation.
 *                     Hidden by default — surfacing them would teach
 *                     the founder to distrust the system.
 *
 * The 0.70 threshold is calibrated to match Monaco's published
 * confidence ladders (per teardown notes). Tunable via the optional
 * `likelyThreshold` argument when callers need to A/B different
 * settings — but the default should be production-correct.
 */

import type { UrlVerificationOutcome } from "./url-verifier";

export type SignalConfidenceState =
  | "verified"
  | "likely"
  | "uncertain"
  | "unverified";

export interface SignalConfidenceInputs {
  /** Result from `verifySignalUrl()` — null when no URL was cited. */
  urlOutcome: UrlVerificationOutcome | null;
  /** LLM-reported confidence, 0-1. Treat null/undefined as 0. */
  llmConfidence: number | null | undefined;
}

export interface SignalConfidenceOptions {
  /** Threshold above which a no-URL signal upgrades from `uncertain`
   *  to `likely`. Default 0.70 to match Monaco's published ladder. */
  likelyThreshold?: number;
}

/**
 * Combine URL verification + LLM confidence into a single 4-state
 * label. Pure function — same inputs always produce the same output.
 *
 * Decision table (read top-to-bottom; first matching row wins):
 *   urlOutcome.status     llmConfidence    →  state
 *   "verified"            *                    verified
 *   "unverified"          *                    unverified  ← URL was claimed and broke
 *   null (no URL)         ≥ likelyThreshold    likely
 *   null (no URL)         < likelyThreshold    uncertain
 *
 * The "unverified" branch is intentionally URL-driven, NOT confidence-
 * driven. Reason: when the LLM cites a URL, the URL IS the citation;
 * a broken URL invalidates the entire signal regardless of how
 * confident the LLM was. Demoting it to "uncertain" because the LLM
 * said "I'm 0.95 sure" would teach us to ignore citations — exactly
 * the failure mode we're trying to prevent.
 */
export function classifySignalConfidence(
  inputs: SignalConfidenceInputs,
  options: SignalConfidenceOptions = {},
): SignalConfidenceState {
  const threshold = options.likelyThreshold ?? 0.70;

  if (inputs.urlOutcome) {
    return inputs.urlOutcome.status === "verified" ? "verified" : "unverified";
  }

  const conf = typeof inputs.llmConfidence === "number" ? inputs.llmConfidence : 0;
  return conf >= threshold ? "likely" : "uncertain";
}

/**
 * Default-view filter — true when the signal should appear in the
 * normal TAM/account list. The "Show all" toggle in the UI passes a
 * different predicate that returns true for every state.
 */
export function isVisibleInDefaultView(state: SignalConfidenceState): boolean {
  return state === "verified" || state === "likely";
}

/**
 * UI accent token per state. The colour mapping is centralised here
 * so a future palette change touches one file. Components import
 * these instead of hard-coding strings.
 */
export const SIGNAL_STATE_COLORS: Record<
  SignalConfidenceState,
  { dot: string; bg: string; label: string }
> = {
  verified: {
    dot: "var(--color-success, #059669)",
    bg: "rgba(16,185,129,0.10)",
    label: "Verified",
  },
  likely: {
    dot: "var(--color-warning, #d97706)",
    bg: "rgba(217,119,6,0.10)",
    label: "Likely",
  },
  uncertain: {
    dot: "var(--color-text-tertiary)",
    bg: "var(--color-bg-hover)",
    label: "Uncertain",
  },
  unverified: {
    dot: "var(--color-error, #dc2626)",
    bg: "rgba(220,38,38,0.08)",
    label: "Unverified",
  },
};
