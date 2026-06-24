-- Spec 27 — deliverability guard state. One row per scope (a tenant's sending
-- health for the first slice; scope is forward-compatible with per-domain).
-- Absent row = active (no-op), so a healthy tenant is never blocked. The conductor
-- (lib/sequence/db-conductor.ts isGuardTripped) and any send path read this.
CREATE TABLE IF NOT EXISTS deliverability_guard_state (
  scope        text PRIMARY KEY,
  tenant_id    text REFERENCES tenants(id),
  status       text NOT NULL DEFAULT 'active',
  paused_at    timestamptz,
  pause_reason text,
  ramp_level   real NOT NULL DEFAULT 1,
  updated_at   timestamptz DEFAULT now()
);

-- Tenant isolation, mirroring the other tenant tables.
ALTER TABLE deliverability_guard_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_deliverability_guard_state ON deliverability_guard_state;
CREATE POLICY tenant_isolation_deliverability_guard_state ON deliverability_guard_state
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
