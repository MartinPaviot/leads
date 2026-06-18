/** Verify the institution flag landed: counts from the DB. Read-only. */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });
  const [r] = (await db.execute(sql`
    SELECT
      count(*)::int AS live,
      count(*) FILTER (WHERE properties ? 'is_intl_institution')::int AS has_flag,
      count(*) FILTER (WHERE properties->>'is_intl_institution' = 'true')::int AS institutions
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Array<{ live: number; has_flag: number; institutions: number }>;
  console.log(`live=${r.live}  has_flag=${r.has_flag}  institutions=${r.institutions}`);
  const byKind = (await db.execute(sql`
    SELECT properties#>>'{institutionClass,kind}' AS kind, count(*)::int AS n
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND properties ? 'institutionClass'
    GROUP BY 1 ORDER BY 2 DESC
  `)) as unknown as Array<{ kind: string; n: number }>;
  for (const k of byKind) console.log(`  ${(k.kind ?? "?").padEnd(24)} ${k.n}`);

  // Ownership: which ICP is primary for each company (post-recompute).
  const INST = "93d0d667-94e0-451e-952c-d5431b641d05";
  const byIcp = (await db.execute(sql`
    SELECT coalesce(i.name, CASE WHEN c.properties->>'primaryIcpId' IS NULL THEN '(unowned)' ELSE '(other)' END) AS icp,
           count(*)::int AS n
    FROM companies c
    LEFT JOIN icps i ON i.id = c.properties->>'primaryIcpId'
    WHERE c.tenant_id = ${TENANT} AND c.deleted_at IS NULL
    GROUP BY 1 ORDER BY 2 DESC
  `)) as unknown as Array<{ icp: string; n: number }>;
  console.log(`\n--- primary ICP ownership ---`);
  for (const r of byIcp) console.log(`  ${(r.icp ?? "?").padEnd(40)} ${r.n}`);

  const [own] = (await db.execute(sql`
    SELECT
      count(*) FILTER (WHERE properties->>'is_intl_institution' = 'true')::int AS flagged,
      count(*) FILTER (WHERE properties->>'is_intl_institution' = 'true' AND properties->>'primaryIcpId' = ${INST})::int AS in_inst_icp,
      count(*) FILTER (WHERE properties->>'is_intl_institution' = 'true' AND coalesce((properties->>'state'),'') ~* 'gen|vaud|neuch|valais|wallis|fribourg|freiburg|jura')::int AS flagged_romand
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Array<{ flagged: number; in_inst_icp: number; flagged_romand: number }>;
  console.log(`\n--- institutions ICP coverage ---`);
  console.log(`  flagged total=${own.flagged}  flagged romand=${own.flagged_romand}  owned by institutions ICP=${own.in_inst_icp}`);
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
