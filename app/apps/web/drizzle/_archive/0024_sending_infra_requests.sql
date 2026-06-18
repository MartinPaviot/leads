CREATE TABLE IF NOT EXISTS "sending_infra_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"requested_by_user_id" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"assignee_email" text,
	"notes" text,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sending_infra_requests_status_check" CHECK ("status" IN ('pending', 'in_progress', 'completed', 'cancelled'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sending_infra_requests" ADD CONSTRAINT "sending_infra_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sending_infra_requests" ADD CONSTRAINT "sending_infra_requests_requested_by_user_id_auth_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."auth_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sending_infra_requests_tenant_idx" ON "sending_infra_requests" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sending_infra_requests_status_idx" ON "sending_infra_requests" USING btree ("status");
