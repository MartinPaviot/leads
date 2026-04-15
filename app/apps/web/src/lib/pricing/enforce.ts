/**
 * Guarded wrappers around resource-consuming operations.
 *
 * Each wrapper runs the relevant quota assertion before performing the action.
 * Wrappers throw `QuotaExceededError` — route handlers convert via
 * `withQuotaErrorHandling` or `quotaExceededResponse` in lib/pricing/http.ts.
 *
 * Enforcement is gated by `PRICING_V2_ENFORCEMENT=on`. When the flag is off
 * (default), the assertions no-op but usage tracking still runs, so we can
 * observe live quota pressure before flipping the switch.
 */

import { assertMetered, assertResource, QuotaExceededError } from "./quota";
import { trackUsage } from "@/lib/billing";

function enforcementEnabled(): boolean {
  return process.env.PRICING_V2_ENFORCEMENT === "on";
}

/**
 * Check that a tenant can create one more contact before calling an insert.
 * Throws QuotaExceededError if at limit (and enforcement is on).
 */
export async function assertContactsHeadroom(
  tenantId: string,
  addingCount = 1
): Promise<void> {
  if (!enforcementEnabled()) return;
  await assertResource(tenantId, "contacts", { addingCount });
}

/**
 * Pre-flight for a single outbound email send. Throws at limit.
 * Usage tracking is the caller's responsibility — call `trackUsage(tenantId,
 * "email_sent")` after `resend.emails.send()` resolves.
 */
export async function assertEmailsHeadroom(tenantId: string): Promise<void> {
  if (!enforcementEnabled()) return;
  await assertMetered(tenantId, "emails");
}

/** Pre-flight for a single AI chat query. Throws at limit. */
export async function assertAiQueryHeadroom(tenantId: string): Promise<void> {
  if (!enforcementEnabled()) return;
  await assertMetered(tenantId, "ai_queries");
}

/**
 * End-to-end email send guard:
 *   1. assert headroom (if enforcement is on)
 *   2. run the provided send function
 *   3. track the usage event on success
 *
 * On QuotaExceededError, the caller (inngest worker) is expected to mark the
 * outbound email row as `status='quota_blocked'` and refuse to retry.
 */
export async function guardedSendEmail<T>(
  tenantId: string,
  send: () => Promise<T>
): Promise<T> {
  await assertEmailsHeadroom(tenantId);
  const result = await send();
  // Track regardless of flag — accurate usage numbers are useful for the banner
  // (and for the "should we flip the flag yet" decision) even before we block.
  await trackUsage(tenantId, "email_sent", 1).catch((e) => {
    console.warn("trackUsage(email_sent) failed", e);
  });
  return result;
}

/**
 * End-to-end single contact insert guard. Returns the inserted row(s) from
 * the provided insert function.
 *
 * Usage pattern:
 *   await guardedInsertContact(tenantId, () =>
 *     db.insert(contacts).values(row).returning()
 *   );
 *
 * The wrapper is deliberately minimal: callers handle their own insert
 * builder (tx scoping, returning columns, onConflict, etc.) so we don't
 * reinvent Drizzle's API surface.
 */
export async function guardedInsertContact<T>(
  tenantId: string,
  insert: () => Promise<T>
): Promise<T> {
  await assertContactsHeadroom(tenantId, 1);
  return insert();
}

/**
 * Batch-insert guard for imports. Pass the batch size so the quota check
 * reflects the whole batch; we reject atomically rather than letting the
 * caller insert up to the limit and then error on the overflow.
 */
export async function guardedInsertContacts<T>(
  tenantId: string,
  batchSize: number,
  insert: () => Promise<T>
): Promise<T> {
  await assertContactsHeadroom(tenantId, batchSize);
  return insert();
}

export { QuotaExceededError };
