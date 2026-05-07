-- P0-5 task 5.2 — backfill `deals.properties` to the new
-- {value, source, date, manual, confidence?} entry shape.
--
-- The migration is idempotent : it inspects each row and only
-- rewrites legacy fields that aren't yet in entry shape. Rows that
-- already have the new shape (because they were written by post-P0-5
-- code) pass through unchanged.
--
-- Why we wrap as `manual: true` for legacy values : pre-P0-5 the
-- only way a value got into `deals.properties` was either an explicit
-- user write OR a legacy autofill that didn't track source. Treating
-- both as manual prevents the post-P0-5 cascade from overwriting them
-- with new LLM extractions — the user retains the safety net of
-- approving the change explicitly.
--
-- Identified known fields (per FIELD_CONFLICT_RULES). Unknown fields
-- are wrapped under the same convention. Date attribution falls back
-- to the deal's `updated_at`.

-- The wrapping is implemented in `lib/deal-autofill/property-accessor.ts`
-- via `migrateLegacyProperties()`. We can also do it in SQL but
-- jsonb construction in pgsql is verbose ; the cleaner path is :
--   1. Run a one-shot script `scripts/backfill-deal-properties.ts`
--      that uses the lib helper (single source of truth).
--   2. Verify post-run that every `properties.<known_field>` is an
--      object with `value`/`source`/`date`/`manual`.
--
-- Below : a defensive guard that ensures any tool reading
-- `deals.properties` after backfill sees consistent shape. We add an
-- index on the new shape's `manual` flag so admin queries
-- ("show me all auto-filled budgets") are fast.

-- Idempotent : skip if already created.
DO $$
BEGIN
  -- A partial index on (tenant_id, manual_flag) speeds up "find all
  -- non-manual budget entries for tenant X" — the daily cascade
  -- worker query pattern.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'deals_props_budget_manual_idx'
  ) THEN
    CREATE INDEX deals_props_budget_manual_idx
      ON deals (tenant_id)
      WHERE properties->'budget'->>'manual' = 'false';
  END IF;
END$$;

-- Lightweight assertion view for ops to spot pre-migration rows.
-- Pure read, drop after backfill if undesired.
CREATE OR REPLACE VIEW deals_legacy_properties AS
SELECT
  id,
  tenant_id,
  properties,
  updated_at
FROM deals
WHERE properties IS NOT NULL
  AND properties::text != '{}'
  AND (
    -- Known fields that should be entry-shaped post-migration.
    -- If any of these is still a primitive/array, the row needs
    -- backfilling.
    jsonb_typeof(properties->'budget') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'team_size') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'current_crm') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'competitors') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'point_solutions') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'stakeholders') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'next_step') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'timeline') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'why_now') NOT IN ('object', 'null') OR
    jsonb_typeof(properties->'summary') NOT IN ('object', 'null')
  );
