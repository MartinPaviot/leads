-- Human-in-the-loop capture approval (gap E / Lightfield-parity).
-- A pending queue for auto-captured interactions (email / meeting / call)
-- when a tenant opts into review mode (tenants.settings.captureApprovalMode
-- = 'review'). Default behaviour is unchanged ('auto' → direct insert), so
-- this migration is purely additive and safe on a populated DB.

CREATE TABLE IF NOT EXISTS "capture_approvals" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  -- "email" | "meeting" | "call"
  "kind" text NOT NULL,
  -- idempotency key (gmailMessageId / meetingId / callId) so re-sync
  -- doesn't enqueue duplicates
  "source_ref" text,
  -- the activities row we'll insert verbatim on approval
  "proposed_activity" jsonb NOT NULL,
  "summary" text,
  -- "pending" | "approved" | "rejected"
  "status" text NOT NULL DEFAULT 'pending',
  -- set to the created activities.id once an approval is applied
  "applied_activity_id" text,
  "reviewed_by_user_id" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "capture_approvals_tenant_status_idx" ON "capture_approvals" USING btree ("tenant_id", "status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "capture_approvals_dedup_idx" ON "capture_approvals" USING btree ("tenant_id", "kind", "source_ref") WHERE "source_ref" IS NOT NULL;
