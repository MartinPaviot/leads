-- TAM lifecycle: freshness + origin primitive.
--
-- Additive + idempotent (safe to re-apply). Two columns on companies and
-- contacts:
--   last_enriched_at — when enrichment last successfully wrote the row.
--     The staleness-based refresh queue (tam.refresh.daily, later phase)
--     sorts the oldest first; NULL = never enriched / unknown freshness.
--   source_system    — the system a record originated from ("apollo",
--     "csv", "manual", "inbound", ...). Denormalised from properties so
--     it can be filtered + shown as a "Source" column without unpacking
--     jsonb. Full per-field provenance is a later phase.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE contacts  ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;
ALTER TABLE contacts  ADD COLUMN IF NOT EXISTS source_system text;

CREATE INDEX IF NOT EXISTS companies_tenant_last_enriched_idx
  ON companies (tenant_id, last_enriched_at);
CREATE INDEX IF NOT EXISTS contacts_tenant_last_enriched_idx
  ON contacts (tenant_id, last_enriched_at);

-- Backfill freshness from ISO timestamps already stashed in properties.
-- CASE-guards each cast so a malformed value yields NULL instead of
-- aborting the whole migration.
UPDATE companies SET last_enriched_at = COALESCE(
    CASE WHEN properties->>'enrichment_attempted_at' ~ '^\d{4}-\d{2}-\d{2}'
         THEN (properties->>'enrichment_attempted_at')::timestamptz END,
    CASE WHEN properties->>'enriched_at' ~ '^\d{4}-\d{2}-\d{2}'
         THEN (properties->>'enriched_at')::timestamptz END
  )
  WHERE last_enriched_at IS NULL AND properties IS NOT NULL;

UPDATE contacts SET last_enriched_at =
    CASE WHEN properties->>'enriched_at' ~ '^\d{4}-\d{2}-\d{2}'
         THEN (properties->>'enriched_at')::timestamptz END
  WHERE last_enriched_at IS NULL AND properties IS NOT NULL;

-- Backfill origin system.
UPDATE companies SET source_system = NULLIF(properties->>'source','')
  WHERE source_system IS NULL AND properties->>'source' IS NOT NULL;

UPDATE contacts SET source_system = COALESCE(
    NULLIF(properties->>'source',''),
    NULLIF(properties->>'discovered_via','')
  )
  WHERE source_system IS NULL
    AND (properties->>'source' IS NOT NULL OR properties->>'discovered_via' IS NOT NULL);
