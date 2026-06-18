-- WS-1: Recorder as Channel — exposures, attribution, referral credits.
-- Additive migration. No existing tables touched.

CREATE TABLE "notetaker_exposures" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"referring_tenant_id" text NOT NULL,
	"participant_email" text NOT NULL,
	"participant_email_normalized" text NOT NULL,
	"exposure_at" timestamp with time zone DEFAULT now() NOT NULL,
	"branding_mode" text NOT NULL,
	"bot_display_name" text NOT NULL,
	"cta_clicked_at" timestamp with time zone,
	"signup_attributed_tenant_id" text,
	"signup_attributed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "notetaker_exposures_branding_mode_check" CHECK ("branding_mode" IN ('full','silent'))
);
--> statement-breakpoint
ALTER TABLE "notetaker_exposures" ADD CONSTRAINT "notetaker_exposures_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_exposures" ADD CONSTRAINT "notetaker_exposures_referring_tenant_id_tenants_id_fk" FOREIGN KEY ("referring_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notetaker_exposures" ADD CONSTRAINT "notetaker_exposures_signup_attributed_tenant_id_tenants_id_fk" FOREIGN KEY ("signup_attributed_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notetaker_exposures_email_at_idx" ON "notetaker_exposures" USING btree ("participant_email_normalized","exposure_at" DESC);--> statement-breakpoint
CREATE INDEX "notetaker_exposures_referring_at_idx" ON "notetaker_exposures" USING btree ("referring_tenant_id","exposure_at" DESC);--> statement-breakpoint
CREATE INDEX "notetaker_exposures_activity_idx" ON "notetaker_exposures" USING btree ("activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notetaker_exposures_activity_email_uniq" ON "notetaker_exposures" USING btree ("activity_id","participant_email_normalized");--> statement-breakpoint

CREATE TABLE "tenant_referral_credits" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"credits_earned_count" integer DEFAULT 0 NOT NULL,
	"credits_consumed_count" integer DEFAULT 0 NOT NULL,
	"last_credit_earned_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_referral_credits" ADD CONSTRAINT "tenant_referral_credits_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

CREATE TABLE "referral_credit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"event_type" text NOT NULL,
	"triggered_by_attribution_tenant_id" text,
	"triggered_by_exposure_id" text,
	"amount_cents" integer DEFAULT 0 NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "referral_credit_events_event_type_check" CHECK ("event_type" IN ('attribution_earned','credit_granted','credit_consumed'))
);
--> statement-breakpoint
ALTER TABLE "referral_credit_events" ADD CONSTRAINT "referral_credit_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_credit_events" ADD CONSTRAINT "referral_credit_events_triggered_by_attribution_tenant_id_tenants_id_fk" FOREIGN KEY ("triggered_by_attribution_tenant_id") REFERENCES "public"."tenants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "referral_credit_events" ADD CONSTRAINT "referral_credit_events_triggered_by_exposure_id_notetaker_exposures_id_fk" FOREIGN KEY ("triggered_by_exposure_id") REFERENCES "public"."notetaker_exposures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "referral_credit_events_tenant_created_idx" ON "referral_credit_events" USING btree ("tenant_id","created_at" DESC);
