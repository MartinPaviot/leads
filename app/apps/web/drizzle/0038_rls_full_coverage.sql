-- Full RLS coverage — extends migration 0028 from 4 tables to all
-- 54 tables with tenant_id columns.
--
-- Defense-in-depth: app-layer filtering continues to work; RLS at the
-- DB level catches any query that forgets the WHERE clause.
--
-- The app must SET app.tenant_id = '<uuid>' on each connection before
-- querying. See src/db/rls.ts for the helper.
--
-- Workers (Inngest) must wrap their DB access in `withTenantRLS(tenantId, ...)`
-- or run with a BYPASSRLS role for cross-tenant operations.

-- Helper: enable RLS + force RLS + create tenant-isolation policy
DO $$
DECLARE
  table_name TEXT;
  tables_to_protect TEXT[] := ARRAY[
    'action_outcomes',
    'ae_performance_snapshots',
    'agent_actions',
    'agent_prompt_versions',
    'agent_reactions',
    'agent_tasks',
    'agent_traces',
    'agent_work_items',
    'autonomy_config',
    'chat_memories',
    'chat_threads',
    'coaching_insights',
    'code_executions',
    'comments',
    'connected_mailboxes',
    'content_variants',
    'context_graph_communities',
    'context_graph_edges',
    'context_graph_nodes',
    'custom_signals',
    'custom_skill_templates',
    'distillation_samples',
    'email_optouts',
    'eval_datasets',
    'eval_runs',
    'import_history',
    'inbound_visitors',
    'inbound_write_keys',
    'intelligence_briefs',
    'knowledge_entries',
    'meeting_opt_outs',
    'notes',
    'notification_preferences',
    'notifications',
    'outbound_emails',
    'outreach_playbooks',
    'pending_invites',
    'pipeline_events',
    'prompt_experiment_metrics',
    'referral_credit_events',
    'sending_infra_requests',
    'sequences',
    'shared_prompts',
    'signal_outcomes',
    'system_trust_score',
    'tasks',
    'tenant_referral_credits',
    'tool_call_events',
    'trust_events',
    'users'
  ];
BEGIN
  FOREACH table_name IN ARRAY tables_to_protect
  LOOP
    -- Skip if table doesn't exist (defensive — some tables may be added later)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND information_schema.tables.table_name = table_name
    ) THEN
      RAISE NOTICE 'Skipping % (does not exist)', table_name;
      CONTINUE;
    END IF;

    -- Skip if RLS already enabled (idempotent for re-runs)
    IF EXISTS (
      SELECT 1 FROM pg_class
      WHERE relname = table_name AND relrowsecurity = true
    ) THEN
      RAISE NOTICE 'Skipping % (RLS already enabled)', table_name;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation_%I ON %I USING (tenant_id = current_setting(''app.tenant_id'', true)) WITH CHECK (tenant_id = current_setting(''app.tenant_id'', true))',
      table_name, table_name
    );
    RAISE NOTICE 'Enabled RLS on %', table_name;
  END LOOP;
END $$;

-- Sequences and sequenceSteps share the same tenant via FK to sequences;
-- we still want explicit RLS on sequenceSteps for defense-in-depth.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sequence_steps' AND column_name = 'tenant_id') THEN
    ALTER TABLE sequence_steps ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sequence_steps FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_sequence_steps ON sequence_steps
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'sequence_enrollments' AND column_name = 'tenant_id') THEN
    ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;
    ALTER TABLE sequence_enrollments FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_sequence_enrollments ON sequence_enrollments
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'eval_cases' AND column_name = 'tenant_id') THEN
    ALTER TABLE eval_cases ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eval_cases FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_eval_cases ON eval_cases
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'eval_results' AND column_name = 'tenant_id') THEN
    ALTER TABLE eval_results ENABLE ROW LEVEL SECURITY;
    ALTER TABLE eval_results FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation_eval_results ON eval_results
      USING (tenant_id = current_setting('app.tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
