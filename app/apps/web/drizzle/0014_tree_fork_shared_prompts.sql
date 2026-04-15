-- CHAT-05: Tree/fork conversation + shared prompts.
-- (1) chat_messages gains parentMessageId + branchId for DAG-style
--     branching — legacy rows auto-migrate to branch_id='main' and
--     parent_message_id=NULL.
-- (2) shared_prompts table: reusable prompt templates scoped to
--     user or workspace.
-- Additive only — no existing rows rewritten.

ALTER TABLE "chat_messages" ADD COLUMN "parent_message_id" text;
--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "branch_id" text DEFAULT 'main' NOT NULL;
--> statement-breakpoint
CREATE INDEX "chat_messages_branch_idx" ON "chat_messages" USING btree ("thread_id","branch_id");
--> statement-breakpoint
CREATE INDEX "chat_messages_parent_idx" ON "chat_messages" USING btree ("parent_message_id");
--> statement-breakpoint

CREATE TABLE "shared_prompts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"scope" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shared_prompts" ADD CONSTRAINT "shared_prompts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_prompts" ADD CONSTRAINT "shared_prompts_author_id_auth_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shared_prompts_tenant_scope_idx" ON "shared_prompts" USING btree ("tenant_id","scope");
--> statement-breakpoint
CREATE INDEX "shared_prompts_author_idx" ON "shared_prompts" USING btree ("author_id");
