-- CHAT-07: Memory scope (user / workspace / team)
-- Additive column on chat_memories. Defaults to 'user' for existing
-- rows (private). Workspace-scoped memories are visible to every
-- member of the tenant.

ALTER TABLE "chat_memories" ADD COLUMN "scope" text DEFAULT 'user' NOT NULL;
--> statement-breakpoint
CREATE INDEX "chat_memories_scope_idx" ON "chat_memories" USING btree ("tenant_id","scope");
