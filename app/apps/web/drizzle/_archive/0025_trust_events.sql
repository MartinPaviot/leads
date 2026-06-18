CREATE TABLE IF NOT EXISTS "trust_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"event_type" text NOT NULL,
	"score_delta" real DEFAULT 0 NOT NULL,
	"new_score" real NOT NULL,
	"entity_ref" text,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "trust_events" ADD CONSTRAINT "trust_events_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trust_events_tenant_created_idx" ON "trust_events" USING btree ("tenant_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trust_events_event_type_idx" ON "trust_events" USING btree ("event_type");
