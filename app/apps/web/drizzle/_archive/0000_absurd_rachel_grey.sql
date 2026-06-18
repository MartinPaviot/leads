CREATE TYPE "public"."activity_type" AS ENUM('email_sent', 'email_received', 'email_opened', 'email_replied', 'email_bounced', 'meeting_scheduled', 'meeting_completed', 'meeting_cancelled', 'call_completed', 'note_created', 'note_updated', 'task_created', 'task_completed', 'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost', 'contact_created', 'company_created', 'sequence_enrolled', 'sequence_step_sent', 'sequence_completed', 'sequence_replied', 'website_visited', 'form_submitted', 'enrichment_updated', 'score_changed', 'system_event');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('email', 'meeting', 'call', 'web', 'system', 'manual');--> statement-breakpoint
CREATE TYPE "public"."deal_stage" AS ENUM('lead', 'qualification', 'demo', 'trial', 'proposal', 'negotiation', 'won', 'lost');--> statement-breakpoint
CREATE TYPE "public"."direction" AS ENUM('inbound', 'outbound', 'internal');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'paused', 'completed', 'replied', 'bounced', 'unsubscribed');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positive', 'neutral', 'negative');--> statement-breakpoint
CREATE TYPE "public"."sequence_status" AS ENUM('draft', 'active', 'paused', 'archived');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"activity_type" "activity_type" NOT NULL,
	"channel" "channel",
	"direction" "direction",
	"occurred_at" timestamp with time zone DEFAULT now(),
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"summary" text,
	"raw_content" text,
	"sentiment" "sentiment",
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "auth_account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "auth_account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "auth_verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "auth_verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chat_threads" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text NOT NULL,
	"title" text,
	"context_type" text,
	"context_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "companies" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"industry" text,
	"size" text,
	"revenue" text,
	"description" text,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"score" real,
	"score_reasons" jsonb DEFAULT '[]'::jsonb,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"company_id" text,
	"email" text,
	"phone" text,
	"first_name" text,
	"last_name" text,
	"title" text,
	"linkedin_url" text,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"score" real,
	"score_reasons" jsonb DEFAULT '[]'::jsonb,
	"owner_id" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "deals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"company_id" text,
	"contact_id" text,
	"owner_id" text,
	"name" text NOT NULL,
	"stage" "deal_stage" DEFAULT 'lead',
	"value" integer,
	"currency" text DEFAULT 'USD',
	"expected_close_date" timestamp with time zone,
	"properties" jsonb DEFAULT '{}'::jsonb,
	"score" real,
	"score_reasons" jsonb DEFAULT '[]'::jsonb,
	"summary" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"author_id" text,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"title" text,
	"content" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sequence_enrollments" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"status" "enrollment_status" DEFAULT 'active',
	"current_step" integer DEFAULT 1,
	"enrolled_at" timestamp with time zone DEFAULT now(),
	"last_step_at" timestamp with time zone,
	"next_step_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sequence_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"sequence_id" text NOT NULL,
	"step_number" integer NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"delay_days" integer DEFAULT 2,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sequences" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "sequence_status" DEFAULT 'draft',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"assignee_id" text,
	"entity_type" text,
	"entity_id" text,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"status" text DEFAULT 'pending',
	"priority" text DEFAULT 'medium',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'trial',
	"settings" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"clerk_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"avatar_url" text,
	"role" text DEFAULT 'member',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_userId_auth_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_userId_auth_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_thread_id_chat_threads_id_fk" FOREIGN KEY ("thread_id") REFERENCES "public"."chat_threads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deals" ADD CONSTRAINT "deals_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_enrollments" ADD CONSTRAINT "sequence_enrollments_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequence_steps" ADD CONSTRAINT "sequence_steps_sequence_id_sequences_id_fk" FOREIGN KEY ("sequence_id") REFERENCES "public"."sequences"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequences" ADD CONSTRAINT "sequences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_tenant_id_idx" ON "activities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "activities_entity_idx" ON "activities" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "activities_occurred_at_idx" ON "activities" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "activities_type_idx" ON "activities" USING btree ("activity_type");--> statement-breakpoint
CREATE INDEX "chat_messages_thread_id_idx" ON "chat_messages" USING btree ("thread_id");--> statement-breakpoint
CREATE INDEX "chat_threads_tenant_id_idx" ON "chat_threads" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "chat_threads_user_id_idx" ON "chat_threads" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "companies_tenant_id_idx" ON "companies" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "companies_domain_idx" ON "companies" USING btree ("domain");--> statement-breakpoint
CREATE INDEX "contacts_tenant_id_idx" ON "contacts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "contacts_company_id_idx" ON "contacts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "contacts_email_idx" ON "contacts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "deals_tenant_id_idx" ON "deals" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "deals_company_id_idx" ON "deals" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "deals_stage_idx" ON "deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX "notes_tenant_id_idx" ON "notes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "notes_entity_idx" ON "notes" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "enrollments_sequence_id_idx" ON "sequence_enrollments" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "enrollments_contact_id_idx" ON "sequence_enrollments" USING btree ("contact_id");--> statement-breakpoint
CREATE INDEX "enrollments_next_step_idx" ON "sequence_enrollments" USING btree ("next_step_at");--> statement-breakpoint
CREATE INDEX "sequence_steps_sequence_id_idx" ON "sequence_steps" USING btree ("sequence_id");--> statement-breakpoint
CREATE INDEX "sequences_tenant_id_idx" ON "sequences" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "sequences_status_idx" ON "sequences" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tasks_tenant_id_idx" ON "tasks" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tasks_assignee_idx" ON "tasks" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "tasks_due_date_idx" ON "tasks" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_clerk_id_idx" ON "users" USING btree ("clerk_id");--> statement-breakpoint
CREATE INDEX "users_tenant_id_idx" ON "users" USING btree ("tenant_id");