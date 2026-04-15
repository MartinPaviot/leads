-- WS-2 T8: link referral_credit_events to the Stripe balance transaction that
-- applied the credit. Populated by lib/pricing/credits.ts after a successful
-- customers.createBalanceTransaction. A non-null value means "already pushed
-- to Stripe"; the credits.ts fast path reads this before making any Stripe
-- call, so DB-level replays don't double-credit.
--
-- Unique partial index: each Stripe balance txn id appears at most once in
-- our ledger (null allowed for the pending / pre-push rows).
ALTER TABLE "referral_credit_events"
  ADD COLUMN "stripe_balance_txn_id" text;

CREATE UNIQUE INDEX "referral_credit_events_stripe_txn_uniq"
  ON "referral_credit_events"("stripe_balance_txn_id")
  WHERE "stripe_balance_txn_id" IS NOT NULL;
