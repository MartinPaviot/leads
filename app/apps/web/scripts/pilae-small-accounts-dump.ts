/**
 * READ-ONLY dump of the < 50-employee Pilae companies, with the fields needed
 * to classify "international institution / NGO / IGO / federation" (KEEP) vs
 * "commercial SMB" (DELETE). Writes JSON to _research/raw/ so the classification
 * is auditable and the delete step can read back exact ids.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-small-accounts-dump.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { writeFileSync } from "node:fs";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

type Row = {
  id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  description: string | null;
  size: string | null;
  source: string | null;
  emp: string | null;
  country: string | null;
  state: string | null;
  contacts: number;
};

function bucketHigh(size: string | null): number | null {
  if (!size) return null;
  const nums = size.replace(/,/g, "").match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  return parseInt(nums[nums.length - 1], 10);
}
function bucketLow(size: string | null): number | null {
  if (!size) return null;
  const nums = size.replace(/,/g, "").match(/\d+/g);
  return nums ? parseInt(nums[0], 10) : null;
}
// Same "< 50 evidence" test as the diagnostic.
function isUnder50(r: Row): boolean {
  if (r.emp && /^\d+$/.test(r.emp)) {
    const n = parseInt(r.emp, 10);
    if (n > 0) return n < 50;
  }
  const hi = bucketHigh(r.size);
  if (hi !== null) {
    if (hi < 50) return true;
    const lo = bucketLow(r.size);
    if (lo !== null && lo >= 50) return false;
  }
  return false;
}

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });
  const rows = (await db.execute(sql`
    SELECT c.id, c.name, c.domain, c.industry, c.size, c.source_system AS source,
      left(coalesce(c.description, ''), 240) AS description,
      c.properties->>'employee_count' AS emp,
      c.properties->>'country' AS country,
      c.properties->>'state'   AS state,
      (SELECT count(*)::int FROM contacts ct
         WHERE ct.company_id = c.id AND ct.deleted_at IS NULL) AS contacts
    FROM companies c
    WHERE c.tenant_id = ${TENANT} AND c.deleted_at IS NULL
  `)) as unknown as Row[];

  const under = rows.filter(isUnder50);
  const out = under
    .map((r) => ({
      id: r.id,
      name: r.name,
      size: r.emp && /^\d+$/.test(r.emp) ? r.emp : r.size,
      industry: r.industry,
      domain: r.domain,
      source: r.source,
      state: r.state,
      contacts: r.contacts,
      description: r.description,
    }))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const path = "../../../../_research/raw/pilae-small-accounts-2026-06-16.json";
  writeFileSync(new URL(path, import.meta.url), JSON.stringify(out, null, 2));
  console.log(`Wrote ${out.length} companies to _research/raw/pilae-small-accounts-2026-06-16.json`);
  // Also echo a compact table to stdout for a quick eyeball.
  for (const c of out) {
    console.log(
      `${(c.name || "").slice(0, 40).padEnd(40)} | sz=${String(c.size ?? "-").padEnd(6)} | ${(c.industry || "-").slice(0, 28).padEnd(28)} | ${(c.domain || "-").slice(0, 26).padEnd(26)} | ct=${c.contacts}`
    );
  }
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
