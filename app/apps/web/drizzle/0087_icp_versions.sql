-- Versioned ICP models — spec 11 (_specs/11-icp-model-store-and-nl-to-icp).
-- Idempotent + additive; new table, no existing consumers. DB-first per protocol.

CREATE TABLE IF NOT EXISTS icp_versions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  icp_id text NOT NULL,
  version integer NOT NULL,
  name text NOT NULL,
  criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS icp_versions_icp_version_idx ON icp_versions (tenant_id, icp_id, version);
CREATE INDEX IF NOT EXISTS icp_versions_status_idx ON icp_versions (tenant_id, icp_id, status);
