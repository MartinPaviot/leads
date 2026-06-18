-- FINDING-007: Row-Level Security policies for multi-tenant isolation.
-- Defense-in-depth — app-layer tenantId filtering continues to work;
-- RLS is a backup that prevents cross-tenant data leaks if a query
-- forgets the WHERE clause.
--
-- The app must SET app.tenant_id = '<uuid>' on each connection before
-- querying. See src/db/rls.ts for the helper.

-- ── contacts ──────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

-- Allow the migration/admin role to bypass RLS (superuser already bypasses,
-- but explicit is better for non-superuser deploy roles).
ALTER TABLE contacts FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_contacts ON contacts
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── companies ─────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_companies ON companies
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── deals ─────────────────────────────────────────────────
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_deals ON deals
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── activities ────────────────────────────────────────────
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_activities ON activities
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

-- ── Bypass policy for the app service role ────────────────
-- If the app connects as a dedicated role (e.g. "elevay_app"), grant it
-- bypass so it can still run cross-tenant admin queries (migrations,
-- cron jobs, etc.) when app.tenant_id is not set. The `true` second
-- argument to current_setting makes it return NULL instead of erroring
-- when the variable is unset, so the USING clause simply filters out
-- all rows rather than crashing — safe default.
--
-- To create a bypass role for admin/migration scripts:
--   CREATE ROLE elevay_admin BYPASSRLS;
--   GRANT elevay_admin TO your_deploy_user;
