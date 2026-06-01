/**
 * Diagnose which filter throttles an ICP's TAM. Loads the ICP, then
 * fires the baseline + a set of single-lever relaxations against
 * Apollo, printing total_entries for each so we can see what to widen.
 * Read-only (per_page 1). Run with NODE_OPTIONS=--use-system-ca.
 */
import postgres from "postgres";
import { criteriaToApolloParams } from "../src/lib/icp/to-apollo-params";
import type { Criterion } from "../src/lib/icp/criteria-engine";
import { searchOrganizations, type OrgSearchParams } from "../src/lib/integrations/apollo-client";

const TENANT = "pilae";

async function count(params: OrgSearchParams): Promise<number> {
  const r = await searchOrganizations({ ...params, page: 1, per_page: 1 });
  return r.pagination.total_entries;
}

async function main() {
  const name = process.argv[2] ?? "Scale-up Tech / SaaS B2B";
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  const [icp] = await sql`SELECT id FROM icps WHERE tenant_id = ${TENANT} AND name = ${name} LIMIT 1`;
  if (!icp) { console.error("ICP not found"); process.exit(1); }
  const rows = await sql`SELECT id, field_key, operator, value, weight, is_required FROM icp_criteria WHERE icp_id = ${icp.id}`;
  const criteria: Criterion[] = rows.map((r) => ({
    id: r.id as string, fieldKey: r.field_key as string, operator: r.operator as Criterion["operator"],
    value: r.value, weight: r.weight as number, isRequired: r.is_required as boolean,
  }));

  const base = criteriaToApolloParams(criteria).params;
  console.log(`\n=== ${name} — relaxation diagnostic ===\n`);
  console.log(`baseline (all filters)                 : ${await count(base)}`);

  // Lever 1: geo → whole countries instead of regions.
  console.log(`geo → [France, Switzerland]            : ${await count({ ...base, organization_locations: ["France", "Switzerland"] })}`);

  // Lever 2: drop the funding-date window.
  const noFunding = { ...base };
  delete noFunding.latest_funding_date_range;
  console.log(`drop funding window                    : ${await count(noFunding)}`);

  // Lever 3: widen employee band 30-200.
  console.log(`employees 30-200                       : ${await count({ ...base, organization_num_employees_ranges: ["30,200"] })}`);

  // Lever 4: drop the technology filter.
  const noTech = { ...base };
  delete noTech.currently_using_any_of_technology_uids;
  console.log(`drop technologies                      : ${await count(noTech)}`);

  // Lever 5: drop keyword tags (keep nothing but size+geo+tech+funding).
  const noKw = { ...base };
  delete noKw.q_organization_keyword_tags;
  console.log(`drop keyword/industry tags             : ${await count(noKw)}`);

  // Combined widen the user explicitly allowed: geo=countries + emp 30-200 + drop funding.
  const widened: OrgSearchParams = {
    ...base,
    organization_locations: ["France", "Switzerland"],
    organization_num_employees_ranges: ["30,200"],
  };
  delete widened.latest_funding_date_range;
  console.log(`WIDENED (countries + 30-200 + no fund) : ${await count(widened)}`);

  // Widened but keeping funding window (proof the bill compounded).
  const widenedKeepFund: OrgSearchParams = {
    ...base,
    organization_locations: ["France", "Switzerland"],
    organization_num_employees_ranges: ["30,200"],
  };
  console.log(`WIDENED keep funding window            : ${await count(widenedKeepFund)}`);

  await sql.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
