/**
 * SOC2 — annual backup restore drill (Policy 08, BC/DR).
 *
 * Restores an application-level encrypted dump (NDJSON per table, see
 * _credentials/db-backups/README.md) into a throwaway `restore_drill`
 * schema on the target database, verifies row counts against the dump's
 * _manifest.json, spot-checks content integrity, prints an evidence
 * summary, then drops the schema.
 *
 * This drills OUR portable dump path. The provider path (Supabase
 * daily backups / PITR) is exercised through the Supabase console and
 * is documented in the BC/DR plan.
 *
 * Run:  npx tsx scripts/restore-drill.ts <extracted-dump-dir>
 * Env:  DATABASE_URL (admin)
 */
import postgres from "postgres";
import { readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";

const SCHEMA = "restore_drill";
const BATCH = 500;

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("usage: restore-drill.ts <extracted-dump-dir>");
  const manifest = JSON.parse(readFileSync(join(dir, "_manifest.json"), "utf8")) as {
    takenAt: string;
    host: string;
    tables: Record<string, number>;
  };

  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const startedAt = Date.now();
  const results: Array<{ table: string; expected: number; restored: number; ok: boolean }> = [];

  try {
    await s.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await s.unsafe(`CREATE SCHEMA ${SCHEMA}`);

    const files = readdirSync(dir).filter((f) => f.endsWith(".ndjson"));
    for (const file of files) {
      const table = basename(file, ".ndjson");
      const expected = manifest.tables[table] ?? 0;
      const raw = readFileSync(join(dir, file), "utf8");
      const lines = raw.split("\n").filter((l) => l.trim().length > 0);

      // Insert as text, cast server-side: the driver double-encodes string
      // params bound straight into a jsonb context (docs became scalars).
      await s.unsafe(`CREATE TABLE ${SCHEMA}."${table}" (raw text, doc jsonb)`);
      for (let i = 0; i < lines.length; i += BATCH) {
        const chunk = lines.slice(i, i + BATCH);
        const placeholders = chunk.map((_, j) => `($${j + 1})`).join(",");
        await s.unsafe(
          `INSERT INTO ${SCHEMA}."${table}" (raw) VALUES ${placeholders}`,
          chunk.map((l) => l.trim()),
        );
      }
      await s.unsafe(`UPDATE ${SCHEMA}."${table}" SET doc = raw::jsonb`);
      const [{ n }] = await s.unsafe(
        `SELECT count(*)::int AS n FROM ${SCHEMA}."${table}"`,
      );
      results.push({ table, expected, restored: n as number, ok: n === expected });
    }

    // Content spot-check: a restored contact's email must exist in the
    // restored companies/contacts coherently (id linkage intact).
    // Dump rows carry Drizzle's camelCase keys (companyId), not column names.
    const [probe] = await s.unsafe(`
      SELECT c.doc->>'email' AS email,
             EXISTS (
               SELECT 1 FROM ${SCHEMA}."companies" co
               WHERE co.doc->>'id' = COALESCE(c.doc->>'companyId', c.doc->>'company_id')
             ) AS company_link_ok
      FROM ${SCHEMA}."contacts" c
      WHERE c.doc->>'email' IS NOT NULL
        AND COALESCE(c.doc->>'companyId', c.doc->>'company_id') IS NOT NULL
      LIMIT 1
    `);

    const mismatches = results.filter((r) => !r.ok);
    const totalRows = results.reduce((a, r) => a + r.restored, 0);
    console.log(
      JSON.stringify(
        {
          dump: manifest.takenAt,
          sourceHost: manifest.host,
          tablesRestored: results.length,
          totalRowsRestored: totalRows,
          countMismatches: mismatches,
          spotCheck: probe
            ? { emailPresent: !!probe.email, companyLinkOk: probe.company_link_ok }
            : "no contact with company_id found",
          durationSec: Math.round((Date.now() - startedAt) / 1000),
          verdict: mismatches.length === 0 ? "PASS" : "FAIL",
        },
        null,
        2,
      ),
    );
  } finally {
    await s.unsafe(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await s.end();
  }
}

main().catch((e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  process.exit(1);
});
