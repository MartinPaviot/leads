/**
 * READ-ONLY audit: for every table declared across drizzle/*.sql, check whether
 * it exists in the connected DB. Quantifies prod migration drift. No writes.
 * Run: NODE_OPTIONS=--use-system-ca DATABASE_URL="<prod>" npx tsx scripts/audit-prod-schema-drift.ts
 */
import postgres from "postgres";
import { readFileSync } from "node:fs";

const url = (process.env.DATABASE_URL || "")
  .replace(/[\r\n\s]+/g, "")
  .replace(/(\/[A-Za-z0-9_]+)(?:[\\/]n|\\n)?$/, "$1")
  .trim();
if (!url) throw new Error("DATABASE_URL missing");

const tables = readFileSync(new URL("./_all_tables.txt", import.meta.url), "utf8")
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  const sql = postgres(url, { max: 1 });
  console.log(`host: ${new URL(url).host}  tables to check: ${tables.length}`);
  const missing: string[] = [];
  const present: string[] = [];
  for (const t of tables) {
    const r = await sql`SELECT to_regclass(${"public." + t})::text AS reg`;
    (r[0].reg ? present : missing).push(t);
  }
  console.log(`\nPRESENT (${present.length}):`);
  console.log("  " + present.join(", "));
  console.log(`\nMISSING (${missing.length}):`);
  console.log("  " + missing.join(", "));
  await sql.end();
}
main().catch((e) => {
  console.error("ERR", e.message);
  process.exit(1);
});
