CREATE TABLE "autonomy_config" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"level" text DEFAULT 'copilot' NOT NULL,
	"permissions" jsonb DEFAULT '{"coldEmailSend":"manual","replyPositive":"manual","replyObjection":"manual","replyNegative":"auto_stop","warmIntroSend":"manual","linkedInActions":"draft_only","newProspectAdd":"manual","strategySwitch":"ask","sequencePause":"ask"}'::jsonb NOT NULL,
	"guardrails" jsonb DEFAULT '{"maxEmailsPerDay":40,"maxNewProspectsPerWeek":25,"maxEmailsPerProspect":5,"maxEmailsPerProspectDays":21,"neverContact":[],"alwaysEscalateWhen":[],"sendWindow":{"start":"08:00","end":"18:00","days":["mon","tue","wed","thu","fri"],"timezone":"recipient"},"language":"auto","maxDailySpend":5}'::jsonb NOT NULL,
	"brand" jsonb DEFAULT '{"writingStyle":"Direct and concise","forbiddenWords":[],"signatureTemplate":"","formalityLevel":"match_prospect"}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "content_variants" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"playbook_id" text NOT NULL,
	"segment" text,
	"prompt_hash" text NOT NULL,
	"mutation_type" text,
	"is_baseline" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"sent" integer DEFAULT 0,
	"opened" integer DEFAULT 0,
	"replied" integer DEFAULT 0,
	"positive_replied" integer DEFAULT 0,
	"meetings_booked" integer DEFAULT 0,
	"reply_rate" real,
	"positive_rate" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollment_strategy" (
	"id" text PRIMARY KEY NOT NULL,
	"enrollment_id" text NOT NULL,
	"playbook_id" text NOT NULL,
	"variant_id" text,
	"selection_score" real NOT NULL,
	"selection_reason" text NOT NULL,
	"alternatives_considered" jsonb DEFAULT '[]'::jsonb,
	"warm_path_used" boolean DEFAULT false,
	"connector_contact_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intelligence_briefs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"company_id" text NOT NULL,
	"contact_id" text,
	"website_summary" text,
	"recent_news" jsonb DEFAULT '[]'::jsonb,
	"job_postings" jsonb DEFAULT '[]'::jsonb,
	"tech_stack" jsonb DEFAULT '[]'::jsonb,
	"linkedin_activity" jsonb,
	"public_content" jsonb DEFAULT '[]'::jsonb,
	"competitor_detected" text,
	"communication_style" jsonb,
	"pain_points" jsonb DEFAULT '[]'::jsonb,
	"best_angle" text,
	"warmth_signals" jsonb DEFAULT '[]'::jsonb,
	"public_content_depth" integer DEFAULT 0,
	"sources_attempted" integer DEFAULT 0,
	"sources_succeeded" integer DEFAULT 0,
	"source_errors" jsonb DEFAULT '[]'::jsonb,
	"researched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outreach_playbooks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"strategy_type" text NOT NULL,
	"is_active" boolean DEFAULT true,
	"custom_system_prompt" text,
	"activation_overrides" jsonb,
	"total_sent" integer DEFAULT 0,
	"total_replied" integer DEFAULT 0,
	"total_positive" integer DEFAULT 0,
	"avg_reply_rate" real,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_trust_score" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"overall" real DEFAULT 50 NOT NULL,
	"per_playbook" jsonb DEFAULT '{}'::jsonb,
	"per_action" jsonb DEFAULT '{}'::jsonb,
	"actions_count" integer DEFAULT 0,
	"approvals_without_edit" integer DEFAULT 0,
	"rejections" integer DEFAULT 0,
	"last_updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_downgrade_at" timestamp with time zone,
	"last_upgrade_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "autonomy_config" ADD CONSTRAINT "autonomy_config_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_variants" ADD CONSTRAINT "content_variants_playbook_id_outreach_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."outreach_playbooks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_strategy" ADD CONSTRAINT "enrollment_strategy_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment_strategy" ADD CONSTRAINT "enrollment_strategy_playbook_id_outreach_playbooks_id_fk" FOREIGN KEY ("playbook_id") REFERENCES "public"."outreach_playbooks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_briefs" ADD CONSTRAINT "intelligence_briefs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_briefs" ADD CONSTRAINT "intelligence_briefs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intelligence_briefs" ADD CONSTRAINT "intelligence_briefs_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outreach_playbooks" ADD CONSTRAINT "outreach_playbooks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_trust_score" ADD CONSTRAINT "system_trust_score_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_variants_playbook_idx" ON "content_variants" USING btree ("playbook_id","is_active");--> statement-breakpoint
CREATE INDEX "content_variants_tenant_idx" ON "content_variants" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollment_strategy_enrollment_idx" ON "enrollment_strategy" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "intelligence_briefs_tenant_idx" ON "intelligence_briefs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "intelligence_briefs_company_idx" ON "intelligence_briefs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "intelligence_briefs_expires_idx" ON "intelligence_briefs" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "intelligence_briefs_tenant_company_contact_idx" ON "intelligence_briefs" USING btree ("tenant_id","company_id","contact_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outreach_playbooks_tenant_type_idx" ON "outreach_playbooks" USING btree ("tenant_id","strategy_type");