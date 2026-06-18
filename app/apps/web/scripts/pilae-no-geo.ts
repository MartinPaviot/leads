/** Why do some companies have no geography? Inspect the no-geo set. Read-only. */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import * as schema from "../src/db/schema";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main() {
  const client = postgres(process.env.DATABASE_URL!, { max: 1 });
  const db = drizzle({ client, schema });

  // How many live companies have NO geography token at all?
  const [counts] = (await db.execute(sql`
    SELECT
      count(*)::int AS live,
      count(*) FILTER (WHERE coalesce(properties->>'country','')='' AND coalesce(properties->>'state','')=''
        AND coalesce(properties->>'city','')='' AND coalesce(properties->>'region','')='')::int AS no_geo
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
  `)) as unknown as Array<{ live: number; no_geo: number }>;
  console.log(`live=${counts.live}  no_geo=${counts.no_geo}\n`);

  // Dump the no-geo rows: how they got in + what enrichment ran + raw props keys.
  const rows = (await db.execute(sql`
    SELECT name, domain, source_system AS source, size,
      last_enriched_at AS enriched,
      properties->>'is_intl_institution' AS inst,
      properties->>'apollo_id' AS apollo_id,
      properties AS props
    FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND coalesce(properties->>'country','')='' AND coalesce(properties->>'state','')=''
      AND coalesce(properties->>'city','')='' AND coalesce(properties->>'region','')=''
    ORDER BY name
  `)) as unknown as Array<{ name: string; domain: string; source: string; size: string; enriched: string; inst: string; apollo_id: string; props: Record<string, unknown> }>;
  for (const r of rows) {
    const keys = Object.keys(r.props || {}).sort().join(", ");
    console.log(`• ${r.name}`);
    console.log(`    domain=${r.domain ?? "-"}  source=${r.source ?? "-"}  size=${r.size ?? "-"}  enrichedAt=${r.enriched ?? "NEVER"}  inst=${r.inst}  apollo_id=${r.apollo_id ?? "-"}`);
    console.log(`    properties keys: ${keys || "(none)"}`);
  }
  await client.end();
}
main().catch((e) => { console.error("ERR", e.message || e); process.exit(1); });
