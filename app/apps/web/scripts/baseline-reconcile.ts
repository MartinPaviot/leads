/**
 * One-time reconciliation for the migration baseline squash.
 *
 * After squashing the 81 legacy migrations into `drizzle/0000_baseline.sql`,
 * EXISTING databases (prod, staging, …) already contain the full schema. Their
 * `__elevay_migrations` table records the old (now-archived) filenames but NOT
 * `0000_baseline.sql`, so `apply-migrations.ts` would try to run the baseline
 * against a populated DB and fail.
 *
 * This script records `0000_baseline.sql` as already-applied (same sha256 the
 * runner computes) WITHOUT executing it. Run it ONCE against every pre-existing
 * environment, before the deploy that ships the squash.
 *
 * Fresh databases must NOT run this — their empty `__elevay_migrations` lets the
 * runner apply the baseline normally. (This script refuses to run on an empty
 * public schema as a safety guard.)
 *
 * Usage:  DATABASE_URL=... tsx scripts/baseline-reconcile.ts
 */
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE = join(__dirname, "..", "drizzle", "0000_baseline.sql");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const content = await readFile(BASELINE, "utf-8");
  const hash = createHash("sha256").update(content).digest("hex");

  const sql = postgres(url, { max: 1 });
  await sql`
    CREATE TABLE IF NOT EXISTS __elevay_migrations (
      filename TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const existing = await sql<{ filename: string }[]>`
    SELECT filename FROM __elevay_migrations WHERE filename = '0000_baseline.sql'
  `;
  if (existing.length > 0) {
    console.log("0000_baseline.sql already recorded — nothing to do.");
    await sql.end();
    return;
  }

  const tables = await sql<{ n: number }[]>`
    SELECT count(*)::int n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `;
  if (tables[0].n === 0) {
    console.error(
      "Refusing to reconcile: public schema is EMPTY. This looks like a fresh DB — " +
        "let apply-migrations.ts run the baseline instead of marking it applied.",
    );
    await sql.end();
    process.exit(1);
  }

  await sql`
    INSERT INTO __elevay_migrations (filename, hash)
    VALUES ('0000_baseline.sql', ${hash})
  `;
  console.log(
    `Recorded 0000_baseline.sql as applied (hash ${hash.slice(0, 12)}…) on a DB ` +
      `with ${tables[0].n} existing tables.`,
  );
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
