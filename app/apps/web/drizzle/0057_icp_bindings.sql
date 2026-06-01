-- Multi-ICP Phase 3 bindings (_specs/multi-icp R9). Bind sequences and
-- custom signals to a specific ICP (nullable — null = tenant-wide).
-- ON DELETE SET NULL so deleting an ICP unbinds rather than cascades.
--
-- Additive + idempotent. Hand-crafted (drizzle-kit journal stuck at 0014).

ALTER TABLE sequences ADD COLUMN IF NOT EXISTS icp_id TEXT;
ALTER TABLE custom_signals ADD COLUMN IF NOT EXISTS icp_id TEXT;

-- FKs added separately + guarded so re-runs don't error on an existing
-- constraint.
DO $$ BEGIN
  ALTER TABLE sequences
    ADD CONSTRAINT sequences_icp_id_fkey
    FOREIGN KEY (icp_id) REFERENCES icps(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE custom_signals
    ADD CONSTRAINT custom_signals_icp_id_fkey
    FOREIGN KEY (icp_id) REFERENCES icps(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS sequences_icp_idx ON sequences (icp_id);
CREATE INDEX IF NOT EXISTS custom_signals_icp_idx ON custom_signals (icp_id);
