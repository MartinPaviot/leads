-- Inbound module (primitive ⑥).
-- Visitor-ID pixel + public-write endpoint. Two tables:
--
--  inbound_write_keys — hashed pixel keys that identify the tenant
--    without exposing tenant_id on customer websites. Every pixel
--    request carries x-leadsens-write-key: lk_<secret>; the server
--    SHA-256's it and joins on key_hash.
--
--  inbound_visitors — de-identified pings. Enrichment via RB2B /
--    Snitcher / Clearbit Reveal lands in identified_company_id /
--    identified_person_email when a provider comes online; until
--    then the rows hold a raw IP + User-Agent for later backfill.

CREATE TABLE "inbound_write_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"key_hash" text NOT NULL,
	"key_prefix" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "inbound_write_keys_key_hash_unique" UNIQUE ("key_hash")
);
--> statement-breakpoint
CREATE INDEX "inbound_write_keys_tenant_idx" ON "inbound_write_keys" ("tenant_id");
--> statement-breakpoint

CREATE TABLE "inbound_visitors" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"session_id" text NOT NULL,
	"page_url" text,
	"referrer" text,
	"ip_address" text,
	"user_agent" text,
	"country" text,
	"identified_company_id" text,
	"identified_person_email" text,
	"identified_via" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"event_count" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "inbound_visitors_tenant_idx" ON "inbound_visitors" ("tenant_id");
--> statement-breakpoint
CREATE INDEX "inbound_visitors_session_idx" ON "inbound_visitors" ("tenant_id", "session_id");
--> statement-breakpoint
CREATE INDEX "inbound_visitors_last_seen_idx" ON "inbound_visitors" ("tenant_id", "last_seen_at");
--> statement-breakpoint
CREATE INDEX "inbound_visitors_identified_idx" ON "inbound_visitors" ("tenant_id", "identified_company_id");
