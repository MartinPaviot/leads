/**
 * WS-1 → WS-2 bridge: convert earned referral credits into real Stripe
 * customer balance (which applies as a discount on the referring tenant's
 * next invoice).
 *
 * Shape of a credit flow:
 *   1. channel.ts#attributeSignupFromExposure inserts a `credit_granted`
 *      referral_credit_events row with amount_cents > 0.
 *   2. channel.ts calls pushCreditToStripe(tenantId, eventId, amountCents).
 *   3. If the tenant has a Stripe customer (they've been through checkout at
 *      least once): we call customers.createBalanceTransaction with a
 *      negative amount and store the returned transaction id on the ledger
 *      row. Stripe's own idempotency guarantees + our column-level unique
 *      partial index (migration 0019) prevent double-crediting on replay.
 *   4. If the tenant has no Stripe customer yet (trial-only, never checked
 *      out): leave stripeBalanceTxnId null. backfillPendingCredits runs from
 *      the checkout route after customer creation and picks up every row
 *      that's still null for that tenant.
 *
 * Stripe API notes (verified against /stripe/stripe-node v19.1.0):
 *   - `amount` is in cents, NEGATIVE for a credit (reduces the customer
 *     balance — Stripe applies the reduction against the next invoice).
 *   - `currency` must be the customer's default currency; we default to
 *     "usd" since our ICP is US startups. Revisit when we take EUR customers.
 *   - Idempotency: camelCase `idempotencyKey` is the v11+ spelling; older
 *     `idempotency_key` was removed. Pass as the last request-options arg.
 */

import Stripe from "stripe";
import { db } from "@/db";
import { referralCreditEvents } from "@/db/schema";
import { subscriptions } from "@/db/billing-schema";
import { and, eq, isNull, gt } from "drizzle-orm";
import { stripe } from "@/lib/stripe";

const DEFAULT_CURRENCY = "usd";

export interface PushCreditResult {
  status: "pushed" | "pending" | "already_pushed" | "skipped";
  reason?: string;
  stripeBalanceTxnId?: string;
}

/**
 * Push a single referral credit event to the referring tenant's Stripe
 * customer balance. Idempotent at two levels:
 *   - DB: if the row already has stripe_balance_txn_id set, we no-op.
 *   - Stripe: idempotencyKey prevents a duplicate balance transaction
 *     even if we retry after a partial failure.
 *
 * Non-throwing: callers (signup path, backfill) shouldn't fail when Stripe
 * is down. Returns a structured result the caller can log.
 */
export async function pushCreditToStripe(
  tenantId: string,
  eventId: string,
  amountCents: number,
  opts: {
    /** Injected Stripe client for tests; defaults to the module singleton. */
    stripeClient?: Stripe | null;
    /** Override for tests. */
    currency?: string;
    /** Human-friendly description that lands on the customer's invoice. */
    description?: string;
  } = {}
): Promise<PushCreditResult> {
  const client = opts.stripeClient ?? stripe;
  if (!client) {
    return { status: "skipped", reason: "stripe_not_configured" };
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    return { status: "skipped", reason: "non_positive_amount" };
  }

  // Fast-path: don't re-push a row that already has a Stripe txn on it.
  const [existing] = await db
    .select({ stripeBalanceTxnId: referralCreditEvents.stripeBalanceTxnId })
    .from(referralCreditEvents)
    .where(eq(referralCreditEvents.id, eventId))
    .limit(1);
  if (!existing) {
    return { status: "skipped", reason: "event_not_found" };
  }
  if (existing.stripeBalanceTxnId) {
    return {
      status: "already_pushed",
      stripeBalanceTxnId: existing.stripeBalanceTxnId,
    };
  }

  // Look up the referring tenant's Stripe customer.
  const [sub] = await db
    .select({ stripeCustomerId: subscriptions.stripeCustomerId })
    .from(subscriptions)
    .where(eq(subscriptions.tenantId, tenantId))
    .limit(1);

  if (!sub?.stripeCustomerId) {
    // No customer yet — leave stripeBalanceTxnId null. backfillPendingCredits
    // will retry once they go through checkout.
    return { status: "pending", reason: "no_stripe_customer" };
  }

  let txn: Stripe.CustomerBalanceTransaction;
  try {
    txn = await client.customers.createBalanceTransaction(
      sub.stripeCustomerId,
      {
        amount: -Math.floor(amountCents), // negative = credit
        currency: opts.currency ?? DEFAULT_CURRENCY,
        description: opts.description ?? "Elevay referral credit",
        metadata: {
          tenantId,
          creditEventId: eventId,
          source: "ws2_referral_credit",
        },
      },
      { idempotencyKey: `referral_credit:${eventId}` }
    );
  } catch (err) {
    console.warn(
      "pushCreditToStripe: Stripe call failed, leaving event pending for backfill",
      { eventId, tenantId, err: err instanceof Error ? err.message : String(err) }
    );
    return { status: "pending", reason: "stripe_error" };
  }

  // Record the Stripe txn id on the event so future calls short-circuit.
  // If another concurrent push already set this column with the same txn,
  // the unique partial index will reject the write — treat that as success.
  try {
    await db
      .update(referralCreditEvents)
      .set({ stripeBalanceTxnId: txn.id })
      .where(
        and(
          eq(referralCreditEvents.id, eventId),
          isNull(referralCreditEvents.stripeBalanceTxnId)
        )
      );
  } catch (err) {
    // Unique violation means somebody else won the race with the same txn id
    // (idempotencyKey guaranteed they got the same txn). Nothing to do.
    const msg = err instanceof Error ? err.message : String(err);
    if (!/unique|duplicate/i.test(msg)) throw err;
  }

  return { status: "pushed", stripeBalanceTxnId: txn.id };
}

/**
 * Replay every unpushed credit_granted event for a tenant. Called from the
 * checkout route immediately after stripe.customers.create so credits earned
 * while the tenant was still on trial finally reach Stripe.
 *
 * Non-throwing for the same reason as pushCreditToStripe — checkout must not
 * fail because a backfill hiccuped.
 */
export async function backfillPendingCredits(
  tenantId: string,
  opts: { stripeClient?: Stripe | null } = {}
): Promise<{ attempted: number; pushed: number; pending: number; errors: number }> {
  const rows = await db
    .select({
      id: referralCreditEvents.id,
      amountCents: referralCreditEvents.amountCents,
    })
    .from(referralCreditEvents)
    .where(
      and(
        eq(referralCreditEvents.tenantId, tenantId),
        eq(referralCreditEvents.eventType, "credit_granted"),
        isNull(referralCreditEvents.stripeBalanceTxnId),
        gt(referralCreditEvents.amountCents, 0)
      )
    );

  let pushed = 0;
  let pending = 0;
  let errors = 0;
  for (const row of rows) {
    try {
      const r = await pushCreditToStripe(tenantId, row.id, row.amountCents, {
        stripeClient: opts.stripeClient,
      });
      if (r.status === "pushed" || r.status === "already_pushed") pushed++;
      else if (r.status === "pending") pending++;
      else errors++;
    } catch (err) {
      console.warn("backfillPendingCredits: event push failed", {
        eventId: row.id,
        err: err instanceof Error ? err.message : String(err),
      });
      errors++;
    }
  }

  return { attempted: rows.length, pushed, pending, errors };
}
