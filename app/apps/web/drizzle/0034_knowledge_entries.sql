-- Knowledge Entries: structured business context for agent and skills
CREATE TABLE "knowledge_entries" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "created_by" text NOT NULL,
  "scope" text DEFAULT 'workspace' NOT NULL,
  "title" text NOT NULL,
  "category" text DEFAULT 'custom' NOT NULL,
  "content" text NOT NULL,
  "content_hash" text NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "knowledge_entries_tenant_idx" ON "knowledge_entries" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "knowledge_entries_scope_idx" ON "knowledge_entries" USING btree ("tenant_id","scope");
--> statement-breakpoint
CREATE INDEX "knowledge_entries_category_idx" ON "knowledge_entries" USING btree ("tenant_id","category");
