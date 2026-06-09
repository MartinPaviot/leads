-- ICPs become soft-deletable (was a hard DELETE that cascaded away criteria +
-- fit rows irreversibly). A deleted ICP keeps its row + criteria so it stays
-- restorable via /api/icps/restore; reads filter on deleted_at IS NULL, and the
-- delete drops its company_icp_fit cells (rebuilt by the recompute on restore).
-- Idempotent.
ALTER TABLE "icps" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
