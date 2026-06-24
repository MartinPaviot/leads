-- Spec 32 — regression-alert state. One row per `${scope}:${metric}` so a firing
-- regression alerts once (dedup) and resolves when it recovers. Written by the
-- daily-rollup cron's regression pass over the snapshot history.
CREATE TABLE IF NOT EXISTS regression_alert (
  key        text PRIMARY KEY,
  tenant_id  text REFERENCES tenants(id),
  scope      text NOT NULL,
  metric     text NOT NULL,
  alert      jsonb NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regression_alert_tenant_active_idx ON regression_alert (tenant_id, active);

ALTER TABLE regression_alert ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_regression_alert ON regression_alert;
CREATE POLICY tenant_isolation_regression_alert ON regression_alert
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
