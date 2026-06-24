-- Canonical data model — spec 00 (_specs/00-canonical-data-model).
-- Idempotent + additive only (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT
-- EXISTS / CREATE INDEX IF NOT EXISTS, no DROP). The custom runner
-- (scripts/apply-migrations.ts) wraps this in a transaction, so no explicit
-- BEGIN/COMMIT here.
--
-- DB-first: apply BEFORE deploying the matching Drizzle schema change. The new
-- columns are nullable / defaulted and harmless to the currently-deployed app
-- (it does not reference them yet); once the schema deploys, an unmigrated
-- select-all would 500.

-- CanonicalAccount (companies): identity key + vendor side map + canonical
-- projection.
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS identity_key text,
  ADD COLUMN IF NOT EXISTS vendor_ids jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS canonical_fields jsonb DEFAULT '{}'::jsonb;

-- One canonical record per real legal entity per tenant (AC3). Partial:
-- ignores unkeyed + soft-deleted rows so legacy duplicates do not block the
-- index creation.
CREATE UNIQUE INDEX IF NOT EXISTS companies_identity_key_idx
  ON companies (tenant_id, identity_key)
  WHERE identity_key IS NOT NULL AND deleted_at IS NULL;

-- CanonicalContact (contacts): same additions.
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS identity_key text,
  ADD COLUMN IF NOT EXISTS vendor_ids jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS canonical_fields jsonb DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_identity_key_idx
  ON contacts (tenant_id, identity_key)
  WHERE identity_key IS NOT NULL AND deleted_at IS NULL;

-- Provenance ledger — one row per (entity, field, provider). canonical_fields
-- is recomputed from these by provider precedence on every write (AC6).
CREATE TABLE IF NOT EXISTS account_field_source (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  entity_id text NOT NULL REFERENCES companies(id),
  field text NOT NULL,
  provider text NOT NULL,
  value jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS account_field_source_unique_idx
  ON account_field_source (entity_id, field, provider);
CREATE INDEX IF NOT EXISTS account_field_source_tenant_idx
  ON account_field_source (tenant_id);
CREATE INDEX IF NOT EXISTS account_field_source_entity_idx
  ON account_field_source (entity_id);

CREATE TABLE IF NOT EXISTS contact_field_source (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  entity_id text NOT NULL REFERENCES contacts(id),
  field text NOT NULL,
  provider text NOT NULL,
  value jsonb,
  observed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contact_field_source_unique_idx
  ON contact_field_source (entity_id, field, provider);
CREATE INDEX IF NOT EXISTS contact_field_source_tenant_idx
  ON contact_field_source (tenant_id);
CREATE INDEX IF NOT EXISTS contact_field_source_entity_idx
  ON contact_field_source (entity_id);
