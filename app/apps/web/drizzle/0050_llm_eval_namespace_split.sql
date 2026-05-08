-- LLM-eval namespace split.
--
-- The `eval_runs` table created by 0004 (legacy agent-evaluator —
-- still owned by lib/agents/eval-runner.ts) collided in name with
-- the `eval_runs` table that 0041 tried to create for the LLM
-- observability dashboard. Because 0041 used `IF NOT EXISTS`, that
-- block was a no-op in production, leaving the legacy schema in
-- place while every consumer in `lib/evals/harness.ts`,
-- `app/api/admin/llm-evals`, and `app/api/admin/eval-runs/[id]/cases`
-- queried the columns of the *new* shape (surface_id, prompt_id,
-- cases_total, ...). Drizzle exported two `evalRuns` symbols from
-- the schema barrel which broke `tsc`. This migration unsticks both
-- by giving the LLM observability tables a dedicated namespace —
-- `llm_eval_runs` + `llm_eval_case_runs` — that doesn't fight the
-- legacy table.
--
-- Idempotent + safe to re-run. The view from 0047 is dropped on the
-- way in (it could not have been created where 0041's CREATE was a
-- no-op, but a few staging environments did succeed and would still
-- carry the old definition).

-- 1. Drop both possible view forms — the failed 0047 attempt that
--    targeted the legacy `eval_runs` shape, and any earlier rename
--    of this same migration.
DROP VIEW IF EXISTS eval_runs_latest_with_failures;
DROP VIEW IF EXISTS llm_eval_runs_latest_with_failures;

-- 2. Rename the per-case table that 0047 created. It's safe to
--    rename : the table was created with a FK to the *legacy*
--    eval_runs(id), but no harness code has ever written rows
--    pointing at legacy run ids, so the FK has zero rows enforcing
--    it. We drop the legacy FK before re-pointing it.
ALTER TABLE IF EXISTS eval_case_runs RENAME TO llm_eval_case_runs;
ALTER TABLE IF EXISTS llm_eval_case_runs
  DROP CONSTRAINT IF EXISTS eval_case_runs_run_id_fkey;
ALTER INDEX IF EXISTS eval_case_runs_run_idx
  RENAME TO llm_eval_case_runs_run_idx;
ALTER INDEX IF EXISTS eval_case_runs_case_idx
  RENAME TO llm_eval_case_runs_case_idx;
ALTER INDEX IF EXISTS eval_case_runs_created_at_idx
  RENAME TO llm_eval_case_runs_created_at_idx;

-- 2b. If 0047 was never applied to this database (true for any
--     environment that received the migrations after 0050 was
--     authored — including Supabase prod, where 0044-0050 have
--     not yet run), `eval_case_runs` doesn't exist, the rename
--     above is a no-op, and we'd later fail on the FK addition
--     because `llm_eval_case_runs` doesn't exist either. Create
--     it directly here so 0050 is self-sufficient. Same shape as
--     the original 0047 declaration, minus the legacy FK that
--     0050 ultimately wants pointing at `llm_eval_runs`.
CREATE TABLE IF NOT EXISTS llm_eval_case_runs (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL,
  case_id         TEXT NOT NULL,
  passed          BOOLEAN NOT NULL,
  errored         BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms      INTEGER NOT NULL,
  error_message   TEXT,
  output_snippet  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS llm_eval_case_runs_run_idx
  ON llm_eval_case_runs (run_id);
CREATE INDEX IF NOT EXISTS llm_eval_case_runs_case_idx
  ON llm_eval_case_runs (case_id);
CREATE INDEX IF NOT EXISTS llm_eval_case_runs_created_at_idx
  ON llm_eval_case_runs (created_at);

-- 3. Build the aggregate parent under the new name. Mirrors the
--    block 0041 wanted to install but couldn't.
CREATE TABLE IF NOT EXISTS llm_eval_runs (
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
CREATE INDEX IF NOT EXISTS llm_eval_runs_surface_idx
  ON llm_eval_runs (surface_id);
CREATE INDEX IF NOT EXISTS llm_eval_runs_created_at_idx
  ON llm_eval_runs (created_at);

-- 4. Re-attach the per-case rows to their new parent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'llm_eval_case_runs_run_id_fkey'
  ) THEN
    ALTER TABLE llm_eval_case_runs
      ADD CONSTRAINT llm_eval_case_runs_run_id_fkey
      FOREIGN KEY (run_id)
      REFERENCES llm_eval_runs(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5. Re-create the diagnostic view against the new shape.
CREATE OR REPLACE VIEW llm_eval_runs_latest_with_failures AS
SELECT
  ler.id              AS run_id,
  ler.surface_id,
  ler.prompt_id,
  ler.cases_total,
  ler.cases_passed,
  ler.cases_errored,
  ler.cases_total - ler.cases_passed - ler.cases_errored AS cases_failed,
  ler.metrics,
  ler.total_latency_ms,
  ler.created_at,
  COUNT(lecr.id) FILTER (WHERE NOT lecr.passed AND NOT lecr.errored) AS failed_case_count,
  COUNT(lecr.id) FILTER (WHERE lecr.errored) AS errored_case_count
FROM llm_eval_runs ler
LEFT JOIN llm_eval_case_runs lecr ON lecr.run_id = ler.id
GROUP BY ler.id;
