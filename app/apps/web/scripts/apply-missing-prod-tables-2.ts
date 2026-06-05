/**
 * Finisher for the 3 tables apply-missing-prod-tables.ts couldn't create:
 *  - pipeline_events  (needs the pipeline_stage enum, created first)
 *  - signal_outcomes  (CREATE was preceded by comments -> missed by parser)
 *  - inbound_write_keys (same)
 * Idempotent. ADDITIVE ONLY.
 */
import postgres from "postgres";

const url = (process.env.DATABASE_URL || "")
  .replace(/[\r\n\s]+/g, "")
  .replace(/(\/[A-Za-z0-9_]+)(?:[\\/]n|\\n)?$/, "$1")
  .trim();
if (!url) throw new Error("DATABASE_URL missing");

const STMTS = [
  `DO $$ BEGIN
     CREATE TYPE "public"."pipeline_stage" AS ENUM('enriched','signal_detected','enrolled','email_generated','email_queued','email_sent','email_delivered','email_opened','email_clicked','email_replied','email_bounced','meeting_booked','deal_created','deal_won','deal_lost');
   EXCEPTION WHEN duplicate_object THEN null; END $$`,

  `CREATE TABLE IF NOT EXISTS "pipeline_events" (
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
   )`,
  `CREATE INDEX IF NOT EXISTS "pe_trace_idx" ON "pipeline_events" USING btree ("trace_id")`,
  `CREATE INDEX IF NOT EXISTS "pe_tenant_created_idx" ON "pipeline_events" USING btree ("tenant_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "pe_company_created_idx" ON "pipeline_events" USING btree ("company_id","created_at")`,
  `CREATE INDEX IF NOT EXISTS "pe_stage_created_idx" ON "pipeline_events" USING btree ("stage","created_at")`,
  `CREATE INDEX IF NOT EXISTS "pe_contact_idx" ON "pipeline_events" USING btree ("contact_id")`,
  `CREATE INDEX IF NOT EXISTS "pe_enrollment_idx" ON "pipeline_events" USING btree ("enrollment_id")`,

  `CREATE TABLE IF NOT EXISTS "signal_outcomes" (
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
   )`,
  `CREATE INDEX IF NOT EXISTS "signal_outcomes_tenant_idx" ON "signal_outcomes" ("tenant_id")`,
  `CREATE INDEX IF NOT EXISTS "signal_outcomes_tenant_signal_idx" ON "signal_outcomes" ("tenant_id","signal_type","outcome")`,
  `CREATE INDEX IF NOT EXISTS "signal_outcomes_deal_idx" ON "signal_outcomes" ("deal_id")`,

  `CREATE TABLE IF NOT EXISTS "inbound_write_keys" (
     "id" text PRIMARY KEY NOT NULL,
     "tenant_id" text NOT NULL,
     "key_hash" text NOT NULL,
     "key_prefix" text NOT NULL,
     "label" text,
     "created_at" timestamp with time zone DEFAULT now() NOT NULL,
     "last_used_at" timestamp with time zone,
     "revoked_at" timestamp with time zone,
     CONSTRAINT "inbound_write_keys_key_hash_unique" UNIQUE ("key_hash")
   )`,
  `CREATE INDEX IF NOT EXISTS "inbound_write_keys_tenant_idx" ON "inbound_write_keys" ("tenant_id")`,
];

async function main() {
  const sql = postgres(url, { max: 1 });
  console.log(`host: ${new URL(url).host}`);
  let ok = 0, skipped = 0;
  for (const stmt of STMTS) {
    try { await sql.unsafe(stmt); ok++; }
    catch (e: any) { console.warn(`  skip: ${e.message.split("\n")[0]}`); skipped++; }
  }
  console.log(`applied ok:${ok} skipped:${skipped}`);
  for (const t of ["pipeline_events", "signal_outcomes", "inbound_write_keys"]) {
    const r = await sql`SELECT to_regclass(${"public." + t})::text AS reg`;
    console.log(`  ${t}: ${r[0].reg ? "exists" : "MISSING"}`);
  }
  await sql.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
