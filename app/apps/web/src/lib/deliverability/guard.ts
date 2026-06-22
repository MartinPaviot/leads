/**
 * Spec 27 — deliverability guard. Rolling bounce/spam/health from send + reply
 * events, threshold-breach pause (provider-specific), hard-bounce suppression,
 * and a cool-off + ramp-back resume. Fully deterministic; protects a degrading
 * domain before it is burned. Blast radius: deliverability/* only.
 */

import { DEFAULT_THRESHOLDS, spamThreshold, type DeliverabilityThresholds } from "./thresholds";

export type DeliverabilityEventType = "send" | "bounce" | "complaint" | "reply";

export interface DeliverabilityEvent {
  type: DeliverabilityEventType;
  at: number;
  /** A bounce that is permanent (hard) → suppression (AC3). */
  hard?: boolean;
  /** Address, for hard-bounce suppression. */
  address?: string;
}

export interface Health {
  scope: string;
  provider: string;
  sends: number;
  bounces: number;
  complaints: number;
  replies: number;
  bounceRate: number;
  spamRate: number;
  replyRate: number;
  status: "healthy" | "warning" | "breached";
  breaches: string[];
}

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** AC1 — rolling counts/rates over the window ending at `now`. */
export function computeHealth(
  scope: string,
  provider: string,
  events: DeliverabilityEvent[],
  opts: { windowMs?: number; now?: number; thresholds?: DeliverabilityThresholds } = {},
): Health {
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const t = opts.thresholds ?? DEFAULT_THRESHOLDS;
  const since = now - windowMs;

  let sends = 0, bounces = 0, complaints = 0, replies = 0;
  for (const e of events) {
    if (e.at < since || e.at > now) continue;
    if (e.type === "send") sends++;
    else if (e.type === "bounce") bounces++;
    else if (e.type === "complaint") complaints++;
    else if (e.type === "reply") replies++;
  }

  const denom = sends || 0;
  const bounceRate = denom > 0 ? bounces / denom : 0;
  const spamRate = denom > 0 ? complaints / denom : 0;
  const replyRate = denom > 0 ? replies / denom : 0;

  // AC2 — breaches only count with enough sample.
  const breaches: string[] = [];
  if (sends >= t.minSampleForPause) {
    if (bounceRate >= t.bouncePause) breaches.push(`bounce:${(bounceRate * 100).toFixed(1)}%`);
    if (spamRate >= spamThreshold(provider, t)) breaches.push(`spam:${(spamRate * 100).toFixed(2)}%`);
  }

  const status: Health["status"] = breaches.length > 0 ? "breached" : bounceRate >= t.bounceWarn ? "warning" : "healthy";
  return { scope, provider, sends, bounces, complaints, replies, bounceRate, spamRate, replyRate, status, breaches };
}

export interface GuardState {
  scope: string;
  status: "active" | "paused";
  pausedAt?: number;
  pauseReason?: string;
  /** Fraction of full volume currently allowed (ramp-back after resume). */
  rampLevel: number;
}

export function activeState(scope: string): GuardState {
  return { scope, status: "active", rampLevel: 1 };
}

/** AC2 — pause the scope. Idempotent: re-pausing keeps the first pausedAt. */
export function pause(state: GuardState, reason: string, now: number): GuardState {
  if (state.status === "paused") return state;
  return { ...state, status: "paused", pausedAt: now, pauseReason: reason, rampLevel: 0 };
}

/** Should this health breach trigger a pause? (AC2) */
export function shouldPause(health: Health): boolean {
  return health.breaches.length > 0;
}

/**
 * AC4 — resume only after the cool-off AND once rates are back below the safe
 * (warn) thresholds, and then at a reduced ramp level (not full volume).
 */
export function resumeIfRecovered(
  state: GuardState,
  health: Health,
  now: number,
  thresholds: DeliverabilityThresholds = DEFAULT_THRESHOLDS,
): GuardState {
  if (state.status !== "paused") return state;
  const cooledOff = state.pausedAt !== undefined && now - state.pausedAt >= thresholds.coolOffMs;
  const recovered = health.bounceRate < thresholds.bounceWarn && health.spamRate < spamThreshold(health.provider, thresholds);
  if (!cooledOff || !recovered) return state;
  return { scope: state.scope, status: "active", rampLevel: thresholds.resumeRampLevel };
}

/** Grow the ramp level back toward full volume after a recovery. */
export function rampUp(state: GuardState, step = 0.25): GuardState {
  if (state.status !== "active" || state.rampLevel >= 1) return state;
  return { ...state, rampLevel: Math.min(1, state.rampLevel + step) };
}

/** AC3 — addresses to suppress: every hard bounce in the events (pure; caller wires spec-22). */
export function hardBounceAddresses(events: DeliverabilityEvent[]): string[] {
  const seen = new Set<string>();
  for (const e of events) {
    if (e.type === "bounce" && e.hard && e.address) seen.add(e.address.trim().toLowerCase());
  }
  return [...seen];
}
