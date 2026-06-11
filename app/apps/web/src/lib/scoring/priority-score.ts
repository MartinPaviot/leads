/**
 * Priority score — composite ranking signal for the outbound queue.
 *
 * Formula (R4.2):
 *   priority_score = signal_multiplier × fit_score × accessibility
 *
 * Where:
 *   signal_multiplier — output of `computeMultiplier()` in
 *     `lib/scoring/signal-outcomes.ts`, clamped to [0.5, 2.5]. Reflects
 *     historical lift of the signal type on closed-won deals.
 *   fit_score — `companies.score` (existing real column, 0..1 if
 *     populated, neutral 0.5 if null). Pre-computed by the ICP scorer.
 *   accessibility — 0..1 representing how reachable the company is.
 *     We award 0.4 for email, 0.4 for phone, 0.2 for LinkedIn on the
 *     best contact — phone matters as much as email when the cold
 *     call channel is wired (Twilio + Deepgram, see voice-cold-call).
 *
 * All three inputs are pure values; this module never reads the DB.
 * The caller is responsible for fetching them. This isolation keeps
 * the formula testable and the Inngest cron thin.
 *
 * Kairos accelerator (R4.3): `decideAcceleration` evaluates whether a
 * fresh high-weight signal should bump an active enrollment's
 * `next_step_at` to NOW. The thresholds are documented inline.
 */

export type PriorityInputs = {
  signalMultiplier: number;
  fitScore: number | null;
  accessibility: number;
};

/** Neutral fit score when the ICP scorer hasn't run on a company yet. */
export const NEUTRAL_FIT_SCORE = 0.5;

/**
 * companies.score is 0-100 (Phase 0, _specs/icp-unification R1); the
 * priority formula wants the 0-1 fit. NULL passes through so the
 * neutral default still applies downstream. Clamped because legacy
 * writers may briefly leave out-of-band values mid-backfill.
 */
export function fitFromCompanyScore(score: number | null): number | null {
  if (score === null) return null;
  return Math.max(0, Math.min(1, score / 100));
}

export function computePriorityScore(i: PriorityInputs): number {
  const fit = i.fitScore ?? NEUTRAL_FIT_SCORE;
  return i.signalMultiplier * fit * i.accessibility;
}

// ---------------------------------------------------------------
// Accessibility — best contact at the company wins. We don't sum
// across contacts because outbound only needs *one* reachable lead;
// having three contacts with no email each isn't more reachable than
// one contact with no email.
// ---------------------------------------------------------------

export type ContactReachability = {
  hasEmail: boolean;
  hasPhone: boolean;
  hasLinkedin: boolean;
};

const ACCESSIBILITY_WEIGHTS = {
  email: 0.4,
  phone: 0.4,
  linkedin: 0.2,
} as const;

export function scoreContactReachability(c: ContactReachability): number {
  return (
    (c.hasEmail ? ACCESSIBILITY_WEIGHTS.email : 0) +
    (c.hasPhone ? ACCESSIBILITY_WEIGHTS.phone : 0) +
    (c.hasLinkedin ? ACCESSIBILITY_WEIGHTS.linkedin : 0)
  );
}

export function computeAccessibility(contacts: ContactReachability[]): number {
  if (contacts.length === 0) return 0;
  let best = 0;
  for (const c of contacts) {
    const s = scoreContactReachability(c);
    if (s > best) best = s;
  }
  return best;
}

// ---------------------------------------------------------------
// Kairos accelerator — decide whether a fresh signal should bump an
// active enrollment's `next_step_at` forward to NOW().
//
// The thresholds intentionally guard against four foot-guns:
//   1. Non-active enrollments (replied/bounced/paused/completed) —
//      bumping these would resurrect a finished or stop-on-reply
//      conversation, violating the guardrail.
//   2. Stale signals (> 24h old) — by then the signal has cooled
//      and chronos cadence is fine.
//   3. Weak signals (multiplier < 1.5×) — bumping for every signal
//      defeats the point of prioritisation. Only above-baseline
//      lifters earn the jump.
//   4. Already-due steps — if next_step_at <= now, the cadence cron
//      will fire it on the next tick anyway; bumping would be a no-op
//      that thrashes the row.
// ---------------------------------------------------------------

export const KAIROS_FRESHNESS_WINDOW_MS = 24 * 60 * 60 * 1000;
export const KAIROS_WEIGHT_THRESHOLD = 1.5;

export type EnrollmentStatus =
  | "active"
  | "paused"
  | "completed"
  | "replied"
  | "bounced"
  | "unsubscribed";

export type AccelerationInputs = {
  signalFiredAt: Date;
  signalMultiplier: number;
  enrollmentStatus: EnrollmentStatus;
  enrollmentNextStepAt: Date | null;
  now: Date;
};

export type AccelerationDecision =
  | { shouldBump: true; reason: "fresh_high_weight_signal" }
  | {
      shouldBump: false;
      reason:
        | "enrollment_not_active"
        | "signal_stale"
        | "weight_below_threshold"
        | "no_next_step_scheduled"
        | "already_due";
    };

export function decideAcceleration(
  i: AccelerationInputs,
): AccelerationDecision {
  if (i.enrollmentStatus !== "active") {
    return { shouldBump: false, reason: "enrollment_not_active" };
  }
  const age = i.now.getTime() - i.signalFiredAt.getTime();
  if (age > KAIROS_FRESHNESS_WINDOW_MS) {
    return { shouldBump: false, reason: "signal_stale" };
  }
  if (i.signalMultiplier < KAIROS_WEIGHT_THRESHOLD) {
    return { shouldBump: false, reason: "weight_below_threshold" };
  }
  if (!i.enrollmentNextStepAt) {
    return { shouldBump: false, reason: "no_next_step_scheduled" };
  }
  if (i.enrollmentNextStepAt.getTime() <= i.now.getTime()) {
    return { shouldBump: false, reason: "already_due" };
  }
  return { shouldBump: true, reason: "fresh_high_weight_signal" };
}
