/**
 * Local logical backup of the production DB — the safety net while the
 * Supabase project is on Free (no managed backups / PITR).
 *
 * Dumps every public BASE TABLE to NDJSON under the gitignored
 * `_credentials/db-backups/<ISO-ts>/`, then prunes to the newest N snapshots.
 * Run on a schedule (see the daily scheduled task) for recurring coverage:
 *   npx tsx --env-file=.env.local scripts/backup-prod.ts
 *
 * Not a substitute for managed PITR — upgrade the Supabase project (or wire
 * the cloud cron to Vercel Blob) when ready. This is the zero-infra stop-gap.
 */
import { db } from "../src/db";
import { sql } from "drizzle-orm";
import * as fs from "fs";
import * as path from "path";

const KEEP = 7; // retain the newest N snapshots

function safeStringify(row: unknown): string {
  return JSON.stringify(row, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

(async () => {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const root = path.resolve(process.cwd(), "..", "..", ".."); // app/apps/web → repo root
  const baseDir = path.join(root, "_credentials", "db-backups");
  const dir = path.join(baseDir, ts);
  fs.mkdirSync(dir, { recursive: true });

  const tablesRes = (await db.execute(
    sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`,
  )) as unknown as Array<{ table_name: string }>;
  const tables = tablesRes.map((r) => r.table_name);

  const manifest: Record<string, number> = {};
  let total = 0;
  for (const t of tables) {
    const rows = (await db.execute(sql.raw(`select * from "${t}"`))) as unknown as unknown[];
    fs.writeFileSync(path.join(dir, `${t}.ndjson`), rows.map(safeStringify).join("\n"));
    manifest[t] = rows.length;
    total += rows.length;
  }
  fs.writeFileSync(
    path.join(dir, "_manifest.json"),
    JSON.stringify({ takenAt: ts, host: "wdgwytpaxuvgigqgzxrw (eu-central-1)", tables: manifest, totalRows: total }, null, 2),
  );

  // Retention: keep the newest KEEP snapshots, delete the rest.
  const snapshots = fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  let pruned = 0;
  for (const old of snapshots.slice(KEEP)) {
    fs.rmSync(path.join(baseDir, old), { recursive: true, force: true });
    pruned++;
  }

  console.log(`BACKUP_OK  tables=${tables.length}  rows=${total}  kept=${Math.min(snapshots.length, KEEP)}  pruned=${pruned}`);
  console.log(`BACKUP_DIR=${dir}`);
  process.exit(0);
})().catch((e) => {
  console.error("BACKUP_FAIL", e?.message || e);
  process.exit(1);
});
