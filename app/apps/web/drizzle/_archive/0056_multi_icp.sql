-- Multi-ICP Phase 1 (_specs/multi-icp). N ICPs per tenant, open
-- criteria engine anchored on the Apollo search vocabulary, fit score
-- as a matrix (company × icp).
--
-- Additive + idempotent. Hand-crafted (drizzle-kit journal stuck at
-- 0014 — see scripts/apply-migrations.ts). Sequence/customSignals FK
-- additions are deferred to Phase 3 (binding); this migration is the
-- core data model only.

-- 1. icps — one ICP per row, N per tenant, priority resolves primary.
CREATE TABLE IF NOT EXISTS icps (
  id                 TEXT PRIMARY KEY,
  tenant_id          TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'draft',
  priority           INTEGER NOT NULL DEFAULT 100,
  metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id TEXT REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icps_tenant_idx ON icps (tenant_id);
CREATE INDEX IF NOT EXISTS icps_tenant_status_idx ON icps (tenant_id, status);
CREATE INDEX IF NOT EXISTS icps_tenant_priority_idx ON icps (tenant_id, priority);

-- 2. icp_criteria — an ICP is the AND of its criteria.
CREATE TABLE IF NOT EXISTS icp_criteria (
  id          TEXT PRIMARY KEY,
  icp_id      TEXT NOT NULL REFERENCES icps(id) ON DELETE CASCADE,
  field_key   TEXT NOT NULL,
  operator    TEXT NOT NULL,
  value       JSONB,
  weight      REAL NOT NULL DEFAULT 1,
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icp_criteria_icp_idx ON icp_criteria (icp_id);
CREATE INDEX IF NOT EXISTS icp_criteria_field_idx ON icp_criteria (field_key);

-- 3. icp_field_catalog — the criteria vocabulary. tenant_id NULL =
--    global Apollo-standard field; non-null = tenant custom.
CREATE TABLE IF NOT EXISTS icp_field_catalog (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT REFERENCES tenants(id) ON DELETE CASCADE,
  field_key    TEXT NOT NULL,
  label        TEXT NOT NULL,
  source       TEXT NOT NULL,
  value_type   TEXT NOT NULL,
  operators    JSONB NOT NULL DEFAULT '[]'::jsonb,
  apollo_param TEXT,
  source_path  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS icp_field_catalog_tenant_idx ON icp_field_catalog (tenant_id);
-- Unique field key within a scope. NULLs are distinct in a UNIQUE
-- index in Postgres, so multiple global rows with the same key would
-- NOT collide — we guard global uniqueness with a partial index too.
CREATE UNIQUE INDEX IF NOT EXISTS icp_field_catalog_scope_key_idx
  ON icp_field_catalog (tenant_id, field_key);
CREATE UNIQUE INDEX IF NOT EXISTS icp_field_catalog_global_key_idx
  ON icp_field_catalog (field_key) WHERE tenant_id IS NULL;

-- 4. company_icp_fit — the scoring matrix. One row per (company, icp).
CREATE TABLE IF NOT EXISTS company_icp_fit (
  company_id       TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  icp_id           TEXT NOT NULL REFERENCES icps(id) ON DELETE CASCADE,
  tenant_id        TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  fit_score        REAL NOT NULL DEFAULT 0,
  matched_criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (company_id, icp_id)
);
CREATE INDEX IF NOT EXISTS company_icp_fit_tenant_idx ON company_icp_fit (tenant_id);
CREATE INDEX IF NOT EXISTS company_icp_fit_icp_score_idx ON company_icp_fit (icp_id, fit_score);
CREATE INDEX IF NOT EXISTS company_icp_fit_company_idx ON company_icp_fit (company_id);
