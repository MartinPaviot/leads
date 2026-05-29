/**
 * One-shot verification of the Pilae schema additions (0051-0054).
 * Read-only — queries information_schema only.
 */

import postgres from "postgres";

const EXPECTED_COLUMNS: Array<{
  table: string;
  column: string;
  fromMigration: string;
}> = [
  { table: "companies", column: "excluded_reason", fromMigration: "0051" },
  { table: "companies", column: "excluded_at", fromMigration: "0051" },
  { table: "deals", column: "project_amount", fromMigration: "0052" },
  { table: "deals", column: "platform_arr", fromMigration: "0052" },
  { table: "companies", column: "priority_score", fromMigration: "0053" },
  {
    table: "companies",
    column: "priority_score_computed_at",
    fromMigration: "0053",
  },
];

const EXPECTED_TABLES = ["playbook_entries"];

const EXPECTED_INDEXES = [
  "companies_excluded_at_idx",
  "companies_priority_score_idx",
  "playbook_entries_tenant_type_idx",
  "playbook_entries_source_idx",
  "playbook_entries_perf_idx",
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const sql = postgres(url, { max: 1 });

  let pass = 0;
  let fail = 0;

  console.log("\n=== Column presence ===");
  for (const ec of EXPECTED_COLUMNS) {
    const rows = await sql<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ${ec.table} AND column_name = ${ec.column}
    `;
    if (rows.length > 0) {
      console.log(`  [OK] ${ec.table}.${ec.column} (from ${ec.fromMigration})`);
      pass++;
    } else {
      console.log(
        `  [FAIL] ${ec.table}.${ec.column} (from ${ec.fromMigration}) MISSING`,
      );
      fail++;
    }
  }

  console.log("\n=== Table presence ===");
  for (const tname of EXPECTED_TABLES) {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tname}
    `;
    if (rows.length > 0) {
      console.log(`  [OK] ${tname}`);
      pass++;
    } else {
      console.log(`  [FAIL] ${tname} MISSING`);
      fail++;
    }
  }

  console.log("\n=== Index presence ===");
  for (const iname of EXPECTED_INDEXES) {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = ${iname}
    `;
    if (rows.length > 0) {
      console.log(`  [OK] ${iname}`);
      pass++;
    } else {
      console.log(`  [FAIL] ${iname} MISSING`);
      fail++;
    }
  }

  console.log(`\nTotal: ${pass} passed, ${fail} failed`);
  await sql.end();
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
