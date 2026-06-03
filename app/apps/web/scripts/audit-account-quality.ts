import postgres from "postgres";
import { auditAccountQuality, type CompanyLike } from "../src/lib/companies/identity";

async function main() {
  const t = process.argv[2] ?? "47dca783-dac0-45a5-85cb-d217b2a3174d";
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s`
    SELECT id, name, domain, industry, excluded_reason, deleted_at, properties
    FROM companies WHERE tenant_id = ${t}`;
  await s.end();

  const companies: CompanyLike[] = rows.map((r) => ({
    id: r.id as string,
    name: r.name as string | null,
    domain: r.domain as string | null,
    industry: r.industry as string | null,
    excludedReason: r.excluded_reason as string | null,
    deletedAt: r.deleted_at as string | null,
    properties: (r.properties ?? {}) as Record<string, unknown>,
  }));

  const r = auditAccountQuality(companies);
  console.log("=== Account quality (tenant " + t.slice(0, 8) + ") ===");
  console.log(`total rows:          ${r.total}`);
  console.log(`unique entities:     ${r.uniqueEntities}`);
  console.log(`duplicate rows:      ${r.duplicateRows}  (collapsible)`);
  console.log(`no domain:           ${r.missingDomain}  (${Math.round((100 * r.missingDomain) / r.total)}%)`);
  console.log(`no industry:         ${r.missingIndustry}`);
  console.log(`excluded/deleted:    ${r.excludedOrDeleted}`);
  console.log(`unkeyed (drop):      ${r.unkeyed}`);
  console.log("by source:", JSON.stringify(r.bySource));
  if (r.duplicateGroups.length) {
    console.log(`\ntop duplicate groups:`);
    for (const g of r.duplicateGroups.slice(0, 8)) console.log(`   ${g.key}  ×${g.count}`);
  }
  const withSiren = companies.filter((c) => (c.properties ?? {}).siren).length;
  console.log(`\nwith authoritative registry id (SIREN/UID): ${withSiren} / ${r.total}`);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
