-- (B) Sequences are personal: their outbound sends go from the creator's
-- connected mailbox. Owner = auth-user id (= connected_mailboxes.user_id).
-- No backfill: legacy / agent-created sequences keep created_by NULL and fall
-- back to the tenant sending pool. Idempotent.
ALTER TABLE "sequences" ADD COLUMN IF NOT EXISTS "created_by" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sequences_created_by_idx" ON "sequences" USING btree ("created_by");
