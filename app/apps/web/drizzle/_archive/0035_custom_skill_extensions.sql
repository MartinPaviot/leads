-- Extend custom_skill_templates for agentic skill builder (Lightfield parity)
ALTER TABLE "custom_skill_templates" ADD COLUMN IF NOT EXISTS "scope" text DEFAULT 'workspace' NOT NULL;
--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN IF NOT EXISTS "steps" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN IF NOT EXISTS "constraints" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN IF NOT EXISTS "parameters" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN IF NOT EXISTS "forked_from_id" text;
--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN IF NOT EXISTS "use_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN IF NOT EXISTS "last_used_at" timestamp with time zone;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "custom_skill_templates_scope_idx" ON "custom_skill_templates" USING btree ("tenant_id","scope");
