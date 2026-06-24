-- Spec 29/32 — persisted daily rollup snapshots. One row per (tenant, dimension,
-- scope_key, day) holding the finalized Metrics jsonb. Written by the daily-rollup
-- cron; gives queryable history for trends + feeds spec-32 regression-alerts.
CREATE TABLE IF NOT EXISTS metric_rollup_snapshot (
  id         text PRIMARY KEY,
  tenant_id  text REFERENCES tenants(id),
  dimension  text NOT NULL,
  scope_key  text NOT NULL,
  day        date NOT NULL,
  metrics    jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS rollup_snapshot_scope_day_idx ON metric_rollup_snapshot (tenant_id, dimension, scope_key, day);
CREATE INDEX IF NOT EXISTS rollup_snapshot_tenant_day_idx ON metric_rollup_snapshot (tenant_id, day);

ALTER TABLE metric_rollup_snapshot ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_metric_rollup_snapshot ON metric_rollup_snapshot;
CREATE POLICY tenant_isolation_metric_rollup_snapshot ON metric_rollup_snapshot
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
