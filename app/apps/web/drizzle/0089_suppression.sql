-- Spec 22 — suppression list (send/enroll compliance hot path).
-- Additive + idempotent. tenant_id NULL = global scope (applies to every
-- workspace). Broader than email_optouts: domain-level + typed + global.

CREATE TABLE IF NOT EXISTS suppression (
  id text PRIMARY KEY,
  tenant_id text REFERENCES tenants(id),
  level text NOT NULL,        -- 'address' | 'domain'
  value text NOT NULL,        -- normalized email or domain
  type text NOT NULL,         -- opt_out | hard_bounce | manual_dnc | competitor | existing_customer
  reason text,
  permanent boolean NOT NULL DEFAULT true,
  expires_at timestamptz,     -- cool-off for non-permanent bounces
  created_at timestamptz DEFAULT now()
);

-- One row per (scope, level, value). NULLS NOT DISTINCT (PG15+) so global rows
-- (NULL tenant_id) also dedup on (level, value).
CREATE UNIQUE INDEX IF NOT EXISTS suppression_scope_value_idx
  ON suppression (tenant_id, level, value) NULLS NOT DISTINCT;

-- Tenant isolation — same app.tenant_id RLS pattern as the existing tenant
-- tables (companies/contacts/email_optouts). NULL session var OR NULL tenant_id
-- (global) OR matching tenant.
ALTER TABLE suppression ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_suppression ON suppression;
CREATE POLICY tenant_isolation_suppression ON suppression
  FOR ALL
  USING (
    (NULLIF(current_setting('app.tenant_id', true), '') IS NULL)
    OR (tenant_id IS NULL)
    OR (tenant_id = current_setting('app.tenant_id', true))
  )
  WITH CHECK (
    (NULLIF(current_setting('app.tenant_id', true), '') IS NULL)
    OR (tenant_id IS NULL)
    OR (tenant_id = current_setting('app.tenant_id', true))
  );
