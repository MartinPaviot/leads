/**
 * Make the "Institutions internationales romandes" ICP flag-driven, using the
 * classifier output (properties.is_intl_institution).
 *
 * Design (degrades gracefully — safe to apply BEFORE the recompute-wiring deploy):
 *   - geography IN romande            REQUIRED  (gates + Apollo-sources)
 *   - is_intl_institution EQ true     SOFT w=5  (the institution gate, via custom_property)
 *   - industry IN <cluster>           SOFT w=1  (narrows Apollo sourcing; small boost)
 *   - person_titles IN <decision>     SOFT      (sourcing-only; ignored in scoring)
 * Because the flag is SOFT (not required), code that doesn't yet evaluate
 * custom_property (the deployed cron until the PR ships) just treats it as
 * "no data" → the ICP behaves like the old industry-based one (no zero-out).
 * Once the wiring deploys, the flag dominates and every classified institution
 * (incl. the mis-tagged ones) lands in-ICP.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-institutions-flag-icp.ts
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-institutions-flag-icp.ts --apply
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
import { icpCriteria, icpFieldCatalog } from "../src/db/schema";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const INSTITUTIONS_ICP = "93d0d667-94e0-451e-952c-d5431b641d05";
const LARGE_ICP = "0625310d-c736-4428-8288-30ac87beaf3d";
const FLAG_KEY = "is_intl_institution";

const INSTITUTION_INDUSTRIES = [
  "Nonprofit Organization Management", "International Affairs", "International Trade & Development",
  "Philanthropy", "Civic & Social Organization", "Fund-Raising",
];
const INSTITUTION_TITLES = [
  "Secretary General", "Secrétaire général", "Executive Director", "Director General",
  "Managing Director", "President", "CEO", "Chief Executive", "COO",
  "Head of IT", "CIO", "IT Director", "IT Manager", "Administrative Director",
];

async function main() {
  const apply = process.argv.includes("--apply");
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  const geoRow = (await db.execute(sql`
    SELECT value FROM icp_criteria WHERE icp_id = ${LARGE_ICP} AND field_key = 'geography' LIMIT 1
  `)) as unknown as Array<{ value: unknown }>;
  const geography = (geoRow[0]?.value as string[]) ?? [];

  const flagged = (await db.execute(sql`
    SELECT count(*)::int AS n FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL AND properties->>'is_intl_institution' = 'true'
  `)) as unknown as Array<{ n: number }>;
  console.log(`Flagged institutions in tenant: ${flagged[0].n}`);
  console.log(`Geography reused from "large": ${geography.length} regions`);
  console.log(`Plan for institutions ICP (${INSTITUTIONS_ICP}):`);
  console.log(`  geography IN [${geography.length}]   REQUIRED`);
  console.log(`  ${FLAG_KEY} EQ true            SOFT w=5`);
  console.log(`  industry IN [${INSTITUTION_INDUSTRIES.length}]   SOFT w=1`);
  console.log(`  person_titles IN [${INSTITUTION_TITLES.length}]  SOFT (sourcing-only)`);
  console.log(`  + catalog entry ${FLAG_KEY} (custom_property, sourcePath=${FLAG_KEY})`);

  if (!apply) {
    console.log(`\n(dry-run — pass --apply)`);
    await client.end();
    return;
  }

  // 1. Catalog entry for the flag (idempotent on tenant+fieldKey).
  const existing = (await db.execute(sql`
    SELECT id FROM icp_field_catalog WHERE tenant_id = ${TENANT} AND field_key = ${FLAG_KEY} LIMIT 1
  `)) as unknown as Array<{ id: string }>;
  if (existing[0]) {
    await db.execute(sql`
      UPDATE icp_field_catalog SET source='custom_property', value_type='boolean',
        operators='["eq","exists"]'::jsonb, source_path=${FLAG_KEY}, label='International institution'
      WHERE id = ${existing[0].id}
    `);
    console.log(`Catalog entry updated (${existing[0].id})`);
  } else {
    await db.insert(icpFieldCatalog).values({
      tenantId: TENANT, fieldKey: FLAG_KEY, label: "International institution",
      source: "custom_property", valueType: "boolean", operators: ["eq", "exists"],
      sourcePath: FLAG_KEY,
    });
    console.log(`Catalog entry inserted`);
  }

  // 2. Replace the institutions ICP criteria with the flag-driven set.
  await db.delete(icpCriteria).where(sql`icp_id = ${INSTITUTIONS_ICP}`);
  await db.insert(icpCriteria).values([
    { icpId: INSTITUTIONS_ICP, fieldKey: "geography", operator: "in", value: geography, weight: 1, isRequired: true },
    { icpId: INSTITUTIONS_ICP, fieldKey: FLAG_KEY, operator: "eq", value: true, weight: 5, isRequired: false },
    { icpId: INSTITUTIONS_ICP, fieldKey: "industry", operator: "in", value: INSTITUTION_INDUSTRIES, weight: 1, isRequired: false },
    { icpId: INSTITUTIONS_ICP, fieldKey: "person_titles", operator: "in", value: INSTITUTION_TITLES, weight: 1, isRequired: false },
  ]);
  console.log(`Institutions ICP criteria replaced (flag-driven).`);
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
