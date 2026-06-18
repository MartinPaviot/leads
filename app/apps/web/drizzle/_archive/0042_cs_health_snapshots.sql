-- Sprint-2 audit follow-up — CS health snapshots.
-- Idempotent.

CREATE TABLE IF NOT EXISTS account_health_snapshots (
  id                       text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id                text NOT NULL,
  account_id               text NOT NULL,
  health_score             integer NOT NULL,
  components               jsonb NOT NULL,
  risk_level               text NOT NULL,
  suggested_action         text,
  suggested_action_reason  text,
  arr_exposure_usd         double precision,
  computed_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_health_tenant_idx       ON account_health_snapshots (tenant_id);
CREATE INDEX IF NOT EXISTS account_health_account_idx      ON account_health_snapshots (account_id);
CREATE INDEX IF NOT EXISTS account_health_computed_at_idx  ON account_health_snapshots (computed_at);
CREATE UNIQUE INDEX IF NOT EXISTS account_health_account_day_idx
  ON account_health_snapshots (account_id, computed_at);
