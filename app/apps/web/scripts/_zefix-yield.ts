/**
 * Decisive yield test (throwaway): of romand Zefix institutions (health/EMS +
 * foundations), how many are Apollo-resolvable (→ domain + size), ICP-size,
 * and NET-NEW (not already in our DB)? Tells us: build a free Zefix sourcer
 * vs recommend paid CH firmographics.
 */
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { searchOrganizations } from "@/lib/integrations/apollo-client";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const ENDPOINT = "https://lindas.admin.ch/query";

async function sparql(q: string) {
  const r = await fetch(ENDPOINT, { method: "POST", headers: { "content-type": "application/sparql-query", accept: "application/sparql-results+json" }, body: q, signal: AbortSignal.timeout(40000) });
  return JSON.parse(await r.text());
}

async function main() {
  // Pull a varied sample of romand institutional names (health/EMS + foundations).
  const q = `PREFIX schema: <http://schema.org/>
SELECT ?n ?c WHERE { ?o a <https://schema.ld.admin.ch/ZefixOrganisation>; schema:legalName ?n; schema:address ?a. ?a schema:addressRegion ?c.
 FILTER(?c IN ("GE","VD","VS","FR","NE","JU"))
 FILTER(CONTAINS(LCASE(?n),"clinique") || CONTAINS(LCASE(?n),"ems ") || CONTAINS(LCASE(?n),"soins") || CONTAINS(LCASE(?n),"fondation")) } LIMIT 20`;
  const j = await sparql(q);
  const names: Array<{ n: string; c: string }> = (j.results?.bindings ?? []).map((b: { n: { value: string }; c: { value: string } }) => ({ n: b.n.value, c: b.c.value }));

  const ex = await db.select({ domain: companies.domain, name: companies.name }).from(companies).where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt)));
  const knownDomains = new Set(ex.map((c) => (c.domain ?? "").toLowerCase()).filter(Boolean));
  const knownNames = new Set(ex.map((c) => (c.name ?? "").toLowerCase()));

  let resolvable = 0, icpSize = 0, netNew = 0;
  for (const { n } of names) {
    try {
      const r = await searchOrganizations({ q_organization_name: n.replace(/,?\s+(en liquidation|sa|sàrl|sarl)$/i, ""), organization_locations: ["Switzerland"], per_page: 1, page: 1 });
      const o = r.organizations?.[0];
      const dom = o?.primary_domain ?? null;
      const size = o?.estimated_num_employees ?? null;
      const isIcp = !!size && size >= 80 && size <= 1200;
      const isNew = dom ? !knownDomains.has(dom.toLowerCase()) : !knownNames.has(n.toLowerCase());
      if (dom) resolvable++;
      if (isIcp) icpSize++;
      if (dom && isNew && isIcp) netNew++;
      console.log(`${n.slice(0, 42).padEnd(42)} -> ${dom ?? "no-domain"} | size=${size ?? "?"} | ${isNew ? "NEW" : "have"}${dom && isNew && isIcp ? "  <== USABLE NET-NEW ICP" : ""}`);
    } catch (e) { console.log(`${n.slice(0, 42)} -> apollo err ${(e as Error).message.slice(0, 50)}`); }
  }
  console.log(`\nOf ${names.length} romand institutions: ${resolvable} Apollo-resolvable, ${icpSize} ICP-size(80-1200), ${netNew} USABLE net-new ICP.`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
