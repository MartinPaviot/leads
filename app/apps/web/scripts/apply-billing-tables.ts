/**
 * Prod fix: create the billing tables defined in src/db/billing-schema.ts
 * (subscriptions, usage_events + their enums). These have NO migration in
 * drizzle/*.sql so they were never created in prod -> /api/chat 500s on
 * `relation "usage_events" does not exist` (the ai_query budget check).
 * ADDITIVE + idempotent.
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.vercel-prod.env", import.meta.url), "utf8");
const url = (env.match(/^DATABASE_URL="?([^"\n]+)/m)?.[1] || "")
  .replace(/[\r\n\s]+/g, "").replace(/(\/[A-Za-z0-9_]+)(?:[\\/]n|\\n)?$/, "$1").trim();
if (!url) throw new Error("DATABASE_URL missing");

const DDL = `
DO $$ BEGIN
  CREATE TYPE "subscription_status" AS ENUM ('active','trialing','past_due','canceled','unpaid');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "usage_event_type" AS ENUM ('api_call','email_sent','contact_enriched','ai_query');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "stripe_customer_id" text NOT NULL,
  "stripe_subscription_id" text UNIQUE,
  "stripe_price_id" text,
  "status" "subscription_status" DEFAULT 'trialing',
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false,
  "trial_start" timestamp with time zone,
  "trial_end" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "usage_events" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text NOT NULL,
  "event_type" "usage_event_type" NOT NULL,
  "count" integer DEFAULT 1 NOT NULL,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "subscriptions_tenant_id_idx" ON "subscriptions" ("tenant_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_customer_idx" ON "subscriptions" ("stripe_customer_id");
CREATE INDEX IF NOT EXISTS "subscriptions_stripe_sub_idx" ON "subscriptions" ("stripe_subscription_id");
CREATE INDEX IF NOT EXISTS "usage_events_tenant_id_idx" ON "usage_events" ("tenant_id");
CREATE INDEX IF NOT EXISTS "usage_events_type_idx" ON "usage_events" ("event_type");
CREATE INDEX IF NOT EXISTS "usage_events_created_idx" ON "usage_events" ("created_at");
`;

async function main() {
  const sql = postgres(url, { max: 1 });
  console.log(`host: ${new URL(url).host}`);
  await sql.unsafe(DDL);
  for (const t of ["subscriptions", "usage_events"]) {
    const r = await sql`SELECT to_regclass(${"public." + t})::text AS reg`;
    console.log(`  ${t}: ${r[0].reg ? "exists" : "MISSING"}`);
  }
  await sql.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
