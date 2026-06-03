-- PROPOSAL-001: proposal template ingestion. Additive and safe on a
-- populated DB (CREATE TABLE / INDEX IF NOT EXISTS).
--   proposal_templates — an uploaded template plus its detected/confirmed
--     component map (uploaded -> detected -> mapped, or failed).
--   proposal_assets — DB-blob backing store for the raw template bytes,
--     the default behind the ProposalStorage interface.

CREATE TABLE IF NOT EXISTS "proposal_templates" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "created_by_user_id" text REFERENCES "users"("id"),
  "name" text NOT NULL,
  -- 'docx' (only in v1)
  "source_format" text NOT NULL,
  "original_file_name" text NOT NULL,
  -- opaque id from ProposalStorage (= proposal_assets.id for the DB-blob impl)
  "storage_ref" text NOT NULL,
  -- uploaded | detected | mapped | failed
  "status" text NOT NULL DEFAULT 'uploaded',
  "extracted_text" text,
  "extracted_outline" jsonb DEFAULT '[]'::jsonb,
  "component_map" jsonb,
  "map_confirmed" boolean DEFAULT false,
  "detection_meta" jsonb DEFAULT '{}'::jsonb,
  "extraction_error" text,
  "mapped_by_user_id" text REFERENCES "users"("id"),
  "mapped_at" timestamp with time zone,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_templates_tenant_id_idx" ON "proposal_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_templates_tenant_status_idx" ON "proposal_templates" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_assets" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "content_type" text NOT NULL,
  "byte_size" integer NOT NULL,
  "bytes" bytea NOT NULL,
  "created_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_assets_tenant_id_idx" ON "proposal_assets" USING btree ("tenant_id");
