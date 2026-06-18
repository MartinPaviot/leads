CREATE TABLE "agent_failure_patterns" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"pattern_type" text NOT NULL,
	"description" text NOT NULL,
	"frequency" integer DEFAULT 1,
	"example_trace_ids" jsonb DEFAULT '[]'::jsonb,
	"resolution" text,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_few_shot_examples" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"input" text NOT NULL,
	"output" text NOT NULL,
	"eval_score" real NOT NULL,
	"source_trace_id" text,
	"is_active" boolean DEFAULT true,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_prompt_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"change_reason" text,
	"parent_version_id" text,
	"eval_score" real,
	"eval_pass_rate" real,
	"is_active" boolean DEFAULT false,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sequences" ADD COLUMN "campaign_config" jsonb;--> statement-breakpoint
CREATE INDEX "afp_agent_idx" ON "agent_failure_patterns" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "afp_type_idx" ON "agent_failure_patterns" USING btree ("agent_id","pattern_type");--> statement-breakpoint
CREATE INDEX "afse_agent_idx" ON "agent_few_shot_examples" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "afse_score_idx" ON "agent_few_shot_examples" USING btree ("agent_id","eval_score");--> statement-breakpoint
CREATE INDEX "apv_agent_idx" ON "agent_prompt_versions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "apv_active_idx" ON "agent_prompt_versions" USING btree ("agent_id","is_active");