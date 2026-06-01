/**
 * Apollo dry-run for an ICP (gate-of-reality). Loads an ICP's criteria,
 * translates them to Apollo org-search params, fires ONE search page,
 * and reports total_entries + a sample. No insertion — this is the
 * "how many accounts does this ICP actually return?" check before
 * committing to a build.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/apollo-icp-dryrun.ts "Scale-up Tech / SaaS B2B"
 *   tsx --env-file=.env.local scripts/apollo-icp-dryrun.ts pilae   # all active ICPs for tenant
 */

import postgres from "postgres";
import { criteriaToApolloParams } from "../src/lib/icp/to-apollo-params";
import type { Criterion } from "../src/lib/icp/criteria-engine";
import { searchOrganizations, isApolloAvailable } from "../src/lib/integrations/apollo-client";

const TENANT = "pilae";

async function main() {
  if (!process.env.DATABASE_URL) { console.error("DATABASE_URL required"); process.exit(1); }
  if (!isApolloAvailable()) { console.error("APOLLO_API_KEY not configured"); process.exit(1); }

  const arg = process.argv[2] ?? "";
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  // Load the target ICP(s).
  const icpRows = arg && arg !== TENANT
    ? await sql`SELECT id, name FROM icps WHERE tenant_id = ${TENANT} AND name = ${arg} AND status = 'active'`
    : await sql`SELECT id, name FROM icps WHERE tenant_id = ${TENANT} AND status = 'active' ORDER BY priority`;

  if (icpRows.length === 0) {
    console.error(`No active ICP found${arg ? ` named "${arg}"` : ""} for tenant ${TENANT}.`);
    process.exit(1);
  }

  for (const icp of icpRows) {
    const critRows = await sql`SELECT id, field_key, operator, value, weight, is_required FROM icp_criteria WHERE icp_id = ${icp.id}`;
    const criteria: Criterion[] = critRows.map((r) => ({
      id: r.id as string,
      fieldKey: r.field_key as string,
      operator: r.operator as Criterion["operator"],
      value: r.value,
      weight: r.weight as number,
      isRequired: r.is_required as boolean,
    }));

    const { params, postFilterCriterionIds } = criteriaToApolloParams(criteria);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`ICP: ${icp.name}`);
    console.log(`${"=".repeat(60)}`);
    console.log("Apollo org-search params sent:");
    console.log(JSON.stringify(params, null, 2));
    console.log(`Post-filtered (people/enrich, not in org search): ${postFilterCriterionIds.length} criteria`);

    try {
      const res = await searchOrganizations({ ...params, page: 1, per_page: 10 });
      console.log(`\n→ Apollo total_entries: ${res.pagination.total_entries}`);
      console.log(`→ Sample (first ${res.organizations.length}):`);
      for (const o of res.organizations.slice(0, 10)) {
        console.log(
          `   • ${o.name}  [${o.estimated_num_employees ?? "?"} FTE · ${o.country ?? "?"} · ${o.industry ?? "?"}${o.latest_funding_stage ? " · " + o.latest_funding_stage : ""}]`,
        );
      }
      const n = res.pagination.total_entries;
      console.log(
        `\n→ Gate: ${n >= 50 ? "OK" : "THIN"} — ${n} accounts pre-enrichment` +
          (n < 50 ? " (< 50; widen geo or funding window)" : ""),
      );
    } catch (err) {
      console.error(`Apollo search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await sql.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
