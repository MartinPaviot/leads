/**
 * Source an ICP's FRENCH accounts from the gouv SIRENE API (keyless,
 * authoritative). Produces a CLEAN identity layer: every account carries
 * a real SIREN + exact NAF + effectif + active status — the "bonnes
 * informations" Apollo can't guarantee. Domain/contacts come later via
 * the enrichment waterfall.
 *
 * Usage: tsx scripts/source-icp-sirene.ts <tenant> "<ICP name>" [maxPages]
 * (run with NODE_OPTIONS=--use-system-ca for TLS)
 */
import { db, companies, icps, icpCriteria } from "../src/db";
import { and, eq, sql } from "drizzle-orm";
import type { Criterion } from "../src/lib/icp/criteria-engine";
import { nafForIndustries, employeeRangeToTranches } from "../src/lib/integrations/pappers-codes";
import { departementsForRegions, regionNameForDepartement } from "../src/lib/integrations/fr-departments";
import { searchCompaniesSirene } from "../src/lib/integrations/recherche-entreprises-client";

function asArr(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : v == null || v === "" ? [] : [String(v)];
}

async function main() {
  const tenantId = process.argv[2];
  const icpName = process.argv[3];
  const maxPages = Math.max(1, Math.min(40, Number(process.argv[4] ?? 12)));
  if (!tenantId || !icpName) { console.error('usage: <tenant> "<ICP>" [maxPages]'); process.exit(1); }

  const [icp] = await db.select({ id: icps.id }).from(icps)
    .where(and(eq(icps.name, icpName), eq(icps.tenantId, tenantId))).limit(1);
  if (!icp) { console.error(`ICP "${icpName}" not found`); process.exit(1); }

  const rows = await db.select().from(icpCriteria).where(eq(icpCriteria.icpId, icp.id));
  const crit = (k: string) => rows.find((r) => r.fieldKey === k);

  const naf = nafForIndustries(asArr(crit("industry")?.value));
  const deps = departementsForRegions(asArr(crit("geography")?.value));
  const empVal = (crit("employee_count")?.value ?? {}) as { min?: number; max?: number };
  const tranches = employeeRangeToTranches(empVal.min ?? null, empVal.max ?? null);

  if (naf.length === 0 || deps.length === 0) {
    console.log(`Cannot source via SIRENE: naf=${naf.length} deps=${deps.length} (needs French industry + region).`);
    process.exit(0);
  }
  console.log(`SIRENE: naf=[${naf.join(",")}] deps=${deps.length} tranches=[${tranches.join(",")}]`);

  let inserted = 0, skipped = 0, total = 0;
  for (let page = 1; page <= maxPages; page++) {
    const res = await searchCompaniesSirene({
      activite_principale: naf,
      departement: deps,
      tranche_effectif_salarie: tranches.length ? tranches : undefined,
      page,
      perPage: 25,
    });
    if (page === 1) { total = res.total; console.log(`SIRENE total matching=${total} (pages=${res.pages})`); }
    if (res.companies.length === 0) break;
    for (const c of res.companies) {
      const [exists] = await db.select({ id: companies.id }).from(companies)
        .where(and(eq(companies.tenantId, tenantId), sql`${companies.properties}->>'siren' = ${c.siren}`)).limit(1);
      if (exists) { skipped++; continue; }
      try {
        await db.insert(companies).values({
          tenantId,
          name: c.name ?? c.siren,
          domain: null,
          industry: c.libelleNaf,
          properties: {
            source: "sirene",
            siren: c.siren,
            code_naf: c.naf,
            effectif_tranche: c.effectifTranche,
            code_postal: c.postalCode,
            city: c.city,
            departement: c.departement,
            region: regionNameForDepartement(c.departement),
            country: "France",
            registry_verified: true,
            active: c.active,
          },
        });
        inserted++;
        if (inserted % 25 === 0) console.log(`  …inserted=${inserted} skipped=${skipped}`);
      } catch (e) { skipped++; if (skipped <= 3) console.log(`  [err] ${(e as Error).message}`); }
    }
    if (page >= res.pages) break;
  }
  console.log(`Done: inserted=${inserted} skipped=${skipped} (of ${total} matching in France)`);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
