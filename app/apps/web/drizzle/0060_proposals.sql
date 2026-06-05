-- PROPOSAL-002: filled proposal instances. Additive and idempotent.
--   proposals — a mapped template + a deal, drafted from the info base.
--   proposal_components — one row per filled component (resolved field value
--     or generated section prose). source/confidence land in PROPOSAL-003.

CREATE TABLE IF NOT EXISTS "proposals" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "template_id" text NOT NULL REFERENCES "proposal_templates"("id"),
  "deal_id" text REFERENCES "deals"("id"),
  "created_by_user_id" text REFERENCES "users"("id"),
  -- filled | exported
  "status" text NOT NULL DEFAULT 'filled',
  "output_storage_ref" text,
  "deleted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_tenant_id_idx" ON "proposals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_template_id_idx" ON "proposals" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposals_deal_id_idx" ON "proposals" USING btree ("deal_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "proposal_components" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "proposal_id" text NOT NULL REFERENCES "proposals"("id"),
  "component_id" text NOT NULL,
  -- section | field
  "kind" text NOT NULL,
  "label" text NOT NULL,
  "placeholder_token" text NOT NULL,
  "data_key" text,
  "content" text NOT NULL DEFAULT '',
  "source" jsonb DEFAULT '{}'::jsonb,
  -- high | medium | low (PROPOSAL-003)
  "confidence" text,
  "order" integer NOT NULL DEFAULT 0,
  "created_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_components_tenant_id_idx" ON "proposal_components" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "proposal_components_proposal_id_idx" ON "proposal_components" USING btree ("proposal_id");
