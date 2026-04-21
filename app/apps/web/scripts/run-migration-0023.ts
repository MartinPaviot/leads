/**
 * One-shot migration runner for 0023_custom_signals.
 *
 * Drizzle-kit's journal is out-of-sync with the actual applied
 * migrations in this repo (manual SQL files from 0012 onwards),
 * so re-generating or running `drizzle-kit migrate` would propose
 * a huge destructive diff. This script applies our specific SQL
 * file directly, using the Neon HTTP driver.
 *
 * Run with: `npx tsx scripts/run-migration-0023.ts`
 */

import { config } from "dotenv";
import { readFileSync } from "node:fs";
import postgres from "postgres";
import { resolve } from "node:path";

config({ path: ".env.local" });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set. Check .env.local.");
  process.exit(1);
}

const sqlPath = resolve(__dirname, "..", "drizzle", "0023_custom_signals.sql");
const raw = readFileSync(sqlPath, "utf8");

// Statements are separated by the Drizzle convention marker
// `--> statement-breakpoint`. The `postgres` library executes one
// statement per template tag; easier to split ourselves and loop.
const statements = raw
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

const sql = postgres(DATABASE_URL, {
  max: 1,
  prepare: false, // pgbouncer transaction-mode pooling doesn't support prepared statements
});

async function main() {
  console.log(`Applying 0023_custom_signals — ${statements.length} statement(s)`);
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    const preview = stmt.slice(0, 80).replace(/\s+/g, " ");
    console.log(`  [${i + 1}/${statements.length}] ${preview}${stmt.length > 80 ? "…" : ""}`);
    try {
      await sql.unsafe(stmt);
    } catch (err) {
      console.error(`  FAILED at statement ${i + 1}:`, (err as Error).message);
      await sql.end({ timeout: 1 });
      process.exit(2);
    }
  }
  console.log("Done — custom_signals is live.");
  await sql.end({ timeout: 1 });
  process.exit(0);
}

main();
