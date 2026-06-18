-- INBOX-P05 — STRICT tenant isolation for the inbox-read tables.
--
-- ╔════════════════════════════════════════════════════════════════════════╗
-- ║  DO NOT APPLY until BOTH are true, verified in staging:                 ║
-- ║   1. INBOX_RLS_TX=1 is set (lib/inbox/load.ts then runs every inbox     ║
-- ║      read inside withTenantTx, so app.tenant_id is bound), AND          ║
-- ║   2. a shadow-mode soak shows zero unintended row drops.                ║
-- ║  Applying this WITHOUT (1) makes inbox reads return ZERO rows (no       ║
-- ║  context → the strict policy denies) — an inbox outage. This is the     ║
-- ║  org-wide R-08b follow-up; apply via the custom runner, never           ║
-- ║  db:migrate (the journal is disabled).                                  ║
-- ╚════════════════════════════════════════════════════════════════════════╝
--
-- Drops 0074's fallback-allow clause for the four inbox-read tables only, so an
-- unscoped read returns nothing AT THE DATABASE. NULL tenant_id (global) rows
-- stay visible. Other tables keep 0074's permissive fallback.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['activities','outbound_emails','inbox_triage','contacts']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation_%I ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON public.%I AS PERMISSIVE FOR ALL TO public
         USING (tenant_id IS NULL
                OR tenant_id = current_setting(''app.tenant_id'', true))
         WITH CHECK (tenant_id IS NULL
                OR tenant_id = current_setting(''app.tenant_id'', true))',
      t, t);
    RAISE NOTICE 'STRICT RLS on %', t;
  END LOOP;
END $$;
