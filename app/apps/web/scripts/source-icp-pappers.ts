/**
 * Source an ICP's FRENCH TAM from the Pappers registry (NAF-precise),
 * in parallel to the Apollo path. France-only: skips ICPs with no French
 * region (use Apollo/Cognism/Zefix for the Swiss part).
 *
 * Inserts firmographic seeds (name, domain, NAF→industry, SIREN) deduped
 * by SIREN; enrichment (tech/contacts/signals) is a later pass via the
 * existing enrichment waterfall + recompute.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/source-icp-pappers.ts <tenant> "<ICP name>" [maxPages]
 * Needs PAPPERS_API_KEY (free token at pappers.fr/api).
 */
import { db, companies, icps, icpCriteria } from "../src/db";
import { and, eq, sql } from "drizzle-orm";
import type { Criterion } from "../src/lib/icp/criteria-engine";
import { criteriaToPappersParams } from "../src/lib/icp/to-pappers-params";
import { isPappersAvailable, searchCompaniesPappers } from "../src/lib/integrations/pappers-client";

async function main() {
  const tenantId = process.argv[2];
  const icpName = process.argv[3];
  const maxPages = Math.max(1, Math.min(10, Number(process.argv[4] ?? 5)));
  if (!tenantId || !icpName) {
    console.error('usage: <tenant> "<ICP name>" [maxPages]');
    process.exit(1);
  }
  if (!isPappersAvailable()) {
    console.error("PAPPERS_API_KEY not set (free token at pappers.fr/api)");
    process.exit(1);
  }

  const [icp] = await db
    .select({ id: icps.id, name: icps.name })
    .from(icps)
    .where(and(eq(icps.name, icpName), eq(icps.tenantId, tenantId)))
    .limit(1);
  if (!icp) { console.error(`ICP "${icpName}" not found`); process.exit(1); }

  const critRows = await db.select().from(icpCriteria).where(eq(icpCriteria.icpId, icp.id));
  const criteria: Criterion[] = critRows.map((r) => ({
    id: r.id, fieldKey: r.fieldKey, operator: r.operator as Criterion["operator"],
    value: r.value, weight: r.weight, isRequired: r.isRequired,
  }));

  const t = criteriaToPappersParams(criteria);
  if (!t.ok) { console.log(`Skip Pappers: ${t.reason}`); process.exit(0); }
  console.log(`Pappers params:`, JSON.stringify(t.params));

  let inserted = 0, skipped = 0, total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await searchCompaniesPappers({ ...t.params, page, perPage: 100 });
    if (page === 1) { total = res.total; console.log(`Pappers total_results=${total}`); }
    if (res.companies.length === 0) break;
    for (const c of res.companies) {
      // Dedup by SIREN (stored in properties) or by domain.
      const [existing] = await db
        .select({ id: companies.id })
        .from(companies)
        .where(and(eq(companies.tenantId, tenantId), sql`${companies.properties}->>'siren' = ${c.siren}`))
        .limit(1);
      if (existing) { skipped++; continue; }
      try {
        await db.insert(companies).values({
          tenantId,
          name: c.name ?? c.siren,
          domain: c.website,
          industry: c.libelleNaf,
          properties: {
            source: "pappers",
            siren: c.siren,
            code_naf: c.codeNaf,
            city: c.city,
            postal_code: c.postalCode,
            date_creation: c.dateCreation,
            country: "France",
          },
        });
        inserted++;
        if (inserted % 25 === 0) console.log(`  …inserted=${inserted} skipped=${skipped}`);
      } catch (e) {
        skipped++;
        if (skipped <= 5) console.log(`  [insert err] ${(e as Error).message}`);
      }
    }
    if (res.companies.length < 100) break;
  }
  console.log(`Done: inserted=${inserted} skipped=${skipped} (of ${total} matching in France)`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
