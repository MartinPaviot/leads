-- Code Executions: agent-written code run in sandbox with CRM data
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
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "code_executions" ADD CONSTRAINT "code_executions_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "code_executions_tenant_idx" ON "code_executions" USING btree ("tenant_id");
--> statement-breakpoint
CREATE INDEX "code_executions_thread_idx" ON "code_executions" USING btree ("chat_thread_id");
