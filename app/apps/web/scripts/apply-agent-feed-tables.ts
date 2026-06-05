/**
 * One-off prod fix: create the F010 agent-feed tables that /api/agent-feed
 * queries (agent_reactions, agent_work_items, agent_actions). These live in
 * migrations 0012 + 0026 but were never applied to the live Supabase
 * (migration drift) -> the route 500s with `relation ... does not exist`.
 *
 * Idempotent: CREATE TABLE/INDEX IF NOT EXISTS + DO $$ guards on FKs.
 * Run: NODE_OPTIONS=--use-system-ca DATABASE_URL="<prod>" npx tsx scripts/apply-agent-feed-tables.ts
 */
import postgres from "postgres";

const url = (process.env.DATABASE_URL || "")
  .replace(/[\r\n\s]+/g, "") // strip any whitespace/newlines
  .replace(/(\/[A-Za-z0-9_]+)(?:[\\/]n|\\n)?$/, "$1") // drop trailing \n or /n after db name
  .trim();
if (!url) throw new Error("DATABASE_URL missing");

const TABLES = ["agent_reactions", "agent_work_items", "agent_actions"] as const;

const DDL = `
CREATE TABLE IF NOT EXISTS "agent_reactions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"trigger" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"deduplication_key" text NOT NULL,
	"context_snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"decision" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions_taken" integer DEFAULT 0 NOT NULL,
	"actions_deferred" integer DEFAULT 0 NOT NULL,
	"actions_skipped" integer DEFAULT 0 NOT NULL,
	"processing_time_ms" integer,
	"model_used" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_work_items" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"entity_label" text NOT NULL,
	"strategy" text NOT NULL,
	"strategy_reasoning" text NOT NULL,
	"strategy_set_at" timestamp with time zone NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"priority_reasoning" text,
	"next_action" text,
	"next_action_detail" text,
	"next_action_at" timestamp with time zone,
	"last_agent_action_id" text,
	"last_evaluated_at" timestamp with time zone,
	"evaluation_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"archived_reason" text,
	"archived_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "agent_actions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"user_id" text,
	"action_type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"scheduled_execution_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"reversed_at" timestamp with time zone,
	"reversed_by_user_id" text,
	"reversible_until" timestamp with time zone,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_actions_status_check" CHECK ("status" IN ('scheduled', 'executed', 'reversed', 'failed'))
);

DO $$ BEGIN
 ALTER TABLE "agent_reactions" ADD CONSTRAINT "agent_reactions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "agent_work_items" ADD CONSTRAINT "agent_work_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
 ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE INDEX IF NOT EXISTS "agent_reactions_dedup_idx" ON "agent_reactions" USING btree ("tenant_id","deduplication_key");
CREATE INDEX IF NOT EXISTS "agent_reactions_entity_idx" ON "agent_reactions" USING btree ("tenant_id","entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "agent_reactions_created_idx" ON "agent_reactions" USING btree ("tenant_id","created_at");
CREATE INDEX IF NOT EXISTS "agent_work_items_tenant_priority_idx" ON "agent_work_items" USING btree ("tenant_id","priority");
CREATE INDEX IF NOT EXISTS "agent_work_items_entity_idx" ON "agent_work_items" USING btree ("tenant_id","entity_type","entity_id");
CREATE INDEX IF NOT EXISTS "agent_work_items_next_action_idx" ON "agent_work_items" USING btree ("tenant_id","next_action_at");
CREATE INDEX IF NOT EXISTS "agent_actions_tenant_created_idx" ON "agent_actions" USING btree ("tenant_id","created_at" DESC);
CREATE INDEX IF NOT EXISTS "agent_actions_scheduled_idx" ON "agent_actions" USING btree ("scheduled_execution_at") WHERE "status" = 'scheduled';
CREATE INDEX IF NOT EXISTS "agent_actions_status_idx" ON "agent_actions" USING btree ("status");
`;

async function main() {
  const sql = postgres(url, { max: 1 });
  const host = new URL(url).host;
  console.log(`[apply] connected target host: ${host}`);

  const before: string[] = [];
  for (const t of TABLES) {
    const reg = await sql`SELECT to_regclass(${"public." + t})::text AS reg`;
    before.push(`${t}=${reg[0].reg ? "exists" : "MISSING"}`);
  }
  console.log("[before]", before.join(", "));

  await sql.unsafe(DDL);
  console.log("[apply] DDL executed");

  for (const t of TABLES) {
    const reg = await sql`SELECT to_regclass(${"public." + t})::text AS reg`;
    const cnt = reg[0].reg
      ? (await sql`SELECT count(*)::int AS n FROM ${sql(t)}`)[0].n
      : "n/a";
    console.log(`[after] ${t}: ${reg[0].reg ? "exists" : "MISSING"} (rows=${cnt})`);
  }

  await sql.end();
}
main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
