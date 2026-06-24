-- Spec 19/20 — copy-engine shadow samples. Each row is a grounded message the
-- copy engine produced for a contact, stored for comparison against the live draft
-- path (the shadow never replaces a live send). Written behind COPY_ENGINE_SHADOW.
CREATE TABLE IF NOT EXISTS copy_shadow_sample (
  id                    text PRIMARY KEY,
  tenant_id             text REFERENCES tenants(id),
  contact_id            text NOT NULL,
  lang                  text NOT NULL,
  personalization_level text NOT NULL,
  subject               text,
  body                  text NOT NULL,
  flags                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_count        integer NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copy_shadow_sample_tenant_created_idx ON copy_shadow_sample (tenant_id, created_at);
CREATE INDEX IF NOT EXISTS copy_shadow_sample_contact_idx ON copy_shadow_sample (contact_id);

ALTER TABLE copy_shadow_sample ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_copy_shadow_sample ON copy_shadow_sample;
CREATE POLICY tenant_isolation_copy_shadow_sample ON copy_shadow_sample
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
