CREATE TYPE "public"."mailbox_status" AS ENUM('warming_up', 'active', 'paused', 'disabled', 'error');--> statement-breakpoint
CREATE TYPE "public"."outbound_status" AS ENUM('draft', 'queued', 'sending', 'sent', 'delivered', 'bounced', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "connected_mailboxes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email_address" text NOT NULL,
	"display_name" text,
	"provider" text NOT NULL,
	"ee_account_id" text NOT NULL,
	"domain" text NOT NULL,
	"status" "mailbox_status" DEFAULT 'warming_up',
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"sent_total" integer DEFAULT 0 NOT NULL,
	"bounce_count_7d" integer DEFAULT 0 NOT NULL,
	"reply_count_7d" integer DEFAULT 0 NOT NULL,
	"health_score" integer DEFAULT 100 NOT NULL,
	"warmup_started_at" timestamp with time zone,
	"warmup_daily_target" integer DEFAULT 5,
	"warmup_completed_at" timestamp with time zone,
	"send_window_start" text DEFAULT '08:00',
	"send_window_end" text DEFAULT '18:00',
	"send_days" jsonb DEFAULT '["mon","tue","wed","thu","fri"]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "connected_mailboxes_ee_account_id_unique" UNIQUE("ee_account_id")
);
--> statement-breakpoint
CREATE TABLE "email_optouts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"email_address" text NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "outbound_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"campaign_id" text,
	"enrollment_id" text,
	"contact_id" text,
	"mailbox_id" text,
	"step_number" integer,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text NOT NULL,
	"body_html" text NOT NULL,
	"body_text" text,
	"message_id" text,
	"ee_message_id" text,
	"thread_id" text,
	"in_reply_to" text,
	"status" "outbound_status" DEFAULT 'draft',
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"opened_at" timestamp with time zone,
	"clicked_at" timestamp with time zone,
	"replied_at" timestamp with time zone,
	"bounced_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"reply_classification" text,
	"reply_snippet" text,
	"error_message" text,
	"bounce_type" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "warmup_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"mailbox_id" text NOT NULL,
	"target_mailbox_id" text NOT NULL,
	"direction" text NOT NULL,
	"message_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "connected_mailboxes" ADD CONSTRAINT "connected_mailboxes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_optouts" ADD CONSTRAINT "email_optouts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_enrollment_id_sequence_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."sequence_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_emails" ADD CONSTRAINT "outbound_emails_mailbox_id_connected_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."connected_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_emails" ADD CONSTRAINT "warmup_emails_mailbox_id_connected_mailboxes_id_fk" FOREIGN KEY ("mailbox_id") REFERENCES "public"."connected_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warmup_emails" ADD CONSTRAINT "warmup_emails_target_mailbox_id_connected_mailboxes_id_fk" FOREIGN KEY ("target_mailbox_id") REFERENCES "public"."connected_mailboxes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mailbox_tenant_idx" ON "connected_mailboxes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "mailbox_status_idx" ON "connected_mailboxes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "mailbox_domain_idx" ON "connected_mailboxes" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_tenant_email_idx" ON "connected_mailboxes" USING btree ("tenant_id","email_address");--> statement-breakpoint
CREATE UNIQUE INDEX "optout_tenant_email_idx" ON "email_optouts" USING btree ("tenant_id","email_address");--> statement-breakpoint
CREATE INDEX "outbound_tenant_idx" ON "outbound_emails" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "outbound_status_idx" ON "outbound_emails" USING btree ("status");--> statement-breakpoint
CREATE INDEX "outbound_mailbox_idx" ON "outbound_emails" USING btree ("mailbox_id");--> statement-breakpoint
CREATE INDEX "outbound_contact_idx" ON "outbound_emails" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "outbound_thread_idx" ON "outbound_emails" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "outbound_enrollment_idx" ON "outbound_emails" USING btree ("enrollment_id");--> statement-breakpoint
CREATE INDEX "outbound_sent_idx" ON "outbound_emails" USING btree ("sent_at");