CREATE TYPE "public"."pipeline_stage" AS ENUM('enriched', 'signal_detected', 'enrolled', 'email_generated', 'email_queued', 'email_sent', 'email_delivered', 'email_opened', 'email_clicked', 'email_replied', 'email_bounced', 'meeting_booked', 'deal_created', 'deal_won', 'deal_lost');--> statement-breakpoint
CREATE TABLE "pipeline_events" (
	"id" text PRIMARY KEY NOT NULL,
	"trace_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"company_id" text,
	"contact_id" text,
	"deal_id" text,
	"enrollment_id" text,
	"outbound_email_id" text,
	"stage" "pipeline_stage" NOT NULL,
	"source_system" text NOT NULL,
	"duration_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_events" ADD CONSTRAINT "pipeline_events_deal_id_deals_id_fk" FOREIGN KEY ("deal_id") REFERENCES "public"."deals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pe_trace_idx" ON "pipeline_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "pe_tenant_created_idx" ON "pipeline_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "pe_company_created_idx" ON "pipeline_events" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "pe_stage_created_idx" ON "pipeline_events" USING btree ("stage","created_at");--> statement-breakpoint
CREATE INDEX "pe_contact_idx" ON "pipeline_events" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "pe_enrollment_idx" ON "pipeline_events" USING btree ("enrollment_id");