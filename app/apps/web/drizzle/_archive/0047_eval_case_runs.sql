-- FOLLOW-UP — per-case eval persistence (Sprint-3 audit follow-up).
--
-- Sibling table to `eval_runs` storing one row per case in the
-- aggregate. Without this, an alarm on a regressing eval metric is
-- blind — the on-call has to re-run the suite locally to see which
-- case broke. With it, the dashboard drill-down + the "explain this
-- regression" SQL is a single query.
--
-- Retention : the existing `eval_runs` purge sweep (4-week rolling
-- window — managed by the data-retention worker) cascades to this
-- table via the run_id FK. Disk footprint is bounded.
--
-- NB : we declare the FK without a deferrable constraint because the
-- harness inserts the parent run row BEFORE the case rows, so a
-- foreign-key violation here is genuinely a bug rather than ordering.

CREATE TABLE IF NOT EXISTS eval_case_runs (
  id              TEXT PRIMARY KEY,
  run_id          TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  case_id         TEXT NOT NULL,
  passed          BOOLEAN NOT NULL,
  errored         BOOLEAN NOT NULL DEFAULT FALSE,
  latency_ms      INTEGER NOT NULL,
  error_message   TEXT,
  output_snippet  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS eval_case_runs_run_idx ON eval_case_runs (run_id);
CREATE INDEX IF NOT EXISTS eval_case_runs_case_idx ON eval_case_runs (case_id);
CREATE INDEX IF NOT EXISTS eval_case_runs_created_at_idx ON eval_case_runs (created_at);

-- Diagnostic view : surface the latest run per suite plus the count
-- of failed cases. The eval dashboard reads this to render the
-- "regressions this week" tile.
CREATE OR REPLACE VIEW eval_runs_latest_with_failures AS
SELECT
  er.id              AS run_id,
  er.surface_id,
  er.prompt_id,
  er.cases_total,
  er.cases_passed,
  er.cases_errored,
  er.cases_total - er.cases_passed - er.cases_errored AS cases_failed,
  er.metrics,
  er.total_latency_ms,
  er.created_at,
  COUNT(ecr.id) FILTER (WHERE NOT ecr.passed AND NOT ecr.errored) AS failed_case_count,
  COUNT(ecr.id) FILTER (WHERE ecr.errored) AS errored_case_count
FROM eval_runs er
LEFT JOIN eval_case_runs ecr ON ecr.run_id = er.id
GROUP BY er.id;
