/**
 * Read-only: find duplicate accounts (companies) on the Pilae tenant.
 * Groups live companies by normalized domain, and separately by normalized
 * name, and prints every group with >1 member so we can see exactly what
 * a "delete dupes" pass would touch BEFORE touching anything.
 *
 * Usage: tsx --env-file=.env.local scripts/inspect-account-dupes.ts
 */
import postgres from "postgres";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

function normDomain(d: string | null): string | null {
  if (!d) return null;
  let s = d.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0];
  return s || null;
}
function normName(n: string): string {
  return n
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,]/g, "")
    .replace(/\b(sa|sarl|ag|gmbh|inc|llc|ltd|sas|group|groupe)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  const rows = await s<
    {
      id: string;
      name: string;
      domain: string | null;
      created_at: string | null;
      score: number | null;
      logo: string | null;
      contacts: number;
    }[]
  >`
    SELECT c.id, c.name, c.domain, c.created_at, c.score,
           c.resolved_logo_url AS logo,
           (SELECT count(*)::int FROM contacts ct
              WHERE ct.company_id = c.id AND ct.deleted_at IS NULL) AS contacts
    FROM companies c
    WHERE c.tenant_id = ${TENANT} AND c.deleted_at IS NULL
    ORDER BY c.created_at`;

  console.log(`Live companies on tenant: ${rows.length}\n`);

  // group by domain
  const byDomain = new Map<string, typeof rows>();
  const byName = new Map<string, typeof rows>();
  for (const r of rows) {
    const d = normDomain(r.domain);
    if (d) {
      if (!byDomain.has(d)) byDomain.set(d, []);
      byDomain.get(d)!.push(r);
    }
    const nm = normName(r.name);
    if (nm) {
      if (!byName.has(nm)) byName.set(nm, []);
      byName.get(nm)!.push(r);
    }
  }

  const dupDomains = [...byDomain.entries()].filter(([, v]) => v.length > 1);
  const dupNames = [...byName.entries()].filter(([, v]) => v.length > 1);

  let extraByDomain = 0;
  console.log(`=== DUPLICATE GROUPS BY DOMAIN: ${dupDomains.length} ===`);
  for (const [d, group] of dupDomains.sort((a, b) => b[1].length - a[1].length)) {
    extraByDomain += group.length - 1;
    console.log(`\n  [${d}]  x${group.length}`);
    for (const r of group) {
      console.log(
        `     ${r.id}  "${r.name}"  contacts=${r.contacts} score=${r.score ?? "-"} logo=${r.logo ? "y" : "n"} created=${r.created_at}`,
      );
    }
  }

  // name dupes that are NOT already caught by domain grouping
  const domainDupIds = new Set(dupDomains.flatMap(([, v]) => v.map((r) => r.id)));
  const nameOnly = dupNames.filter(([, v]) =>
    v.some((r) => !domainDupIds.has(r.id)),
  );
  let extraByNameOnly = 0;
  console.log(`\n\n=== DUPLICATE GROUPS BY NORMALIZED NAME (not already domain-dupes): ${nameOnly.length} ===`);
  for (const [nm, group] of nameOnly.sort((a, b) => b[1].length - a[1].length)) {
    extraByNameOnly += group.length - 1;
    console.log(`\n  [${nm}]  x${group.length}`);
    for (const r of group) {
      console.log(
        `     ${r.id}  "${r.name}"  domain=${r.domain ?? "-"} contacts=${r.contacts} score=${r.score ?? "-"} created=${r.created_at}`,
      );
    }
  }

  console.log(`\n\n=== SUMMARY ===`);
  console.log(`  live companies:                 ${rows.length}`);
  console.log(`  duplicate domain groups:        ${dupDomains.length}  -> ${extraByDomain} redundant rows`);
  console.log(`  extra name-only dup groups:     ${nameOnly.length}  -> ${extraByNameOnly} redundant rows`);

  await s.end();
}
main().catch((e) => {
  console.error("ERR", e);
  process.exit(1);
});
