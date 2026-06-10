-- SOC2 R-08b — tenant-isolation RLS, fallback form, on every public table
-- carrying a tenant_id column.
--
-- Design (deliberately different from the never-applied 0038):
--   * NO FORCE: the table owner (postgres = admin/migration path) stays
--     exempt; the app connects as `elevay_app` (non-owner, NOBYPASSRLS)
--     and IS subject to the policies.
--   * FALLBACK predicate: when no tenant context is set
--     (current_setting('app.tenant_id') NULL or ''), the policy allows
--     everything — identical to today's behaviour, so the 49 Inngest
--     workers and the routes that don't set a context keep working.
--     When a context IS set (withTenantTx — SET LOCAL inside a
--     transaction, the only form that survives the Supavisor
--     transaction pooler), isolation is enforced by the database.
--   * `tenant_id IS NULL` rows (global/system rows) stay visible.
--
-- Strict mode (drop the fallback) becomes possible once every read path
-- runs under withTenantTx — tracked as the R-08b follow-up.
DO $$
DECLARE t RECORD;
BEGIN
  FOR t IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables tb
      ON tb.table_name = c.table_name
     AND tb.table_schema = 'public'
     AND tb.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON public.%I', t.table_name, t.table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON public.%I AS PERMISSIVE FOR ALL TO public
         USING (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NULL
                OR tenant_id IS NULL
                OR tenant_id = current_setting(''app.tenant_id'', true))
         WITH CHECK (NULLIF(current_setting(''app.tenant_id'', true), '''') IS NULL
                OR tenant_id IS NULL
                OR tenant_id = current_setting(''app.tenant_id'', true))',
      t.table_name, t.table_name);
    RAISE NOTICE 'RLS enabled on %', t.table_name;
  END LOOP;
END $$;
