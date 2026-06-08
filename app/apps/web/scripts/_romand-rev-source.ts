/**
 * Source Martin's revised ICP into the tenant (throwaway):
 * romand, <100 FTE, revenue >= 8M (CHF≈USD floor), non-tech, net-new only.
 * MUST run with the cert bundle (Apollo over the local TLS interceptor).
 */
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { searchOrganizations } from "@/lib/integrations/apollo-client";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const ROMAND = ["Geneva", "Vaud", "Valais", "Fribourg", "Neuchâtel", "Jura", "Lausanne", "Genève", "Sion"];
const SUB100 = ["1,10", "11,20", "21,50", "51,100"];
const MIN_REV = 8_000_000; // ~8M CHF
const TECH_RE = /soft|inform|internet|comput|saas|technolog|digital|telecom|semiconduct|fintech|crypto|blockchain|\bai\b|data|cyber|platform|app\b/i;

function isTech(o: { name: string; industry: string | null; keywords: string[] }): boolean {
  const hay = `${o.name} ${o.industry ?? ""} ${(o.keywords ?? []).join(" ")}`;
  return TECH_RE.test(hay);
}

async function main() {
  if (!process.env.NODE_EXTRA_CA_CERTS) { console.error("set NODE_EXTRA_CA_CERTS"); process.exit(1); }
  const ex = await db.select({ domain: companies.domain }).from(companies).where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt)));
  const known = new Set(ex.map((c) => (c.domain ?? "").toLowerCase()).filter(Boolean));

  let inserted = 0, skippedTech = 0, dupe = 0, noDomain = 0;
  const seen = new Set<string>();
  for (let page = 1; page <= 6; page++) {
    const r = await searchOrganizations({
      organization_locations: ROMAND,
      organization_num_employees_ranges: SUB100,
      revenue_range: { min: MIN_REV },
      page,
      per_page: 100,
    });
    const orgs = r.organizations ?? [];
    if (orgs.length === 0) break;
    for (const o of orgs) {
      const domain = (o.primary_domain ?? "").toLowerCase().trim();
      if (!domain) { noDomain++; continue; }
      if (known.has(domain) || seen.has(domain)) { dupe++; continue; }
      seen.add(domain);
      if (isTech({ name: o.name, industry: o.industry, keywords: o.keywords ?? [] })) { skippedTech++; continue; }
      try {
        await db.insert(companies).values({
          tenantId: tid,
          name: o.name,
          domain,
          industry: o.industry ?? null,
          size: o.estimated_num_employees != null ? String(o.estimated_num_employees) : null,
          revenue: o.annual_revenue != null ? String(o.annual_revenue) : null,
          sourceSystem: "apollo",
          properties: {
            source: "apollo_romand_rev8m_sub100",
            apollo_id: o.id,
            city: o.city ?? null,
            state: o.state ?? null,
            sourced_at: new Date().toISOString(),
          },
        });
        inserted++;
      } catch { dupe++; }
    }
    if (orgs.length < 100) break;
  }
  console.log(`=> DONE romand <100 FTE rev>=8M non-tech: inserted=${inserted}, skippedTech=${skippedTech}, dupes=${dupe}, noDomain=${noDomain}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
