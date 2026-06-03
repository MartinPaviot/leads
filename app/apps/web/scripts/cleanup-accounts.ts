/**
 * Hygiene pass for a clean account list (reversible):
 *  - soft-exclude E2E test fixtures (no properties.source)
 *  - soft-exclude duplicate rows, keeping the most-complete per canonical
 *    identity key (SIREN > UID > domain > name)
 * Uses excluded_reason (the anti-ICP/do-not-enrol field) so it's reversible
 * (clear excluded_reason to restore) and doesn't hard-delete.
 */
import postgres from "postgres";
import { canonicalIdentityKey, type CompanyLike } from "../src/lib/companies/identity";

async function main() {
  const t = process.argv[2] ?? "47dca783-dac0-45a5-85cb-d217b2a3174d";
  const apply = process.argv[3] === "--apply";
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  const rows = await s`
    SELECT id, name, domain, industry, excluded_reason, deleted_at, properties
    FROM companies WHERE tenant_id = ${t} AND deleted_at IS NULL`;

  // 1. Fixtures = no source tag.
  const fixtures = rows.filter((r) => !((r.properties ?? {}) as Record<string, unknown>).source && !r.excluded_reason);

  // 2. Duplicates by canonical key — keep the richest row.
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    if (r.excluded_reason) continue;
    const key = canonicalIdentityKey({
      name: r.name as string | null, domain: r.domain as string | null,
      properties: (r.properties ?? {}) as Record<string, unknown>,
    } as CompanyLike);
    if (!key) continue;
    const arr = groups.get(key) ?? [];
    arr.push(r);
    groups.set(key, arr);
  }
  const richness = (r: (typeof rows)[number]) =>
    (r.domain ? 4 : 0) + (((r.properties ?? {}) as Record<string, unknown>).apollo_enriched ? 2 : 0) + (r.industry ? 1 : 0);
  const dupExclude: string[] = [];
  for (const [, arr] of groups) {
    if (arr.length < 2) continue;
    const keep = [...arr].sort((a, b) => richness(b) - richness(a))[0];
    for (const r of arr) if (r.id !== keep.id) dupExclude.push(r.id as string);
  }

  console.log(`fixtures to exclude: ${fixtures.length}`);
  console.log(`duplicate rows to exclude: ${dupExclude.length}`);
  if (!apply) { console.log("\n(dry-run — pass --apply to write)"); await s.end(); return; }

  const now = new Date();
  for (const r of fixtures) {
    await s`UPDATE companies SET excluded_reason='e2e_fixture', excluded_at=${now}, updated_at=now() WHERE id=${r.id}`;
  }
  for (const id of dupExclude) {
    await s`UPDATE companies SET excluded_reason='duplicate', excluded_at=${now}, updated_at=now() WHERE id=${id}`;
  }
  console.log(`Excluded ${fixtures.length} fixtures + ${dupExclude.length} duplicates (reversible: clear excluded_reason).`);
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
