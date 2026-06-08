/**
 * Swiss-lead sourcing diagnostic (throwaway). Measures the yield of two levers
 * for MORE romand leads, vs what we already have:
 *   A) Apollo company search — full romand mid-size pool (no keyword constraint)
 *   B) Zefix via LINDAS SPARQL (keyless) — registry count for romand cantons
 * Run with the cert bundle.
 */
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { searchOrganizations } from "@/lib/integrations/apollo-client";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const ROMAND = ["Geneva", "Vaud", "Valais", "Fribourg", "Neuchâtel", "Jura", "Lausanne", "Genève", "Sion"];

async function apolloLever() {
  // No keyword tags → the FULL romand 100-1000 FTE pool (then we filter non-tech).
  const r = await searchOrganizations({
    organization_locations: ROMAND,
    organization_num_employees_ranges: ["101,200", "201,500", "501,1000"],
    page: 1,
    per_page: 100,
  });
  const total = r.pagination?.total_entries ?? 0;
  const sample = (r.organizations ?? []).slice(0, 100);
  // overlap with what we already have
  const ex = await db.select({ domain: companies.domain }).from(companies).where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt)));
  const known = new Set(ex.map((c) => (c.domain ?? "").toLowerCase()).filter(Boolean));
  const newOnPage = sample.filter((o) => o.primary_domain && !known.has(o.primary_domain.toLowerCase())).length;
  console.log(`A) APOLLO romand 100-1000 (no keyword): total_entries=${total}, page=${sample.length}, NEW-on-page=${newOnPage}/${sample.length}`);
  console.log(`   sample: ${sample.slice(0, 6).map((o) => `${o.name}|${o.primary_domain}|${o.estimated_num_employees}|${o.industry}`).join("  ;  ")}`);
}

async function lindasLever() {
  const endpoint = "https://lindas.admin.ch/query";
  const q = `PREFIX schema: <http://schema.org/>
SELECT (COUNT(DISTINCT ?org) AS ?n) WHERE {
  ?org a <https://schema.ld.admin.ch/ZefixOrganisation> ;
       schema:address ?addr .
  ?addr schema:addressRegion ?canton .
  FILTER(?canton IN ("GE","VD","VS","FR","NE","JU"))
}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/sparql-query", accept: "application/sparql-results+json" },
    body: q,
    signal: AbortSignal.timeout(30_000),
  });
  const body = await res.text();
  console.log(`\nB) LINDAS status=${res.status}`);
  try {
    const j = JSON.parse(body);
    console.log(`   romand ZefixOrganisation count = ${j.results?.bindings?.[0]?.n?.value}`);
  } catch {
    console.log(`   body: ${body.slice(0, 300)}`);
  }
}

async function main() {
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}`);
  try { await apolloLever(); } catch (e) { console.log("apollo err:", (e as Error).message.slice(0, 160)); }
  try { await lindasLever(); } catch (e) { console.log("lindas err:", (e as Error).message.slice(0, 160)); }
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
