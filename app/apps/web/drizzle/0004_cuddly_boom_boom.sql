CREATE TYPE "public"."agent_trace_status" AS ENUM('ok', 'error', 'timeout', 'corrected');--> statement-breakpoint
CREATE TYPE "public"."eval_run_status" AS ENUM('pending', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "agent_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text,
	"agent_id" text NOT NULL,
	"agent_category" text NOT NULL,
	"trace_id" text,
	"parent_span_id" text,
	"input" text,
	"output" text,
	"model" text,
	"status" "agent_trace_status" DEFAULT 'ok' NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"estimated_cost" real,
	"latency_ms" integer,
	"tool_calls" jsonb DEFAULT '[]'::jsonb,
	"tool_calls_count" integer DEFAULT 0,
	"error_message" text,
	"correction_applied" text,
	"eval_score" real,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "context_graph_communities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"summary" text,
	"node_ids" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "context_graph_edges" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_node_id" text NOT NULL,
	"target_node_id" text NOT NULL,
	"relation_type" text NOT NULL,
	"fact" text NOT NULL,
	"confidence" real DEFAULT 1,
	"t_valid" timestamp with time zone DEFAULT now(),
	"t_invalid" timestamp with time zone,
	"t_created" timestamp with time zone DEFAULT now(),
	"t_expired" timestamp with time zone,
	"source_type" text,
	"source_id" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "context_graph_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"name" text NOT NULL,
	"summary" text,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"dataset_id" text NOT NULL,
	"input" text NOT NULL,
	"expected_output" text,
	"context" text,
	"tags" jsonb DEFAULT '[]'::jsonb,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "eval_datasets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"agent_output" text,
	"score" real,
	"pass" boolean,
	"grader_reasoning" text,
	"latency_ms" integer,
	"tool_calls_count" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"model" text NOT NULL,
	"grader_model" text NOT NULL,
	"status" "eval_run_status" DEFAULT 'pending' NOT NULL,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "agent_traces" ADD CONSTRAINT "agent_traces_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_graph_communities" ADD CONSTRAINT "context_graph_communities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_graph_edges" ADD CONSTRAINT "context_graph_edges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_graph_edges" ADD CONSTRAINT "context_graph_edges_source_node_id_context_graph_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."context_graph_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_graph_edges" ADD CONSTRAINT "context_graph_edges_target_node_id_context_graph_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."context_graph_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_graph_nodes" ADD CONSTRAINT "context_graph_nodes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_cases" ADD CONSTRAINT "eval_cases_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_datasets" ADD CONSTRAINT "eval_datasets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_run_id_eval_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_case_id_eval_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."eval_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_eval_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."eval_datasets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "at_tenant_idx" ON "agent_traces" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "at_agent_idx" ON "agent_traces" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "at_trace_idx" ON "agent_traces" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "at_created_idx" ON "agent_traces" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "at_status_idx" ON "agent_traces" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cgc_tenant_idx" ON "context_graph_communities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cge_tenant_idx" ON "context_graph_edges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cge_source_idx" ON "context_graph_edges" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "cge_target_idx" ON "context_graph_edges" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "cge_relation_idx" ON "context_graph_edges" USING btree ("tenant_id","relation_type");--> statement-breakpoint
CREATE INDEX "cge_valid_idx" ON "context_graph_edges" USING btree ("tenant_id","t_valid","t_invalid");--> statement-breakpoint
CREATE INDEX "cgn_tenant_idx" ON "context_graph_nodes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "cgn_entity_idx" ON "context_graph_nodes" USING btree ("tenant_id","entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "cgn_name_idx" ON "context_graph_nodes" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "ec_dataset_idx" ON "eval_cases" USING btree ("dataset_id");--> statement-breakpoint
CREATE INDEX "ed_tenant_idx" ON "eval_datasets" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "eres_run_idx" ON "eval_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "eres_case_idx" ON "eval_results" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "er_tenant_idx" ON "eval_runs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "er_dataset_idx" ON "eval_runs" USING btree ("dataset_id");