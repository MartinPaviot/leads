/**
 * Spec 36 (T5) — LinkedIn sending-identity capacity. The spec-21 `verifyAuth` +
 * `getSendableCapacity` analog, which does NOT exist for LinkedIn (spec 21 is
 * email-only). Pure: capacity is a function of the account's connection status,
 * its caps, the warmup ramp, and the day's actions so far. Fail-closed — any
 * account that is not `connected` reports 0 (mirrors capacity.ts:92).
 *
 * The ramp is LinkedIn-safe (not the email 2→50 curve): connects start ≤5/day
 * and reach the steady cap (limits.ts default 20) over ~2 weeks; messages ramp
 * 20→100. Unipile does NOT enforce caps — this is the only thing standing
 * between us and a LinkedIn restriction.
 */

import type { LinkedInActionType } from "./port";

/** The seat states; only `connected` is sendable. */
export type LinkedInAccountStatus =
  | "pending"
  | "connected"
  | "reconnect_required"
  | "checkpoint"
  | "disabled";

export interface LinkedInSendingAccount {
  id: string;
  status: LinkedInAccountStatus;
  /** Steady-state daily caps once warmed (linkedin_account.daily_cap_*). */
  dailyCapConnect: number;
  dailyCapMessage: number;
  /** null = not ramping (fully warmed or pre-launch). */
  warmupStartedAt: Date | null;
}

export interface LinkedInActionsToday {
  connect: number;
  message: number;
}

/**
 * Per-day warmup targets, capped by the steady cap. Connects are the scarce,
 * ban-sensitive action — start at 5. Messages (to existing relations) ramp
 * faster. Index = whole days since warmup start; past the array = steady.
 */
const WARMUP_RAMP: Record<LinkedInActionType, number[]> = {
  connect: [5, 5, 5, 8, 8, 10, 10, 12, 12, 15, 15, 18, 18, 20],
  message: [20, 20, 30, 30, 40, 50, 60, 70, 80, 90, 100],
};

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days since warmup began; negative if scheduled in the future. */
export function daysIntoWarmup(warmupStartedAt: Date, now: number): number {
  return Math.floor((now - warmupStartedAt.getTime()) / MS_PER_DAY);
}

export function isWarming(account: LinkedInSendingAccount, now: number): boolean {
  if (!account.warmupStartedAt) return false;
  return daysIntoWarmup(account.warmupStartedAt, now) < WARMUP_RAMP.connect.length;
}

function steadyCap(account: LinkedInSendingAccount, action: LinkedInActionType): number {
  return action === "connect" ? account.dailyCapConnect : account.dailyCapMessage;
}

/**
 * The cap that applies today for `action`: the warmup ramp while warming (never
 * above the steady cap), else the steady cap. A not-yet-started warmup
 * (warmupStartedAt in the future) yields 0.
 */
export function effectiveDailyCap(
  account: LinkedInSendingAccount,
  action: LinkedInActionType,
  now: number,
): number {
  const steady = steadyCap(account, action);
  if (!account.warmupStartedAt) return steady;
  const day = daysIntoWarmup(account.warmupStartedAt, now);
  if (day < 0) return 0;
  const ramp = WARMUP_RAMP[action];
  const rampValue = day >= ramp.length ? steady : ramp[day];
  return Math.min(rampValue, steady);
}

export interface LinkedInActionCapacity {
  effectiveCap: number;
  sentToday: number;
  /** Remaining actions today: 0 unless the account is connected. */
  available: number;
}

export interface LinkedInCapacityReport {
  accountId: string;
  status: LinkedInAccountStatus;
  /** True only when status === "connected". */
  sendable: boolean;
  warming: boolean;
  connect: LinkedInActionCapacity;
  message: LinkedInActionCapacity;
}

/**
 * Sendable capacity for the day. A non-connected account reports 0 on every
 * action (fail-closed); otherwise `max(0, effectiveCap - sentToday)` per action.
 */
export function getLinkedInSendableCapacity(
  account: LinkedInSendingAccount,
  actionsToday: LinkedInActionsToday,
  now: number = Date.now(),
): LinkedInCapacityReport {
  const sendable = account.status === "connected";
  const per = (action: LinkedInActionType, sent: number): LinkedInActionCapacity => {
    const effectiveCap = sendable ? effectiveDailyCap(account, action, now) : 0;
    return { effectiveCap, sentToday: sent, available: sendable ? Math.max(0, effectiveCap - sent) : 0 };
  };
  return {
    accountId: account.id,
    status: account.status,
    sendable,
    warming: sendable && isWarming(account, now),
    connect: per("connect", actionsToday.connect),
    message: per("message", actionsToday.message),
  };
}

/** Convenience: can the account take one more `action` right now? */
export function canActLinkedIn(
  account: LinkedInSendingAccount,
  action: LinkedInActionType,
  actionsToday: LinkedInActionsToday,
  now: number = Date.now(),
): boolean {
  const report = getLinkedInSendableCapacity(account, actionsToday, now);
  return (action === "connect" ? report.connect : report.message).available > 0;
}
