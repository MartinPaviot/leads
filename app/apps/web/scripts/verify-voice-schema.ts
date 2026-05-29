/**
 * Read-only verification of the voice cold call schema (0055).
 */

import postgres from "postgres";

const EXPECTED_TABLES = [
  "calls",
  "voicemail_templates",
  "do_not_call_list",
  "phone_number_pool",
  "voice_usage_monthly",
];

const EXPECTED_ENUM = "call_outcome";

const EXPECTED_INDEXES = [
  "calls_twilio_sid_idx",
  "calls_tenant_idx",
  "calls_contact_idx",
  "calls_started_idx",
  "calls_outcome_idx",
  "vm_templates_tenant_idx",
  "dnc_phone_tenant_idx",
  "dnc_phone_idx",
  "pool_e164_idx",
  "pool_tenant_idx",
  "pool_area_idx",
  "voice_usage_tenant_month_idx",
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

  console.log("\n=== Tables ===");
  for (const t of EXPECTED_TABLES) {
    const rows = await sql<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${t}
    `;
    if (rows.length > 0) {
      console.log(`  [OK] ${t}`);
      pass++;
    } else {
      console.log(`  [FAIL] ${t} MISSING`);
      fail++;
    }
  }

  console.log("\n=== Enum ===");
  const enumRows = await sql<{ typname: string }[]>`
    SELECT typname FROM pg_type WHERE typname = ${EXPECTED_ENUM}
  `;
  if (enumRows.length > 0) {
    console.log(`  [OK] ${EXPECTED_ENUM}`);
    pass++;
  } else {
    console.log(`  [FAIL] ${EXPECTED_ENUM} MISSING`);
    fail++;
  }

  console.log("\n=== Indexes ===");
  for (const i of EXPECTED_INDEXES) {
    const rows = await sql<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${i}
    `;
    if (rows.length > 0) {
      console.log(`  [OK] ${i}`);
      pass++;
    } else {
      console.log(`  [FAIL] ${i} MISSING`);
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
