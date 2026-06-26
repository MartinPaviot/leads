-- LINKEDIN-INBOUND — enum values for capturing inbound LinkedIn messages.
-- Additive + idempotent. ALTER TYPE ... ADD VALUE can't run inside a txn, so
-- apply each on its own (db:push on localdev; DATABASE_URL_OWNER on prod —
-- the drizzle journal is frozen at idx 14, so this is not journaled).

ALTER TYPE "channel" ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE "activity_type" ADD VALUE IF NOT EXISTS 'linkedin_message_received';
