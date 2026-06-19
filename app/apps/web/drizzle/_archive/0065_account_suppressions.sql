-- Durable entity suppression ledger (tam-lifecycle).
--
-- Persistent "memory" of accounts AND contacts the user removed
-- (kind='deleted') or marked not-a-fit (kind='excluded'), keyed by STABLE
-- IDENTITY (company: domain + normalized name + native id such as SIREN / Zefix
-- UID; contact: email + linkedin). Every discovery / sourcing path checks this
-- before inserting, so a removed record is never re-sourced — even one with no
-- domain (SIRENE/Zefix), and even if its row is later hard-deleted. Reversible:
-- restore / re-include deletes the ledger row. See lib/accounts/suppression.ts.
--
-- Idempotent.
CREATE TABLE IF NOT EXISTS account_suppressions (
  id              TEXT PRIMARY KEY,
  tenant_id       TEXT NOT NULL REFERENCES tenants(id),
  entity_type     TEXT NOT NULL DEFAULT 'company', -- 'company' | 'contact'
  company_id      TEXT,                             -- source row id (company or contact)
  kind            TEXT NOT NULL,                    -- 'deleted' | 'excluded'
  reason          TEXT,
  domain          TEXT,
  name_normalized TEXT,
  native_id       TEXT,                             -- SIREN / Zefix UID / Apollo id
  native_id_type  TEXT,
  email           TEXT,
  linkedin        TEXT,
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Tolerate re-runs / pre-existing tables: add the entity columns if missing.
ALTER TABLE account_suppressions ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT 'company';
ALTER TABLE account_suppressions ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE account_suppressions ADD COLUMN IF NOT EXISTS linkedin TEXT;

CREATE INDEX IF NOT EXISTS account_suppressions_tenant_idx          ON account_suppressions (tenant_id);
CREATE INDEX IF NOT EXISTS account_suppressions_tenant_domain_idx   ON account_suppressions (tenant_id, domain);
CREATE INDEX IF NOT EXISTS account_suppressions_tenant_native_idx   ON account_suppressions (tenant_id, native_id);
CREATE INDEX IF NOT EXISTS account_suppressions_tenant_name_idx     ON account_suppressions (tenant_id, name_normalized);
CREATE INDEX IF NOT EXISTS account_suppressions_tenant_email_idx    ON account_suppressions (tenant_id, email);
CREATE INDEX IF NOT EXISTS account_suppressions_tenant_linkedin_idx ON account_suppressions (tenant_id, linkedin);
CREATE INDEX IF NOT EXISTS account_suppressions_company_idx         ON account_suppressions (company_id);

-- Backfill from existing already-removed / already-excluded rows so the ledger
-- protects accounts the user removed BEFORE this feature shipped.
INSERT INTO account_suppressions (id, tenant_id, entity_type, company_id, kind, reason, domain, name_normalized, native_id, native_id_type)
SELECT
  gen_random_uuid()::text,
  tenant_id,
  'company',
  id,
  CASE WHEN deleted_at IS NOT NULL THEN 'deleted' ELSE 'excluded' END,
  CASE WHEN deleted_at IS NOT NULL THEN 'backfill_deleted' ELSE COALESCE(excluded_reason, 'backfill_excluded') END,
  NULLIF(lower(regexp_replace(regexp_replace(COALESCE(domain, ''), '^https?://', ''), '^www\.', '')), ''),
  NULLIF(lower(btrim(COALESCE(name, ''))), ''),
  COALESCE(properties->>'siren', properties->>'uid', properties->>'apollo_id'),
  CASE
    WHEN properties->>'siren' IS NOT NULL THEN 'siren'
    WHEN properties->>'uid' IS NOT NULL THEN 'zefix_uid'
    WHEN properties->>'apollo_id' IS NOT NULL THEN 'apollo'
    ELSE NULL
  END
FROM companies
WHERE (deleted_at IS NOT NULL OR excluded_reason IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM account_suppressions s WHERE s.company_id = companies.id);

INSERT INTO account_suppressions (id, tenant_id, entity_type, company_id, kind, reason, email, linkedin, name_normalized)
SELECT
  gen_random_uuid()::text,
  tenant_id,
  'contact',
  id,
  'deleted',
  'backfill_deleted',
  NULLIF(lower(btrim(COALESCE(email, ''))), ''),
  NULLIF(lower(btrim(COALESCE(linkedin_url, ''))), ''),
  NULLIF(lower(btrim(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))), '')
FROM contacts
WHERE deleted_at IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM account_suppressions s WHERE s.company_id = contacts.id);
