-- Agent Tasks: long-running background operations with progress tracking
CREATE TABLE "agent_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "user_id" text NOT NULL,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "description" text,
  "status" text DEFAULT 'queued' NOT NULL,
  "progress_current" integer DEFAULT 0 NOT NULL,
  "progress_total" integer,
  "progress_message" text,
  "result" jsonb,
  "error" text,
  "chat_thread_id" text,
  "chat_message_id" text,
  "inngest_event_id" text,
  "checkpoint" jsonb,
  "depends_on" jsonb DEFAULT '[]'::jsonb,
  "queued_at" timestamp with time zone DEFAULT now() NOT NULL,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "agent_tasks_tenant_status_idx" ON "agent_tasks" USING btree ("tenant_id","status");
--> statement-breakpoint
CREATE INDEX "agent_tasks_user_active_idx" ON "agent_tasks" USING btree ("user_id","status");
--> statement-breakpoint
CREATE INDEX "agent_tasks_thread_idx" ON "agent_tasks" USING btree ("chat_thread_id");
