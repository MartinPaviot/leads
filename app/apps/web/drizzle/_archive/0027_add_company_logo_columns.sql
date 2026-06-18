-- Logo rendering fix — PR A / T A.1-A.3
-- Adds 4 nullable columns + 1 index to companies so the logo resolver
-- (shipping in PR B) can persist resolved URLs and the tier that served
-- them. All additions are nullable and idempotent so this migration is
-- safe to apply to an existing populated database.
--
-- See docs/specs/logo-rendering-fix-spec.md §4 and logo-rendering-fix-plan.md
-- tasks T A.1, T A.2, T A.3 for full context.

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "resolved_logo_url" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "resolved_logo_tier" integer;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "logo_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "user_uploaded_logo_url" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_logo_resolved_at_idx" ON "companies" USING btree ("logo_resolved_at");
