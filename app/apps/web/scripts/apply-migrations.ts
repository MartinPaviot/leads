/**
 * Custom migration runner for Elevay.
 *
 * Drizzle-kit's journal (`drizzle/meta/_journal.json`) only tracks 15
 * of the 41 migration SQL files. The remaining 26 were created manually
 * (mostly during the autonomous chat sessions, commits 0012 onwards).
 *
 * Running `drizzle-kit migrate` against a fresh DB would silently skip
 * 26 critical migrations (RLS policies, knowledge_entries, agentTraces
 * support, FTS indexes, soft delete, distillation, agent_tasks, custom
 * skills, code_executions, pipeline_events, etc.) — leaving the app
 * with an incomplete schema.
 *
 * This runner:
 * 1. Ensures the `__drizzle_migrations` tracking table exists
 * 2. Reads all `.sql` files from `drizzle/` in numeric order
 * 3. Applies each migration not already recorded
 * 4. Records the hash + timestamp for each applied migration
 *
 * Usage:
 *   tsx scripts/apply-migrations.ts
 *
 * Env:
 *   DATABASE_URL — the PostgreSQL connection string
 *
 * Safety:
 *   - All migrations in the codebase are additive (CREATE TABLE / ALTER
 *     TABLE ADD COLUMN). Re-applying is safe with IF NOT EXISTS guards.
 *   - We use a single transaction per migration so a partial failure
 *     rolls back cleanly.
 */

import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "drizzle");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
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

  const applied = await sql<{ filename: string; hash: string }[]>`
    SELECT filename, hash FROM __elevay_migrations
  `;
  const appliedMap = new Map(applied.map((r) => [r.filename, r.hash]));

  let newCount = 0;
  let skipCount = 0;

  for (const file of files) {
    const path = join(MIGRATIONS_DIR, file);
    const content = await readFile(path, "utf-8");
    const hash = createHash("sha256").update(content).digest("hex");

    if (appliedMap.has(file)) {
      const recordedHash = appliedMap.get(file)!;
      if (recordedHash !== hash) {
        console.warn(`[!] ${file}: hash mismatch — file changed since applied`);
      }
      skipCount++;
      continue;
    }

    console.log(`[+] applying ${file}`);
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(content);
        await tx`
          INSERT INTO __elevay_migrations (filename, hash)
          VALUES (${file}, ${hash})
        `;
      });
      newCount++;
    } catch (err) {
      console.error(`[X] ${file} failed:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  console.log(`Done. Applied ${newCount} new, skipped ${skipCount} already-applied.`);
  await sql.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
