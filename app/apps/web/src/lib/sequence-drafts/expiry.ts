/**
 * Pure helpers for the draft-expiry cron (P0-1 task 1.5).
 *
 * Resolves the per-tenant expiry threshold (configurable via
 * `tenants.settings.draftExpiryHours`, default 72h) and produces the
 * cutoff timestamp the cron uses to mark stale `pending_approval`
 * drafts as `expired`.
 *
 * Why a separate module : the Inngest fn is a thin wrapper around a
 * pure decider, so the policy is unit-testable without a DB and the
 * cron itself stays small.
 */

const DEFAULT_EXPIRY_HOURS = 72;
const MIN_EXPIRY_HOURS = 1;
const MAX_EXPIRY_HOURS = 24 * 30; // 30 days hard cap so a misconfigured
//                                    tenant doesn't park drafts forever.

/**
 * Resolve the per-tenant expiry hours. Reads
 * `settings.draftExpiryHours` and clamps. Falls back to 72h when
 * absent, non-numeric, or out of bounds.
 */
export function resolveExpiryHours(
  settings: Record<string, unknown> | null | undefined,
): number {
  if (!settings || typeof settings !== "object") return DEFAULT_EXPIRY_HOURS;
  const raw = (settings as Record<string, unknown>).draftExpiryHours;
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return DEFAULT_EXPIRY_HOURS;
  }
  if (raw < MIN_EXPIRY_HOURS) return MIN_EXPIRY_HOURS;
  if (raw > MAX_EXPIRY_HOURS) return MAX_EXPIRY_HOURS;
  return Math.floor(raw);
}

/**
 * Compute the "older than this and we expire it" cutoff. The cron
 * passes `now = new Date()` and expires drafts with `generatedAt <
 * cutoff`.
 */
export function expiryCutoff(now: Date, hours: number): Date {
  return new Date(now.getTime() - hours * 60 * 60 * 1000);
}

/**
 * Decide whether a single draft should be expired. Used both by the
 * cron and by the test harness — a draft expires iff its
 * `generatedAt` is strictly older than the tenant's cutoff.
 */
export function shouldExpire(
  draft: { generatedAt: Date | string; status: string },
  cutoff: Date,
): boolean {
  if (draft.status !== "pending_approval") return false;
  const generated =
    draft.generatedAt instanceof Date
      ? draft.generatedAt
      : new Date(draft.generatedAt);
  if (Number.isNaN(generated.getTime())) return false;
  return generated.getTime() < cutoff.getTime();
}
