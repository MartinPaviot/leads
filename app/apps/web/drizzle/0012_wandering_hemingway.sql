CREATE TABLE "action_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"action_id" text NOT NULL,
	"reaction_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"action_type" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"observation_window_hours" integer DEFAULT 168 NOT NULL,
	"status" text DEFAULT 'watching' NOT NULL,
	"outcome_type" text,
	"positivity" real,
	"time_to_outcome_hours" real,
	"outcome_metadata" jsonb DEFAULT '{}'::jsonb,
	"trigger_type" text,
	"entity_snapshot" jsonb DEFAULT '{}'::jsonb,
	"watching_since" timestamp with time zone DEFAULT now() NOT NULL,
	"window_expires_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"trigger" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions_taken" integer DEFAULT 0 NOT NULL,
	"actions_deferred" integer DEFAULT 0 NOT NULL,
	"actions_skipped" integer DEFAULT 0 NOT NULL,
	"processing_time_ms" integer,
	"model_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "agent_work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_label" text NOT NULL,
	"strategy" text NOT NULL,
	"strategy_reasoning" text NOT NULL,
	"strategy_set_at" timestamp with time zone NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"priority_reasoning" text,
	"next_action" text,
	"next_action_detail" text,
	"next_action_at" timestamp with time zone,
	"last_agent_action_id" text,
	"last_evaluated_at" timestamp with time zone,
	"evaluation_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_reason" text,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "code_executions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"chat_thread_id" text,
	"code" text NOT NULL,
	"data_query" text,
	"mode" text DEFAULT 'read' NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"output" jsonb,
	"error" text,
	"execution_time_ms" integer,
	"iteration" integer DEFAULT 1 NOT NULL,
	"parent_execution_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
ALTER TABLE "custom_skill_templates" ADD COLUMN "scope" text DEFAULT 'workspace' NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN "constraints" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN "parameters" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN "forked_from_id" text;--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_skill_templates" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "action_outcomes" ADD CONSTRAINT "action_outcomes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_reactions" ADD CONSTRAINT "agent_reactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_tasks" ADD CONSTRAINT "agent_tasks_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_work_items" ADD CONSTRAINT "agent_work_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_created_by_auth_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_outcomes_watching_idx" ON "action_outcomes" USING btree ("tenant_id","status","window_expires_at");--> statement-breakpoint
CREATE INDEX "action_outcomes_action_idx" ON "action_outcomes" USING btree ("action_id");--> statement-breakpoint
CREATE INDEX "action_outcomes_entity_idx" ON "action_outcomes" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "action_outcomes_stats_idx" ON "action_outcomes" USING btree ("tenant_id","action_type","status");--> statement-breakpoint
CREATE INDEX "agent_reactions_dedup_idx" ON "agent_reactions" USING btree ("tenant_id","deduplication_key");--> statement-breakpoint
CREATE INDEX "agent_reactions_entity_idx" ON "agent_reactions" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "agent_reactions_created_idx" ON "agent_reactions" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_tasks_tenant_status_idx" ON "agent_tasks" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "agent_tasks_user_active_idx" ON "agent_tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "agent_tasks_thread_idx" ON "agent_tasks" USING btree ("chat_thread_id");--> statement-breakpoint
CREATE INDEX "agent_work_items_tenant_priority_idx" ON "agent_work_items" USING btree ("tenant_id","priority");--> statement-breakpoint
CREATE INDEX "agent_work_items_entity_idx" ON "agent_work_items" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "agent_work_items_next_action_idx" ON "agent_work_items" USING btree ("tenant_id","next_action_at");--> statement-breakpoint
CREATE INDEX "code_executions_tenant_idx" ON "code_executions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "code_executions_thread_idx" ON "code_executions" USING btree ("chat_thread_id");--> statement-breakpoint
CREATE INDEX "knowledge_entries_tenant_idx" ON "knowledge_entries" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "knowledge_entries_scope_idx" ON "knowledge_entries" USING btree ("tenant_id","scope");--> statement-breakpoint
CREATE INDEX "knowledge_entries_category_idx" ON "knowledge_entries" USING btree ("tenant_id","category");--> statement-breakpoint
CREATE INDEX "custom_skill_templates_scope_idx" ON "custom_skill_templates" USING btree ("tenant_id","scope");