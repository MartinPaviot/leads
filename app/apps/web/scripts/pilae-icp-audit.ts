/**
 * READ-ONLY audit: what is Pilae's ACTUAL ICP, and is the size criterion
 * explicit + enforced? Also quantifies the "permissions" (off-ICP that entered
 * or survived) on the live company set. Changes nothing.
 *
 *   pnpm dlx tsx --env-file=.env.local scripts/pilae-icp-audit.ts
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  // 1. ICPs for the tenant.
  const icps = (await db.execute(sql`
    SELECT id, name, status, priority, deleted_at IS NOT NULL AS deleted
    FROM icps WHERE tenant_id = ${TENANT}
    ORDER BY priority
  `)) as unknown as Array<{ id: string; name: string; status: string; priority: number; deleted: boolean }>;

  console.log(`=== ICPs for Pilae (${icps.length}) ===`);
  for (const i of icps) console.log(`  [${i.status}${i.deleted ? "/DELETED" : ""}] prio=${i.priority}  ${i.name}  (${i.id})`);

  // 2. Criteria per non-deleted ICP, joined to catalog for source/apolloParam.
  for (const i of icps.filter((x) => !x.deleted)) {
    const crit = (await db.execute(sql`
      SELECT c.field_key, c.operator, c.value, c.weight, c.is_required,
             cat.source, cat.apollo_param, cat.value_type
      FROM icp_criteria c
      LEFT JOIN icp_field_catalog cat
        ON cat.field_key = c.field_key
       AND (cat.tenant_id = ${TENANT} OR cat.tenant_id IS NULL)
      WHERE c.icp_id = ${i.id}
      ORDER BY c.is_required DESC, c.field_key
    `)) as unknown as Array<{
      field_key: string; operator: string; value: unknown; weight: number;
      is_required: boolean; source: string | null; apollo_param: string | null; value_type: string | null;
    }>;
    console.log(`\n--- Criteria for "${i.name}" [${i.status}] (${crit.length}) ---`);
    for (const c of crit) {
      const req = c.is_required ? "REQUIRED" : "soft";
      console.log(
        `  ${c.field_key.padEnd(22)} ${c.operator.padEnd(8)} ${JSON.stringify(c.value).padEnd(26)} w=${c.weight} [${req}] | src=${c.source ?? "?"} apollo=${c.apollo_param ?? "-"}`
      );
    }
    const sizeCrit = crit.find((c) => c.field_key === "employee_count");
    console.log(`  >> SIZE criterion present? ${sizeCrit ? "YES" : "NO"}${sizeCrit ? `  required? ${sizeCrit.is_required ? "YES (hard)" : "NO (soft)"}  value=${JSON.stringify(sizeCrit.value)}` : ""}`);
  }

  // 3. "Permissions" footprint on live companies.
  console.log(`\n=== Live company set — enforcement footprint ===`);
  const [tot] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Array<{ n: number }>;
  console.log(`  live companies: ${tot.n}`);

  const [exc] = (await db.execute(sql`
    SELECT count(*)::int AS n FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL AND excluded_reason IS NOT NULL
  `)) as unknown as Array<{ n: number }>;
  console.log(`  with excludedReason set (manual anti-ICP): ${exc.n}`);

  const score = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE score IS NULL)::int AS no_score,
      count(*) FILTER (WHERE score < 50)::int AS below_50,
      count(*) FILTER (WHERE score >= 50)::int AS at_or_above_50,
      round(avg(score)::numeric, 1) AS avg_score
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Array<{ no_score: number; below_50: number; at_or_above_50: number; avg_score: number }>;
  console.log(`  fit score: NULL=${score[0].no_score}  <50=${score[0].below_50}  >=50=${score[0].at_or_above_50}  avg=${score[0].avg_score}`);

  const bySource = (await db.execute(sql`
    SELECT coalesce(source_system, '(null)') AS src, count(*)::int AS n
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC
  `)) as unknown as Array<{ src: string; n: number }>;
  console.log(`  by source_system:`);
  for (const r of bySource) console.log(`    ${r.src.padEnd(12)} ${r.n}`);

  // 4. Country footprint — is geography being respected?
  const byCountry = (await db.execute(sql`
    SELECT lower(coalesce(properties->>'country','(none)')) AS country, count(*)::int AS n
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC LIMIT 12
  `)) as unknown as Array<{ country: string; n: number }>;
  console.log(`  by country (top 12):`);
  for (const r of byCountry) console.log(`    ${r.country.padEnd(16)} ${r.n}`);

  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
