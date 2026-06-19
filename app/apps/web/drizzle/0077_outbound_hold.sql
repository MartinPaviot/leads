-- CLE-11: outbound undo window (de-facto unsend). Adds two lifecycle states
-- and a hold-until clock to outbound_emails so a send placed on a cancellable
-- hold can be released (held -> queued) by the cron once its window elapses, or
-- canceled (held -> canceled) by an undo within the window.
--
-- Backwards-safe: no existing row is touched, and the default behaviour
-- (outboundUndoWindowSeconds = 0) never produces a 'held' row — every send
-- still goes straight to 'queued'. Additive + idempotent (IF NOT EXISTS
-- everywhere) so the custom runner (scripts/apply-migrations.ts) re-applies
-- safely.
--
-- NOTE on ALTER TYPE ... ADD VALUE inside a transaction: PostgreSQL 12+ allows
-- adding an enum value inside a transaction block as long as the new value is
-- not USED in the same transaction. This migration only ADDs the values (it
-- never inserts a 'held'/'canceled' row), so it is safe under the runner's
-- per-file transaction. If applied against PostgreSQL < 12, split these two
-- ALTER TYPE statements out and run them outside a transaction.

ALTER TYPE "outbound_status" ADD VALUE IF NOT EXISTS 'held';
ALTER TYPE "outbound_status" ADD VALUE IF NOT EXISTS 'canceled';

ALTER TABLE "outbound_emails" ADD COLUMN IF NOT EXISTS "hold_until" timestamptz;

CREATE INDEX IF NOT EXISTS "outbound_hold_idx" ON "outbound_emails" ("status", "hold_until");
