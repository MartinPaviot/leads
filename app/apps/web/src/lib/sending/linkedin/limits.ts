/**
 * Spec 24 (AC2) — per-sender-account daily LinkedIn action limits. Conservative
 * defaults keep motions within platform-safe rates; connects are far scarcer
 * than messages. Pure.
 */

import type { LinkedInActionType } from "./port";

export interface LinkedInDailyLimits {
  connect: number;
  message: number;
}

/** Platform-safe defaults: ~20 connects/day, ~100 messages/day per sender account. */
export const DEFAULT_LINKEDIN_DAILY_LIMITS: LinkedInDailyLimits = { connect: 20, message: 100 };

/** Remaining actions of `action` today for a sender account. */
export function remainingActions(
  action: LinkedInActionType,
  doneToday: number,
  limits: LinkedInDailyLimits = DEFAULT_LINKEDIN_DAILY_LIMITS,
): number {
  return Math.max(0, limits[action] - Math.max(0, doneToday));
}

/** Whether one more `action` is within the daily limit. */
export function withinDailyLimit(
  action: LinkedInActionType,
  doneToday: number,
  limits: LinkedInDailyLimits = DEFAULT_LINKEDIN_DAILY_LIMITS,
): boolean {
  return remainingActions(action, doneToday, limits) > 0;
}
