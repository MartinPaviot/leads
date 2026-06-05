/**
 * Prod drift fix (ADDITIVE ONLY): create the tables that exist in the drizzle
 * migrations but are MISSING from the live Supabase. Parses drizzle/*.sql,
 * selects the CREATE TABLE / CREATE INDEX / ADD CONSTRAINT(FK) statements that
 * target the missing tables, makes them idempotent, and applies them.
 *
 * Never drops or alters existing tables. Safe to re-run.
 * Run: NODE_OPTIONS=--use-system-ca DATABASE_URL="<prod>" npx tsx scripts/apply-missing-prod-tables.ts
 */
import postgres from "postgres";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const url = (process.env.DATABASE_URL || "")
  .replace(/[\r\n\s]+/g, "")
  .replace(/(\/[A-Za-z0-9_]+)(?:[\\/]n|\\n)?$/, "$1")
  .trim();
if (!url) throw new Error("DATABASE_URL missing");

const MISSING = new Set([
  "action_outcomes", "autonomy_config", "content_variants",
  "context_graph_communities", "context_graph_edges", "context_graph_nodes",
  "enrollment_strategy", "eval_cases", "eval_datasets", "eval_results",
  "inbound_visitors", "inbound_write_keys", "intelligence_briefs",
  "outreach_playbooks", "pipeline_events", "sending_infra_requests",
  "signal_outcomes", "system_trust_score", "trust_events",
]);

const drizzleDir = new URL("../drizzle/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const files = readdirSync(drizzleDir).filter((f) => f.endsWith(".sql")).sort();

const creates: string[] = [];
const indexes: string[] = [];
const fks: string[] = [];

for (const f of files) {
  const sqlText = readFileSync(join(drizzleDir, f), "utf8");
  const stmts = sqlText
    .split(/-->\s*statement-breakpoint|;\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (let stmt of stmts) {
    stmt = stmt.replace(/;\s*$/, "");
    const create = stmt.match(/^CREATE TABLE (?:IF NOT EXISTS )?"([a-z_]+)"/i);
    if (create && MISSING.has(create[1])) {
      creates.push(stmt.replace(/^CREATE TABLE (?:IF NOT EXISTS )?/i, "CREATE TABLE IF NOT EXISTS "));
      continue;
    }
    const idx = stmt.match(/^CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?"[^"]+" ON "([a-z_]+)"/i);
    if (idx && MISSING.has(idx[1])) {
      indexes.push(stmt.replace(/^CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?/i, "CREATE $1INDEX IF NOT EXISTS "));
      continue;
    }
    const fk = stmt.match(/^ALTER TABLE "([a-z_]+)" ADD CONSTRAINT .* FOREIGN KEY/is);
    if (fk && MISSING.has(fk[1])) {
      fks.push(stmt);
      continue;
    }
  }
}

async function main() {
  const sql = postgres(url, { max: 1 });
  console.log(`host: ${new URL(url).host}`);
  console.log(`statements -> creates:${creates.length} fks:${fks.length} indexes:${indexes.length}`);

  let ok = 0, skipped = 0;
  // 1) tables first (no inline FKs in the drizzle pattern), 2) FKs, 3) indexes
  for (const stmt of [...creates, ...fks, ...indexes]) {
    try {
      await sql.unsafe(stmt);
      ok++;
    } catch (e: any) {
      // duplicate_object on FK re-add etc.
      console.warn(`  skip: ${e.message.split("\n")[0]} :: ${stmt.slice(0, 70).replace(/\s+/g, " ")}`);
      skipped++;
    }
  }
  console.log(`applied ok:${ok} skipped:${skipped}`);

  // verify
  const stillMissing: string[] = [];
  for (const t of MISSING) {
    const r = await sql`SELECT to_regclass(${"public." + t})::text AS reg`;
    if (!r[0].reg) stillMissing.push(t);
  }
  console.log(stillMissing.length ? `STILL MISSING: ${stillMissing.join(", ")}` : "all 19 tables now present");
  await sql.end();
}
main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
