CREATE TABLE IF NOT EXISTS "score_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"grade" text NOT NULL,
	"score" real NOT NULL,
	"event" text NOT NULL,
	"event_ref" text,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "score_snapshots" ADD CONSTRAINT "score_snapshots_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_snapshots_tenant_idx" ON "score_snapshots" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_snapshots_tenant_event_idx" ON "score_snapshots" ("tenant_id","event");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "score_snapshots_event_ref_idx" ON "score_snapshots" ("event_ref");
