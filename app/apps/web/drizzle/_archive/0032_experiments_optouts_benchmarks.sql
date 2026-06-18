-- 0032: Prompt experiments, meeting opt-outs, anonymized benchmarks
--
-- Tables needed by:
-- - Prompt A/B testing (lib/prompt-experiments.ts)
-- - Meeting consent opt-out (lib/recording/bot-deployment.ts)
-- - Cross-tenant anonymized benchmarks (lib/anonymized-signals.ts)

-- ── Prompt experiment status enum ─────────────────────────────

DO $$ BEGIN
  CREATE TYPE prompt_experiment_status AS ENUM ('active', 'concluded', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Prompt experiments table ──────────────────────────────────

CREATE TABLE IF NOT EXISTS prompt_experiments (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  base_prompt_hash TEXT NOT NULL,
  variant_delta TEXT NOT NULL,
  traffic_percent INTEGER NOT NULL DEFAULT 10,
  status prompt_experiment_status NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pe_agent_idx ON prompt_experiments (agent_id);
CREATE INDEX IF NOT EXISTS pe_status_idx ON prompt_experiments (status);
CREATE INDEX IF NOT EXISTS pe_agent_status_idx ON prompt_experiments (agent_id, status);

-- ── Prompt experiment metrics table ───────────────────────────

CREATE TABLE IF NOT EXISTS prompt_experiment_metrics (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  experiment_id TEXT NOT NULL REFERENCES prompt_experiments(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  variant TEXT NOT NULL, -- 'base' | 'variant'
  metric TEXT NOT NULL,  -- 'eval_score' | 'approved' | 'rejected'
  value REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pem_experiment_idx ON prompt_experiment_metrics (experiment_id);
CREATE INDEX IF NOT EXISTS pem_experiment_variant_idx ON prompt_experiment_metrics (experiment_id, variant);

-- ── Meeting opt-outs table ────────────────────────────────────

CREATE TABLE IF NOT EXISTS meeting_opt_outs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  activity_id TEXT NOT NULL,
  attendee_email TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS moo_activity_email_idx
  ON meeting_opt_outs (activity_id, attendee_email);

-- ── Anonymized signal benchmarks table ────────────────────────

CREATE TABLE IF NOT EXISTS anonymized_signal_benchmarks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  industry TEXT NOT NULL,
  company_size TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  outcome_rate REAL NOT NULL,
  tenant_count INTEGER NOT NULL,
  total_observations INTEGER NOT NULL DEFAULT 0,
  avg_deal_cycle_days REAL,
  aggregated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS asb_industry_size_idx
  ON anonymized_signal_benchmarks (industry, company_size);
CREATE INDEX IF NOT EXISTS asb_signal_type_idx
  ON anonymized_signal_benchmarks (signal_type);
CREATE UNIQUE INDEX IF NOT EXISTS asb_bucket_key_idx
  ON anonymized_signal_benchmarks (industry, company_size, signal_type);
