-- Priority score on companies (B3, _specs/pilae-machine/spec-v2.md).
--
-- Composite score used to rank companies in the call queue and the
-- daily priority view. Recomputed by the `signal.score.daily` Inngest
-- cron at 06:00 UTC, and read by the `signal.accelerate.cadence`
-- event handler when deciding whether a fresh signal should bump an
-- enrollment's `next_step_at` forward (R4.2, R4.3, gap B3).
--
-- Formula: `multiplier × fit_score × accessibility`
--   multiplier   — `lib/scoring/signal-outcomes.ts#computeMultiplier`
--                  (signal lift from `signal_outcomes` history)
--   fit_score    — `companies.score` (existing ICP fit)
--   accessibility — derived from contact email/phone/linkedin coverage,
--                  see `lib/scoring/priority-score.ts#computeAccessibility`
--
-- Range ~0.0 to 2.5. NULL until the first daily compute touches a row.
-- Index is on (tenant_id, priority_score) so the per-tenant top-N
-- queue scans cheaply.
--
-- Idempotent. Hand-crafted (drizzle-kit journal stuck at 0014).

ALTER TABLE companies ADD COLUMN IF NOT EXISTS priority_score REAL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS priority_score_computed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS companies_priority_score_idx
  ON companies (tenant_id, priority_score);
