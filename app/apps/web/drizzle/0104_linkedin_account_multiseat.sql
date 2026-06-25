-- Spec 36 multi-seat (P1) — drop the user_id FK (auth-space id, not the app
-- users table) and add the per-member send-lookup index + the one-connected-
-- seat-per-member partial unique. Idempotent; applied localdev then prod via
-- DATABASE_URL_OWNER.

ALTER TABLE "linkedin_account" DROP CONSTRAINT IF EXISTS "linkedin_account_user_id_fkey";
ALTER TABLE "linkedin_account" DROP CONSTRAINT IF EXISTS "linkedin_account_user_id_users_id_fk";

CREATE INDEX IF NOT EXISTS "linkedin_account_tenant_user_idx" ON "linkedin_account" ("tenant_id", "user_id");

CREATE UNIQUE INDEX IF NOT EXISTS "linkedin_account_one_connected_per_user"
  ON "linkedin_account" ("tenant_id", "user_id")
  WHERE "status" = 'connected';
