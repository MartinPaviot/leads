CREATE TABLE IF NOT EXISTS "agent_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"action_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_execution_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" text,
	"reversible_until" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_actions_status_check" CHECK ("status" IN ('scheduled', 'executed', 'reversed', 'failed'))
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_reversed_by_user_id_auth_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."auth_user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_actions_tenant_created_idx" ON "agent_actions" USING btree ("tenant_id","created_at" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_actions_scheduled_idx" ON "agent_actions" USING btree ("scheduled_execution_at") WHERE "status" = 'scheduled';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agent_actions_status_idx" ON "agent_actions" USING btree ("status");
