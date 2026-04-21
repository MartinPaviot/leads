-- Outcome-driven scoring feedback (primitive ④).
-- When a deal reaches 'won' or 'lost', record which signals fired on
-- that deal's company during the observation window. Aggregating
-- outcomes per signal type lets the scorer compute a per-tenant
-- multiplier ("hiring signals predict won with 3× lift here") without
-- a real ML training pipeline.

CREATE TABLE "signal_outcomes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"deal_id" text NOT NULL,
	"company_id" text,
	"signal_type" text NOT NULL,
	"signal_fired_at" timestamp with time zone,
	"outcome" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "signal_outcomes_outcome_check" CHECK ("outcome" IN ('won','lost'))
);
--> statement-breakpoint
CREATE INDEX "signal_outcomes_tenant_idx" ON "signal_outcomes" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "signal_outcomes_tenant_signal_idx" ON "signal_outcomes" ("tenant_id", "signal_type", "outcome");
--> statement-breakpoint
CREATE INDEX "signal_outcomes_deal_idx" ON "signal_outcomes" ("deal_id");
