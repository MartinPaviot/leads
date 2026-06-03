/**
 * Hostile-QA audit: does the SYSTEM STATE match what we DEFINED for the
 * two Pilae ICPs? Walks the full chain and prints every discrepancy:
 *   1. RLS — why the UI shows "0 criteria" while the DB has 8
 *   2. Stored criteria vs the canonical spec (seed-pilae-icps-v2)
 *   3. Apollo translation — which defined expectations actually reach
 *      the search vs are silently dropped to post-filter
 *   4. Accounts inventory on the tenant — what's there, does it match
 *
 * Usage: tsx --env-file=.env.local scripts/audit-icp-accounts.ts
 */
import postgres from "postgres";
import { criteriaToApolloParams } from "../src/lib/icp/to-apollo-params";
import { getStandardField } from "../src/lib/icp/field-catalog";
import { toTechnologyUid } from "../src/lib/icp/apollo-technology-uids";

const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

function line(s = "") { console.log(s); }
function h(s: string) { line(); line("=".repeat(72)); line(s); line("=".repeat(72)); }

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  // ── 1. RLS status on the three multi-ICP tables ──────────────────
  h("1. RLS STATUS (explains the UI '0 criteria' vs DB 8)");
  const rls = await s`
    SELECT c.relname AS table, c.relrowsecurity AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('icps','icp_criteria','company_icp_fit','companies')
    ORDER BY c.relname`;
  for (const r of rls) {
    line(`  ${r.table.padEnd(18)} rls_enabled=${r.rls_enabled}  forced=${r.rls_forced}  policies=${r.policies}`);
  }
  // What role does DATABASE_URL connect as, and does it bypass RLS?
  const who = await s`SELECT current_user AS u, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypassrls`;
  line(`  connecting role: ${who[0].u}  bypassrls=${who[0].bypassrls}`);

  // ── 2. Stored criteria per ICP ───────────────────────────────────
  const icps = await s`
    SELECT id, name, priority FROM icps
    WHERE tenant_id = ${TENANT} AND status = 'active' ORDER BY priority`;

  for (const icp of icps) {
    h(`ICP p${icp.priority}: ${icp.name}`);
    const crits = await s`
      SELECT id, field_key, operator, value, weight, is_required
      FROM icp_criteria WHERE icp_id = ${icp.id} ORDER BY is_required DESC, weight DESC`;

    line("  2. STORED CRITERIA:");
    for (const c of crits) {
      const f = getStandardField(c.field_key);
      const src = f ? f.source : "UNKNOWN-FIELD";
      const val = JSON.stringify(c.value);
      const v = val.length > 80 ? val.slice(0, 77) + "..." : val;
      line(`     - ${c.field_key.padEnd(20)} ${c.operator.padEnd(8)} w${c.weight} ${c.is_required ? "REQ" : "   "} [${src}] ${v}`);
    }

    // ── 3. Apollo translation ──────────────────────────────────────
    line();
    line("  3. APOLLO TRANSLATION (what actually reaches org search):");
    const asCrit = crits.map((c) => ({ id: c.id, fieldKey: c.field_key, operator: c.operator, value: c.value }));
    const { params, postFilterCriterionIds } = criteriaToApolloParams(asCrit as never);
    line("     params pushed to Apollo:");
    for (const [k, v] of Object.entries(params)) {
      line(`        ${k} = ${JSON.stringify(v)}`);
    }
    const dropped = crits.filter((c) => postFilterCriterionIds.includes(c.id));
    line("     NOT pushed to search (post-filter / dropped from sourcing):");
    for (const c of dropped) {
      const f = getStandardField(c.field_key);
      line(`        ${c.field_key} (${f ? f.source : "unknown"})`);
    }

    // tech UID translation check
    const techCrit = crits.find((c) => c.field_key === "technologies");
    if (techCrit && Array.isArray(techCrit.value)) {
      line();
      line("     tech display-name -> Apollo UID (UNVERIFIED vs Apollo taxonomy):");
      for (const t of techCrit.value as string[]) {
        line(`        "${t}" -> ${toTechnologyUid(t)}`);
      }
    }
  }

  // ── 4. Accounts inventory on the tenant ──────────────────────────
  h("4. ACCOUNTS ON THIS TENANT (what's actually there)");
  const total = await s`SELECT count(*)::int n FROM companies WHERE tenant_id = ${TENANT}`;
  line(`  total companies: ${total[0].n}`);
  const byIndustry = await s`
    SELECT COALESCE(industry,'(null)') AS industry, count(*)::int n
    FROM companies WHERE tenant_id = ${TENANT} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
  line("  by industry:");
  for (const r of byIndustry) line(`     ${String(r.industry).padEnd(40)} ${r.n}`);
  const byCountry = await s`
    SELECT COALESCE(country,'(null)') AS country, count(*)::int n
    FROM companies WHERE tenant_id = ${TENANT} GROUP BY 1 ORDER BY 2 DESC LIMIT 15`;
  line("  by country:");
  for (const r of byCountry) line(`     ${String(r.country).padEnd(40)} ${r.n}`);

  // fit matrix coverage
  const fit = await s`
    SELECT i.name, count(f.*)::int n,
           count(*) FILTER (WHERE f.fit_score >= 0.5)::int strong
    FROM icps i LEFT JOIN company_icp_fit f ON f.icp_id = i.id
    WHERE i.tenant_id = ${TENANT} AND i.status='active'
    GROUP BY i.name ORDER BY i.name`;
  line("  fit matrix (company_icp_fit rows per ICP):");
  for (const r of fit) line(`     ${String(r.name).padEnd(32)} rows=${r.n} strong(>=0.5)=${r.strong}`);

  await s.end();
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
