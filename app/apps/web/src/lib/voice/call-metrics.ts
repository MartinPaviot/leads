/**
 * Pure cold-call performance math — the metrics cold-call experts actually
 * track, derived from outcome counts + timing buckets already stored on
 * `calls`. No DB, no LLM, client-safe: the API route feeds it SQL aggregates,
 * the metrics modal formats the result.
 *
 * Rates are gated by a sample floor so a thin week never renders a noisy
 * percentage — the same no-noise discipline as the cohort-insights engine
 * (a rate on 3 dials is not a rate, it's an anecdote). Below the floor the
 * value is null and the UI shows "—", never a misleading %.
 */

import { TALK_RATIO_BAND } from "./lever-scoring";

export { TALK_RATIO_BAND };

/**
 * A connect = we reached the TARGET human. `not_interested` counts (they
 * answered and declined — that is a connect); `gatekeeper` does NOT (a human,
 * but not the target — surfaced as its own rate). Single source of truth used
 * by both the SQL filters and the UI so the two can never drift.
 */
export const CONNECT_OUTCOMES = [
  "connected",
  "meeting_booked",
  "callback_requested",
  "not_interested",
] as const;

/** Minimum dials before a dial-denominated rate is shown as a %. */
export const RATE_SAMPLE_FLOOR = 20;
/** Minimum connects before a connect-denominated rate is shown. */
export const CONNECT_SAMPLE_FLOOR = 10;
/** Minimum dials in an hour/day bucket before it can be ranked "best". */
export const BUCKET_SAMPLE_FLOOR = 10;

/**
 * Sourced 2025-26 B2B cold-call benchmark bands. Shown as muted "repère" hints
 * next to the live number so a rep knows whether they are on track — never as a
 * target to game. See _research/cold-call-metrics-audit-2026-06-16.md.
 */
export const BENCHMARKS = {
  connectRate: { typical: [0.05, 0.12] as [number, number], top: 0.25 },
  dialsPerMeeting: { typical: [40, 45] as [number, number], top: 20 },
  talkTimeDailyMin: [90, 120] as [number, number],
  talkRatioBand: TALK_RATIO_BAND,
} as const;

/** Raw outcome tallies over a window — one number per `call_outcome` enum value. */
export interface OutcomeCounts {
  dials: number;
  connected: number;
  meeting_booked: number;
  callback_requested: number;
  not_interested: number;
  voicemail_left: number;
  no_answer: number;
  busy: number;
  gatekeeper: number;
  wrong_number: number;
  do_not_call: number;
  failed: number;
}

export const EMPTY_OUTCOME_COUNTS: OutcomeCounts = {
  dials: 0,
  connected: 0,
  meeting_booked: 0,
  callback_requested: 0,
  not_interested: 0,
  voicemail_left: 0,
  no_answer: 0,
  busy: 0,
  gatekeeper: 0,
  wrong_number: 0,
  do_not_call: 0,
  failed: 0,
};

/** A rate whose value is null when the denominator is below the sample floor. */
export interface Rate {
  value: number | null;
  num: number;
  den: number;
}

function rate(num: number, den: number, floor: number): Rate {
  return { value: den >= floor && den > 0 ? num / den : null, num, den };
}

export function countConnects(c: OutcomeCounts): number {
  return c.connected + c.meeting_booked + c.callback_requested + c.not_interested;
}

export interface CallMetrics {
  dials: number;
  connects: number;
  meetings: number;
  /** reached the human / dials */
  connectRate: Rate;
  /** numéro répond pas / dials */
  nrpRate: Rate;
  voicemailRate: Rate;
  busyRate: Rate;
  /** wrong_number / dials — a data-quality signal */
  badNumberRate: Rate;
  gatekeeperRate: Rate;
  notInterestedRate: Rate;
  /** meetings / dials */
  meetingRate: Rate;
  /** meetings / connects — the conversation→meeting conversion */
  meetingConversion: Rate;
  /** dials needed per meeting booked (efficiency) */
  dialsPerMeeting: number | null;
  /** dials needed per connect */
  dialsPerConnect: number | null;
}

export function computeCallMetrics(
  c: OutcomeCounts,
  floor = RATE_SAMPLE_FLOOR,
): CallMetrics {
  const dials = c.dials;
  const connects = countConnects(c);
  const meetings = c.meeting_booked;
  return {
    dials,
    connects,
    meetings,
    connectRate: rate(connects, dials, floor),
    nrpRate: rate(c.no_answer, dials, floor),
    voicemailRate: rate(c.voicemail_left, dials, floor),
    busyRate: rate(c.busy, dials, floor),
    badNumberRate: rate(c.wrong_number, dials, floor),
    gatekeeperRate: rate(c.gatekeeper, dials, floor),
    notInterestedRate: rate(c.not_interested, dials, floor),
    meetingRate: rate(meetings, dials, floor),
    meetingConversion: rate(meetings, connects, CONNECT_SAMPLE_FLOOR),
    dialsPerMeeting: dials >= floor && meetings > 0 ? dials / meetings : null,
    dialsPerConnect: dials >= floor && connects > 0 ? dials / connects : null,
  };
}

// ── Best time to call ───────────────────────────────────────────────────────

export interface TimeBucket {
  /** hour 0-23, or day-of-week 0-6 (pg EXTRACT(dow): 0=Sunday) */
  key: number;
  dials: number;
  connects: number;
}

export interface RankedBucket extends TimeBucket {
  connectRate: number;
}

/**
 * Rank time buckets (hour-of-day or day-of-week) by connect rate, keeping only
 * those with enough dials to mean anything. Returns the top `n`, best first —
 * the "call Wednesday 4pm" insight, grounded in the rep's own history.
 */
export function bestWindows(
  buckets: TimeBucket[],
  n = 3,
  floor = BUCKET_SAMPLE_FLOOR,
): RankedBucket[] {
  return buckets
    .filter((b) => b.dials >= floor)
    .map((b) => ({ ...b, connectRate: b.dials > 0 ? b.connects / b.dials : 0 }))
    .sort((a, b) => b.connectRate - a.connectRate || b.dials - a.dials)
    .slice(0, n);
}

// ── Formatting (client) ─────────────────────────────────────────────────────

export function fmtPct(r: Rate | number | null): string {
  const v = typeof r === "number" || r === null ? r : r.value;
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`;
}

export function fmtRatio(n: number | null): string {
  if (n === null || Number.isNaN(n)) return "—";
  return n.toFixed(n < 10 ? 1 : 0);
}

/** pg EXTRACT(dow): 0=Sunday … 6=Saturday. */
export const DOW_FR = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

export function fmtHour(h: number): string {
  return `${h}h`;
}
