/**
 * Test Martin's revised ICP (throwaway): romand companies, <100 FTE, but with
 * a revenue floor (8M CHF ≈ 8.8M USD — Apollo revenue is USD). Quantifies the
 * net-new pool vs what we already have. Run with cert bundle.
 */
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { searchOrganizations } from "@/lib/integrations/apollo-client";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const ROMAND = ["Geneva", "Vaud", "Valais", "Fribourg", "Neuchâtel", "Jura", "Lausanne", "Genève", "Sion"];
const SUB100 = ["1,10", "11,20", "21,50", "51,100"];

async function scope(label: string, minRev: number) {
  const r = await searchOrganizations({
    organization_locations: ROMAND,
    organization_num_employees_ranges: SUB100,
    revenue_range: { min: minRev },
    page: 1,
    per_page: 100,
  });
  const total = r.pagination?.total_entries ?? 0;
  const orgs = r.organizations ?? [];
  const ex = await db.select({ domain: companies.domain }).from(companies).where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt)));
  const known = new Set(ex.map((c) => (c.domain ?? "").toLowerCase()).filter(Boolean));
  const newOnPage = orgs.filter((o) => o.primary_domain && !known.has(o.primary_domain.toLowerCase())).length;
  console.log(`${label}: total=${total}, NEW-on-page=${newOnPage}/${orgs.length}`);
  console.log(`  sample: ${orgs.slice(0, 8).map((o) => `${o.name}|${o.primary_domain}|${o.estimated_num_employees}emp|$${o.annual_revenue ? (o.annual_revenue / 1e6).toFixed(1) + "M" : "?"}|${o.industry}`).join("\n          ")}`);
}

async function main() {
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"}  (revenue floors in USD; 8M CHF ≈ 8.8M USD)`);
  await scope("romand <100 FTE, rev >= 8M", 8_000_000);
  await scope("romand <100 FTE, rev >= 5M", 5_000_000);
  await scope("romand <100 FTE, rev >= 2M", 2_000_000);
  await scope("romand <100 FTE, ANY rev (incl. unknown)", 0);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
