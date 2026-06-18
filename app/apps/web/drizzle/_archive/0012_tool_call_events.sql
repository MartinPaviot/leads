-- CHAT-04: Tool-call audit + undo support
-- Creates tool_call_events for persistent audit trail and reversal
-- state. Additive migration — no existing tables/rows touched.

CREATE TABLE "tool_call_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"thread_id" text,
	"message_id" text,
	"tool_name" text NOT NULL,
	"args" jsonb DEFAULT '{}'::jsonb,
	"result" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'executed' NOT NULL,
	"snapshot" jsonb,
	"reverse_op_id" text,
	"reverted_at" timestamp with time zone,
	"error_message" text,
	"surface_type" text,
	"executed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_call_events" ADD CONSTRAINT "tool_call_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_call_events" ADD CONSTRAINT "tool_call_events_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tool_call_events_tenant_user_idx" ON "tool_call_events" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "tool_call_events_tool_name_idx" ON "tool_call_events" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "tool_call_events_thread_idx" ON "tool_call_events" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "tool_call_events_executed_at_idx" ON "tool_call_events" USING btree ("executed_at");
