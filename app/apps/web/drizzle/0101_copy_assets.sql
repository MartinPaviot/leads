-- Spec 18 — voice guide + asset blocks. Versioned, workspace/campaign/lang-scoped
-- copy building blocks + a brand voice guide. Append-only with supersede: exactly
-- one is_current row per scope; prior versions retained.
CREATE TABLE IF NOT EXISTS copy_asset_block (
  id           text PRIMARY KEY,
  tenant_id    text REFERENCES tenants(id),
  campaign_id  text,
  lang         text NOT NULL,
  kind         text NOT NULL,
  content      text NOT NULL,
  version      integer NOT NULL DEFAULT 1,
  is_current   boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copy_asset_block_scope_idx ON copy_asset_block (tenant_id, lang, kind, is_current);

CREATE TABLE IF NOT EXISTS copy_voice_guide (
  id                text PRIMARY KEY,
  tenant_id         text REFERENCES tenants(id),
  lang              text NOT NULL,
  favored_phrasings jsonb NOT NULL DEFAULT '[]'::jsonb,
  formats           jsonb NOT NULL DEFAULT '[]'::jsonb,
  topics            jsonb NOT NULL DEFAULT '[]'::jsonb,
  banned_words      jsonb NOT NULL DEFAULT '[]'::jsonb,
  fr_formality      text NOT NULL DEFAULT 'vouvoiement',
  version           integer NOT NULL DEFAULT 1,
  is_current        boolean NOT NULL DEFAULT true,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS copy_voice_guide_scope_idx ON copy_voice_guide (tenant_id, lang, is_current);

ALTER TABLE copy_asset_block ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_copy_asset_block ON copy_asset_block;
CREATE POLICY tenant_isolation_copy_asset_block ON copy_asset_block
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));

ALTER TABLE copy_voice_guide ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_copy_voice_guide ON copy_voice_guide;
CREATE POLICY tenant_isolation_copy_voice_guide ON copy_voice_guide
  FOR ALL
  USING ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)))
  WITH CHECK ((NULLIF(current_setting('app.tenant_id', true), '') IS NULL) OR (tenant_id IS NULL) OR (tenant_id = current_setting('app.tenant_id', true)));
