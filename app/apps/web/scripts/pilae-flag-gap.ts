/** Where do the 227 flagged institutions land? Read-only. */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });
  // Flagged institutions by owner + by country.
  const rows = (await db.execute(sql`
    SELECT
      coalesce(i.name, CASE WHEN c.properties->>'primaryIcpId' IS NULL THEN '(unowned)' ELSE '(other)' END) AS owner,
      lower(coalesce(c.properties->>'country','(none)')) AS country,
      count(*)::int AS n
    FROM companies c
    LEFT JOIN icps i ON i.id = c.properties->>'primaryIcpId'
    WHERE c.tenant_id = ${TENANT} AND c.deleted_at IS NULL
      AND c.properties->>'is_intl_institution' = 'true'
    GROUP BY 1,2 ORDER BY 3 DESC
  `)) as unknown as Array<{ owner: string; country: string; n: number }>;
  console.log("Flagged institutions by owner × country:");
  for (const r of rows) console.log(`  ${(r.owner ?? "?").padEnd(38)} ${r.country.padEnd(14)} ${r.n}`);

  // Sample of flagged + unowned (the gap) with why.
  const gap = (await db.execute(sql`
    SELECT c.name, c.size, c.properties->>'employee_count' AS emp,
      c.properties->>'country' AS country, c.properties->>'state' AS state,
      c.properties#>>'{institutionClass,kind}' AS kind, c.score
    FROM companies c
    WHERE c.tenant_id = ${TENANT} AND c.deleted_at IS NULL
      AND c.properties->>'is_intl_institution' = 'true'
      AND c.properties->>'primaryIcpId' IS NULL
    ORDER BY c.name LIMIT 40
  `)) as unknown as Array<{ name: string; size: string; emp: string; country: string; state: string; kind: string; score: number }>;
  console.log(`\nFlagged + UNOWNED (gap), up to 40:`);
  for (const r of gap) console.log(`  ${(r.name||"").slice(0,38).padEnd(38)} sz=${String(r.size??r.emp??"-").padEnd(6)} ${(r.country||"-").padEnd(12)} state=${(r.state||"-").slice(0,18).padEnd(18)} ${r.kind}`);
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
