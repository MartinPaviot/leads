/**
 * Diagnostic (READ-ONLY): why does Pilae have accounts with < 50 employees,
 * and how many are there? Prints the size-signal coverage, the <50 set broken
 * down by source / signal / geography, and a sample. Changes nothing.
 *
 *   npx tsx --env-file=.env.local scripts/pilae-small-accounts-diagnose.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

// SIRENE tranche d'effectif salarié -> [low, high].
const SIRENE_BANDS: Record<string, [number, number]> = {
  "00": [0, 0], "01": [1, 2], "02": [3, 5], "03": [6, 9],
  "11": [10, 19], "12": [20, 49], "21": [50, 99], "22": [100, 199],
  "31": [200, 249], "32": [250, 499], "41": [500, 999], "42": [1000, 1999],
  "51": [2000, 4999], "52": [5000, 9999], "53": [10000, 99999],
};

type Row = {
  id: string;
  name: string | null;
  size: string | null;
  source: string | null;
  emp: string | null;
  effectif: string | null;
  country: string | null;
  state: string | null;
  score: number | null;
  contacts: number;
};

// Parse the upper bound of a free-form size bucket like "11-50", "201-1,000",
// "1-10", "10,001+". Returns null if unparseable.
function bucketHigh(size: string | null): number | null {
  if (!size) return null;
  const nums = size.replace(/,/g, "").match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  return parseInt(nums[nums.length - 1], 10);
}

// Best-evidence size classification for "< 50 employees".
// Returns the signal used + verdict: "under50" | "atleast50" | "unknown".
function classify(r: Row): { verdict: "under50" | "atleast50" | "unknown"; via: string } {
  // 1. Explicit employee_count (Apollo estimated_num_employees) — most granular.
  if (r.emp && /^\d+$/.test(r.emp)) {
    const n = parseInt(r.emp, 10);
    if (n > 0) return { verdict: n < 50 ? "under50" : "atleast50", via: "employee_count" };
  }
  // 2. SIRENE band (French registry).
  if (r.effectif && SIRENE_BANDS[r.effectif]) {
    const [, high] = SIRENE_BANDS[r.effectif];
    // Entire band under 50 => definitely <50. Band starting >=50 => not <50.
    if (high < 50) return { verdict: "under50", via: "effectif_tranche" };
    if (SIRENE_BANDS[r.effectif][0] >= 50) return { verdict: "atleast50", via: "effectif_tranche" };
    return { verdict: "unknown", via: "effectif_tranche(span)" };
  }
  // 3. Denormalized size bucket — only trust if upper bound < 50.
  const high = bucketHigh(r.size);
  if (high !== null) {
    if (high < 50) return { verdict: "under50", via: "size_bucket" };
    const lo = (() => {
      const nums = (r.size || "").replace(/,/g, "").match(/\d+/g);
      return nums ? parseInt(nums[0], 10) : null;
    })();
    if (lo !== null && lo >= 50) return { verdict: "atleast50", via: "size_bucket" };
    return { verdict: "unknown", via: "size_bucket(span)" };
  }
  return { verdict: "unknown", via: "no_signal" };
}

function tally(rows: Row[], key: (r: Row) => string) {
  const m: Record<string, number> = {};
  for (const r of rows) {
    const k = key(r) || "(none)";
    m[k] = (m[k] || 0) + 1;
  }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  const rows = (await db.execute(sql`
    SELECT c.id, c.name, c.size, c.source_system AS source, c.score,
      c.properties->>'employee_count'   AS emp,
      c.properties->>'effectif_tranche' AS effectif,
      c.properties->>'country'          AS country,
      c.properties->>'state'            AS state,
      (SELECT count(*)::int FROM contacts ct
         WHERE ct.company_id = c.id AND ct.deleted_at IS NULL) AS contacts
    FROM companies c
    WHERE c.tenant_id = ${TENANT} AND c.deleted_at IS NULL
  `)) as unknown as Row[];

  const under: Row[] = [], atleast: Row[] = [], unknown: Row[] = [];
  for (const r of rows) {
    const v = classify(r).verdict;
    (v === "under50" ? under : v === "atleast50" ? atleast : unknown).push(r);
  }

  console.log(`\n=== Pilae live companies: ${rows.length} ===`);
  console.log(`  < 50 employees (evidence):   ${under.length}`);
  console.log(`  >= 50 employees (evidence):  ${atleast.length}`);
  console.log(`  size unknown (no signal):     ${unknown.length}`);

  console.log(`\n--- Size-signal coverage (all live) ---`);
  let hasEmp = 0, hasEff = 0, hasBucket = 0, hasNone = 0;
  for (const r of rows) {
    const e = !!(r.emp && /^\d+$/.test(r.emp));
    const f = !!(r.effectif && SIRENE_BANDS[r.effectif]);
    const b = bucketHigh(r.size) !== null;
    if (e) hasEmp++; if (f) hasEff++; if (b) hasBucket++;
    if (!e && !f && !b) hasNone++;
  }
  console.log(`  has employee_count:   ${hasEmp}`);
  console.log(`  has effectif_tranche: ${hasEff}`);
  console.log(`  has size bucket:      ${hasBucket}`);
  console.log(`  has NO size signal:   ${hasNone}`);

  console.log(`\n--- <50 set by SOURCE ---`);
  for (const [k, n] of tally(under, (r) => r.source || "")) console.log(`  ${k}: ${n}`);

  console.log(`\n--- <50 set by SIGNAL used ---`);
  for (const [k, n] of tally(under, (r) => classify(r).via)) console.log(`  ${k}: ${n}`);

  console.log(`\n--- <50 set by COUNTRY ---`);
  for (const [k, n] of tally(under, (r) => (r.country || "").toLowerCase())) console.log(`  ${k}: ${n}`);

  const romandRe = /geneva|gen[eè]ve|vaud|neuch|valais|wallis|fribourg|freiburg|jura/i;
  const romand = under.filter((r) => r.state && romandRe.test(r.state)).length;
  console.log(`\n  of which Suisse romande (by state): ${romand}`);

  const withContacts = under.filter((r) => r.contacts > 0);
  const contactSum = under.reduce((s, r) => s + r.contacts, 0);
  console.log(`\n--- Cascade impact of removing the <50 set ---`);
  console.log(`  <50 accounts with >=1 live contact: ${withContacts.length}`);
  console.log(`  total live contacts under <50 accounts: ${contactSum}`);

  console.log(`\n--- Sample (up to 30) of the <50 set ---`);
  for (const r of under.slice(0, 30)) {
    const c = classify(r);
    console.log(
      `  ${(r.name || "(no name)").slice(0, 38).padEnd(38)} | emp=${(r.emp ?? "-").padEnd(5)} eff=${(r.effectif ?? "-").padEnd(3)} size=${(r.size ?? "-").padEnd(10)} | ${(r.source ?? "-").padEnd(8)} | ${(r.country ?? "-").padEnd(12)} | via=${c.via} | contacts=${r.contacts}`
    );
  }

  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
