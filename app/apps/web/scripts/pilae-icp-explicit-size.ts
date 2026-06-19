/**
 * Make SIZE explicit in Pilae's ICP (Martin 2026-06-16, choice "2 ICP"):
 *   1. "Suisse romande — large": employee_count -> between {min:100,max:1000}
 *      AND mark it REQUIRED (hard floor; also flips the Apollo search to 100,1000).
 *   2. Create ICP "Institutions internationales romandes": geo Romande (required)
 *      + industry in {institution cluster} (required) + decision-maker titles
 *      (soft), NO size floor — so small NGOs/IGOs/affairs orgs stay in-ICP and
 *      keep getting sourced.
 *
 * Dry-run by default: prints the size-band impact + how many of the 21 kept
 * institutions the new institutions ICP covers by industry. Pass --apply to write.
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-icp-explicit-size.ts
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-icp-explicit-size.ts --apply
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { icps, icpCriteria } from "../src/db/schema";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const LARGE_ICP = "0625310d-c736-4428-8288-30ac87beaf3d";
const INSTITUTIONS_NAME = "Institutions internationales romandes";

// Institution-leaning Apollo industries that carry low commercial-SMB risk.
// (Sports / media / aviation / logistics / civil-eng / environmental are
// deliberately EXCLUDED: they'd re-pull commercial SMBs — the kept institutions
// in those tags need a custom classifier, flagged as follow-up.)
const INSTITUTION_INDUSTRIES = [
  "Nonprofit Organization Management",
  "International Affairs",
  "International Trade & Development",
  "Philanthropy",
  "Civic & Social Organization",
  "Fund-Raising",
];
const INSTITUTION_TITLES = [
  "Secretary General", "Secrétaire général", "Executive Director", "Director General",
  "Managing Director", "President", "CEO", "Chief Executive", "COO",
  "Head of IT", "CIO", "IT Director", "IT Manager", "Administrative Director",
];

function bucketLow(size: string | null): number | null {
  if (!size) return null;
  const nums = size.replace(/,/g, "").match(/\d+/g);
  return nums ? parseInt(nums[0], 10) : null;
}
// Product's toEmployeeCount semantics: employee_count first, else LOW bound of size.
function empLow(emp: string | null, size: string | null): number | null {
  if (emp && /^\d+$/.test(emp)) { const n = parseInt(emp, 10); if (n > 0) return n; }
  return bucketLow(size);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  // --- read the large ICP geography list (reuse for institutions, no drift) ---
  const geoRow = (await db.execute(sql`
    SELECT value FROM icp_criteria WHERE icp_id = ${LARGE_ICP} AND field_key = 'geography' LIMIT 1
  `)) as unknown as Array<{ value: unknown }>;
  const geography = (geoRow[0]?.value as string[]) ?? [];

  // --- impact: size bands across live companies ---
  const rows = (await db.execute(sql`
    SELECT properties->>'employee_count' AS emp, size, industry
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Array<{ emp: string | null; size: string | null; industry: string | null }>;
  const band = { unknown: 0, under50: 0, b50_99: 0, in100_1000: 0, over1000: 0 };
  for (const r of rows) {
    const n = empLow(r.emp, r.size);
    if (n === null) band.unknown++;
    else if (n < 50) band.under50++;
    else if (n < 100) band.b50_99++;
    else if (n <= 1000) band.in100_1000++;
    else band.over1000++;
  }
  console.log(`=== Impact of a 100-1000 REQUIRED floor on "large" (live ${rows.length}) ===`);
  console.log(`  size unknown:        ${band.unknown}  -> required size fails => off-ICP (unless other ICP)`);
  console.log(`  < 50:                ${band.under50}  (the kept institutions)`);
  console.log(`  50-99 (below floor): ${band.b50_99}  -> NEW off-ICP for "large"`);
  console.log(`  100-1000 (in floor): ${band.in100_1000}  -> stay in "large"`);
  console.log(`  > 1000:              ${band.over1000}  -> above ceiling (soft on ceiling? becomes off if required)`);

  // --- institutions ICP coverage of the 21 kept <50 (by industry) ---
  const kept = rows.filter((r) => { const n = empLow(r.emp, r.size); return n !== null && n < 50; });
  const ind = new Set(INSTITUTION_INDUSTRIES.map((s) => s.toLowerCase()));
  const covered = kept.filter((r) => r.industry && ind.has(r.industry.toLowerCase()));
  console.log(`\n=== Institutions ICP coverage (industry cluster) ===`);
  console.log(`  kept <50 institutions: ${kept.length}  covered by industry cluster: ${covered.length}  uncovered: ${kept.length - covered.length}`);
  const uncovered = kept.filter((r) => !(r.industry && ind.has(r.industry.toLowerCase())));
  const uncByIndustry: Record<string, number> = {};
  for (const r of uncovered) uncByIndustry[r.industry || "(none)"] = (uncByIndustry[r.industry || "(none)"] || 0) + 1;
  console.log(`  uncovered by industry (need custom classifier): ${JSON.stringify(uncByIndustry)}`);

  if (!apply) {
    console.log(`\n(dry-run — pass --apply to: set large size 100-1000 REQUIRED + create "${INSTITUTIONS_NAME}")`);
    await client.end();
    return;
  }

  // --- 1. large: employee_count -> 100-1000, required ---
  const up = await db.execute(sql`
    UPDATE icp_criteria SET value = '{"min":100,"max":1000}'::jsonb, is_required = true
    WHERE icp_id = ${LARGE_ICP} AND field_key = 'employee_count'
    RETURNING id
  `);
  console.log(`\nUpdated large employee_count -> 100-1000 REQUIRED (rows: ${(up as unknown as unknown[]).length})`);

  // --- 2. institutions ICP (idempotent by name) ---
  const existing = (await db.execute(sql`
    SELECT id FROM icps WHERE tenant_id = ${TENANT} AND name = ${INSTITUTIONS_NAME} AND deleted_at IS NULL LIMIT 1
  `)) as unknown as Array<{ id: string }>;
  let instId: string;
  if (existing[0]) {
    instId = existing[0].id;
    await db.delete(icpCriteria).where(sql`icp_id = ${instId}`);
    console.log(`Institutions ICP exists (${instId}) — replacing its criteria`);
  } else {
    const ins = (await db.insert(icps).values({
      tenantId: TENANT, name: INSTITUTIONS_NAME, status: "active", priority: 1,
      description: "Romande international institutions (NGO/IGO/affairs/foundations) — small headcount, sovereignty targets. Martin 2026-06-16.",
      metadata: { createdBy: "pilae-icp-explicit-size", note: "international institutions segment" },
    }).returning({ id: icps.id })) as unknown as Array<{ id: string }>;
    instId = ins[0].id;
    console.log(`Created institutions ICP: ${instId}`);
  }
  await db.insert(icpCriteria).values([
    { icpId: instId, fieldKey: "geography", operator: "in", value: geography, weight: 1, isRequired: true },
    { icpId: instId, fieldKey: "industry", operator: "in", value: INSTITUTION_INDUSTRIES, weight: 1, isRequired: true },
    { icpId: instId, fieldKey: "person_titles", operator: "in", value: INSTITUTION_TITLES, weight: 1, isRequired: false },
  ]);
  console.log(`Inserted institutions criteria (geo required, industry required, titles soft, no size floor)`);

  console.log(`\nDONE. NOTE: company_icp_fit / companies.score refresh on the next fit recompute, not instantly.`);
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
