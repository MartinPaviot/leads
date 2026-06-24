-- Spec 35 — reversible targeting state on companies (account targeting).
-- Additive + idempotent. Distinct from suppression (irreversible consent):
-- targeting moves with the ICP and is reversible. Default 'unreviewed'; the
-- SAFE_MODE send gate (lib/guardrails/sending-gate.ts) treats only 'targeted'
-- accounts as eligible for autonomous outbound. Existing rows get 'unreviewed'
-- here; the T0 backfill (scripts/backfill-targeting-and-dnc.ts) promotes today's
-- contactable accounts to 'targeted' so SAFE_MODE-on does not change behavior.
DO $$ BEGIN
  CREATE TYPE targeting_status AS ENUM ('unreviewed', 'targeted', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS targeting_status targeting_status NOT NULL DEFAULT 'unreviewed';

CREATE INDEX IF NOT EXISTS companies_targeting_status_idx
  ON companies (tenant_id, targeting_status);
