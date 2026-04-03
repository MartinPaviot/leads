CREATE TABLE "chat_memories" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"category" text DEFAULT 'learned_context' NOT NULL,
	"key" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "chat_memories" ADD CONSTRAINT "chat_memories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_memories" ADD CONSTRAINT "chat_memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_memories_tenant_user_idx" ON "chat_memories" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "chat_memories_category_idx" ON "chat_memories" USING btree ("category");