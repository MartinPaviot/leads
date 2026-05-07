-- Sprint-1 audit follow-up — LLM observability tables.
-- Idempotent.

CREATE TABLE IF NOT EXISTS llm_calls (
  id                  text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  tenant_id           text,
  surface_id          text NOT NULL,
  prompt_id           text NOT NULL,
  model               text NOT NULL,
  fallback_triggered  boolean NOT NULL DEFAULT false,
  attempts            integer NOT NULL DEFAULT 1,
  input_tokens        integer,
  output_tokens       integer,
  cost_usd            double precision,
  latency_ms          integer NOT NULL,
  outcome             text NOT NULL,
  error_message       text,
  metadata            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS llm_calls_tenant_idx     ON llm_calls (tenant_id);
CREATE INDEX IF NOT EXISTS llm_calls_surface_idx    ON llm_calls (surface_id);
CREATE INDEX IF NOT EXISTS llm_calls_prompt_idx     ON llm_calls (prompt_id);
CREATE INDEX IF NOT EXISTS llm_calls_created_at_idx ON llm_calls (created_at);

CREATE TABLE IF NOT EXISTS eval_runs (
  id                text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  surface_id        text NOT NULL,
  prompt_id         text NOT NULL,
  cases_total       integer NOT NULL,
  cases_passed      integer NOT NULL,
  cases_errored     integer NOT NULL DEFAULT 0,
  metrics           jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_latency_ms  integer NOT NULL,
  total_cost_usd    double precision,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS eval_runs_surface_idx     ON eval_runs (surface_id);
CREATE INDEX IF NOT EXISTS eval_runs_created_at_idx  ON eval_runs (created_at);
