-- 0031: Distillation pipeline + prompt canary deployment
--
-- 1. distillation_samples: high-quality (input, output) pairs from production
--    agent runs, anonymized and ready for future fine-tuning.
-- 2. canary_percent on agent_prompt_versions: enables gradual prompt rollouts
--    via consistent hashing on tenant ID.

-- ── Distillation samples table ────────────────────────────────

CREATE TABLE IF NOT EXISTS distillation_samples (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_id TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  user_input TEXT NOT NULL,
  assistant_output TEXT NOT NULL,
  tool_calls JSONB NOT NULL DEFAULT '[]',
  quality_source TEXT NOT NULL, -- 'user_approved' | 'eval_high_score' | 'explicit_feedback'
  quality_score REAL NOT NULL,
  tenant_id TEXT REFERENCES tenants(id),
  trace_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ds_agent_idx ON distillation_samples (agent_id);
CREATE INDEX IF NOT EXISTS ds_quality_source_idx ON distillation_samples (quality_source);
CREATE INDEX IF NOT EXISTS ds_quality_score_idx ON distillation_samples (quality_score);
CREATE INDEX IF NOT EXISTS ds_created_idx ON distillation_samples (created_at);

-- ── Canary percent column on agent_prompt_versions ────────────

ALTER TABLE agent_prompt_versions
  ADD COLUMN IF NOT EXISTS canary_percent INTEGER NOT NULL DEFAULT 0;
