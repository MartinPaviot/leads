/**
 * One-shot backfill for `__elevay_migrations` tracking.
 *
 * Some Elevay databases were migrated via earlier tooling (drizzle-kit
 * journal `__drizzle_migrations` or manual psql apply) before the
 * custom runner shipped. On those DBs the `__elevay_migrations` table
 * is empty, and re-running `apply-migrations.ts` tries to re-apply
 * 0000+ from scratch — which fails on the first `CREATE TYPE`.
 *
 * This script pre-populates `__elevay_migrations` with everything
 * already on disk through a cutoff (default 0050) WITHOUT executing
 * any SQL against the schema. The hashes match exactly what the
 * runner would compute, so re-running `apply-migrations.ts` after
 * this script will skip the backfilled entries cleanly.
 *
 * Pass `BACKFILL_THROUGH=0050` (default) to control the cutoff. Files
 * named numerically above the cutoff are NOT backfilled — they remain
 * for the runner to apply normally.
 *
 * Idempotent via INSERT ... ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/backfill-elevay-migrations.ts
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");

function extractMigrationIndex(filename: string): number | null {
  const m = filename.match(/^(\d+)_/);
  return m ? parseInt(m[1], 10) : null;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const cutoff = parseInt(process.env.BACKFILL_THROUGH ?? "50", 10);
  if (!Number.isFinite(cutoff) || cutoff < 0) {
    console.error(`Invalid BACKFILL_THROUGH=${process.env.BACKFILL_THROUGH}`);
    process.exit(1);
  }

  const sql = postgres(url, { max: 1 });

  await sql`
    CREATE TABLE IF NOT EXISTS __elevay_migrations (
      filename TEXT PRIMARY KEY,
      hash TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let backfilled = 0;
  let skipped = 0;
  let outOfRange = 0;

  for (const file of files) {
    const idx = extractMigrationIndex(file);
    if (idx === null || idx > cutoff) {
      outOfRange++;
      continue;
    }
    const path = join(MIGRATIONS_DIR, file);
    const content = await readFile(path, "utf-8");
    const hash = createHash("sha256").update(content).digest("hex");

    const result = await sql`
      INSERT INTO __elevay_migrations (filename, hash)
      VALUES (${file}, ${hash})
      ON CONFLICT (filename) DO NOTHING
      RETURNING filename
    `;
    if (result.length > 0) {
      backfilled++;
    } else {
      skipped++;
    }
  }

  console.log(
    `Backfill done. Through idx ${cutoff}: ${backfilled} inserted, ${skipped} already tracked, ${outOfRange} above cutoff (left for runner).`,
  );
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
