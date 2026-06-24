-- Security backfill — enable row-level security + the standard tenant-isolation
-- policy on tenant-scoped tables that were created WITHOUT RLS (a cross-tenant
-- leak risk). The policy is permissive when app.tenant_id is unset (NULL → all
-- rows), so this is additive: code paths that don't set the GUC are unchanged.
--
-- OWNERSHIP SPLIT (only a table's owner can ALTER/ENABLE RLS on it):
--  * postgres-owned (4): run as the postgres owner role. The app connects as
--    elevay_app (a NON-owner here), so RLS applies without FORCE.
--  * elevay_app-owned (8): run as elevay_app. Since the app role OWNS these,
--    RLS would be BYPASSED for the owner — so FORCE ROW LEVEL SECURITY is required
--    for the isolation to actually take effect against the app.
-- Applied to prod in two role-scoped passes; this file records the full intent.

-- ── postgres-owned: ENABLE + policy ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['account_field_source','call_lists','contact_field_source','personalization_calibration'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL '
      'USING ((NULLIF(current_setting(''app.tenant_id'', true), '''') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting(''app.tenant_id'', true))) '
      'WITH CHECK ((NULLIF(current_setting(''app.tenant_id'', true), '''') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting(''app.tenant_id'', true)))',
      'tenant_isolation_' || t, t);
  END LOOP;
END $$;

-- ── elevay_app-owned: ENABLE + FORCE + policy ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['agent_run','approval_gate','credit_ledger','icp_versions','inbox_presence','segments','workflow_runs','workspace_budgets'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'tenant_isolation_' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL '
      'USING ((NULLIF(current_setting(''app.tenant_id'', true), '''') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting(''app.tenant_id'', true))) '
      'WITH CHECK ((NULLIF(current_setting(''app.tenant_id'', true), '''') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting(''app.tenant_id'', true)))',
      'tenant_isolation_' || t, t);
  END LOOP;
END $$;
