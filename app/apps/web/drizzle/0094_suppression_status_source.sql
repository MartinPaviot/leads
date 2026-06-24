-- Spec 35 — suppression lifecycle + provenance (additive + idempotent) on the
-- spec-22 `suppression` table. `status` enables admin deactivation of reversible
-- entries (manual_dnc / existing_customer / hard_bounce) while keeping the row +
-- history; opt_out/complaint are frozen by the 0095 trigger. `source`/created_by/
-- deactivated_* are the actor trail (full history is the signed audit log).
-- `level` gains 'account' and `type` gains 'complaint' — both free text, no enum.
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS source text;
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS deactivated_at timestamptz;
ALTER TABLE suppression ADD COLUMN IF NOT EXISTS deactivated_by text;

CREATE INDEX IF NOT EXISTS suppression_status_idx ON suppression (tenant_id, status);
