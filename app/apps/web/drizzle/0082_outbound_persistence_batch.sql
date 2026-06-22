-- Outbound persistence batch — P0-4 / P1-10 / P1-12 / P1-15.
-- Idempotent + additive only (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT
-- EXISTS, no DROP). The custom runner (scripts/apply-migrations.ts) wraps this in
-- a transaction, so no explicit BEGIN/COMMIT here.
--
-- Apply BEFORE deploying the matching schema change (the Drizzle schema now
-- references these columns; an unmigrated select-all 500s). DB-first is correct:
-- these nullable columns are harmless to the currently-deployed app (it doesn't
-- reference them yet).

-- P1-10 — firmographic/funding facts + per-field provenance on the brief.
ALTER TABLE intelligence_briefs
  ADD COLUMN IF NOT EXISTS firmographics jsonb,
  ADD COLUMN IF NOT EXISTS firmographic_provenance jsonb DEFAULT '[]'::jsonb;

-- P0-4 — pre-send spam-check signals; P1-15 — draft quality score.
ALTER TABLE sequence_drafts
  ADD COLUMN IF NOT EXISTS spam_score integer,
  ADD COLUMN IF NOT EXISTS spam_severity text,
  ADD COLUMN IF NOT EXISTS spam_warnings jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quality_score real;

CREATE INDEX IF NOT EXISTS sequence_drafts_quality_idx
  ON sequence_drafts (tenant_id, status, quality_score);

-- P1-12 — quality score the email was sent at (reply-rate back-test).
ALTER TABLE outbound_emails
  ADD COLUMN IF NOT EXISTS quality_score jsonb;

-- P1-12 — nightly calibration aggregates (no PII).
CREATE TABLE IF NOT EXISTS personalization_calibration (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  run_at timestamptz NOT NULL DEFAULT now(),
  run_date date NOT NULL,
  window_days integer NOT NULL DEFAULT 90,
  buckets jsonb NOT NULL,
  correlation real,
  insufficient_data boolean NOT NULL DEFAULT false,
  total_scored integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS perso_calib_tenant_date_idx
  ON personalization_calibration (tenant_id, run_date);
CREATE INDEX IF NOT EXISTS perso_calib_tenant_idx
  ON personalization_calibration (tenant_id);
