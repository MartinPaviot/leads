/**
 * Signal freshness — the shelf life of a buying signal.
 *
 * The methodology (The Method, step 7) states it plainly: every signal type
 * has a shelf life, and citing a stale one is WORSE than citing none, because
 * it proves the outreach is automated. This module is the single source of
 * truth for those shelf lives, applied at the three read points where a
 * signal would otherwise leak past its expiry:
 *   - scoring (lib/scoring/score-with-signals.ts) — an expired signal stops
 *     boosting priorityScore;
 *   - drafts (lib/context/prospect-context.ts) — an expired signal is no
 *     longer injected into the LLM context for sequence generation;
 *   - calls (lib/call-mode/live-script.ts) — an expired signal is no longer
 *     offered as a reason to call.
 *
 * The TTLs mirror the step-7 table exactly. Event signals decay; a *structural*
 * fact (shared investors) is not an event and does not stale, modelled as a
 * `null` TTL = never expires. An unknown event type falls back to a
 * conservative 90 days rather than living forever.
 *
 * Conservative rule on missing dates: a signal with no observed date is KEPT
 * (absence of a date is not proof of staleness — over-pruning would hide real
 * signals). Only a signal whose date is demonstrably past its TTL is dropped.
 *
 * Pure, no I/O — unit-tested.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Days a signal stays "fresh". `null` = structural fact, never expires. */
export const SIGNAL_TTL_DAYS: Record<string, number | null> = {
  // Hiring (~30 days per posting)
  hiring: 30,
  hiring_intent: 30,
  // A hiring SURGE (≥5 open roles, signal-monitor) is the same shelf life as a
  // single posting — a 2-month-old surge is no longer a reason to reach out.
  hiring_surge: 30,
  // Fundraise (~180 days)
  funding: 180,
  funding_recent: 180,
  funding_crunchbase: 180,
  // M&A: the integration / budget-reset window runs long, like a raise.
  acquisition: 180,
  // New executive in seat (~120 days)
  leadership_change: 120,
  // A fresh VP/C-level hire (signal-monitor) decays on the same ~120d window.
  executive_hire: 120,
  // Technology change detected (~90 days)
  tech_stack_change: 90,
  tech_adoption: 90,
  // Competitor / replacement window (~90 days)
  competitor_mention: 90,
  // Expansion family (~90 days)
  expansion: 90,
  new_department: 90,
  headcount_growth: 90,
  // Web intent — "Days": a pricing/demo visit or a public ask is acted on in
  // hours and is meaningless a week later.
  website_visit: 7,
  page_visit: 7,
  demo_request: 7,
  recommendation_ask: 7,
  // Trial expiry is sharply time-bound.
  trial_expiring: 14,
  // Engagement signals (the FREE, in-product source). A reply is the strongest
  // and holds a couple weeks; opens/clicks cool within a week like web intent.
  positive_reply: 14,
  linkedin_reply: 21,
  meeting_booked: 30,
  email_clicked: 7,
  email_opened: 7,
  linkedin_accept: 90,
  // Structural facts (not events): never stale.
  investor_overlap: null,
  // Warm-network proximity — a 1st-degree connection is a standing relationship
  // fact, not a decaying event (like investor_overlap). Re-emitted each sync.
  warm_connection: null,
};

/** Fallback for an unrecognized event signal type. */
export const DEFAULT_SIGNAL_TTL_DAYS = 90;

function normalizeType(type: string): string {
  return type.trim().toLowerCase();
}

/** TTL in days for a signal type; `null` = never expires. */
export function ttlDaysFor(type: string): number | null {
  const key = normalizeType(type);
  if (key in SIGNAL_TTL_DAYS) return SIGNAL_TTL_DAYS[key];
  return DEFAULT_SIGNAL_TTL_DAYS;
}

/**
 * Is a signal still fresh? A `null`/empty observed date is treated as fresh
 * (cannot prove staleness). A structural signal (null TTL) is always fresh.
 */
export function isSignalFresh(
  type: string,
  observedAt: Date | string | null | undefined,
  now: Date = new Date(),
): boolean {
  const ttl = ttlDaysFor(type);
  if (ttl === null) return true; // structural fact, never stale
  if (observedAt == null || observedAt === "") return true; // no date → keep
  const observed = observedAt instanceof Date ? observedAt : new Date(observedAt);
  if (Number.isNaN(observed.getTime())) return true; // unparseable → keep
  const ageDays = (now.getTime() - observed.getTime()) / DAY_MS;
  if (ageDays < 0) return true; // future date → keep
  return ageDays <= ttl;
}

/**
 * Filter a list of dated signals to the fresh ones. Generic over any shape
 * that exposes a `type` and a date under one of the common field names used
 * across the codebase (`firedAt`, `observedAt`, `detectedAt`).
 */
export function filterFreshSignals<
  T extends {
    type: string;
    firedAt?: Date | string | null;
    observedAt?: Date | string | null;
    detectedAt?: Date | string | null;
  },
>(signals: T[], now: Date = new Date()): T[] {
  return signals.filter((s) =>
    isSignalFresh(s.type, s.firedAt ?? s.observedAt ?? s.detectedAt ?? null, now),
  );
}
