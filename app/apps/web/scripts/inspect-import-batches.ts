/** Read-only: characterize how the tenant's companies were created, to tell
 * apart real sourced data from low-quality / re-import / "test run" batches. */
import postgres from "postgres";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  const byDay = await s`
    SELECT date_trunc('day', created_at) AS day,
           properties->>'source' AS source,
           count(*)::int n,
           count(*) FILTER (WHERE score = 0 OR score IS NULL)::int zero_score,
           count(*) FILTER (WHERE name ~ '\\(.*\\)')::int paren_name
    FROM companies WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
    GROUP BY 1,2 ORDER BY 1,2`;
  console.log("=== companies by day + source ===");
  console.log("  day                source     n     score0   name-with-(parens)");
  for (const r of byDay) {
    console.log(`  ${String(r.day).slice(0,10)}   ${String(r.source).padEnd(8)}  ${String(r.n).padStart(4)}   ${String(r.zero_score).padStart(6)}   ${r.paren_name}`);
  }

  // "doubled name" pattern like "KLINT (KLINT)" or "OPENDATASOFT (HUWISE)"
  const doubled = await s<{n:number}[]>`
    SELECT count(*)::int n FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND name ~ '^[^(]+\\([^)]+\\)\\s*$'`;
  console.log(`\n=== names of shape "X (Y)": ${doubled[0].n} ===`);
  const sample = await s<{name:string,score:number|null,created_at:string,source:string|null}[]>`
    SELECT name, score, created_at, properties->>'source' source FROM companies
    WHERE tenant_id = ${TENANT} AND deleted_at IS NULL
      AND name ~ '^[^(]+\\([^)]+\\)\\s*$'
    ORDER BY created_at LIMIT 25`;
  for (const r of sample) console.log(`  "${r.name}"  score=${r.score ?? "-"} src=${r.source} ${String(r.created_at).slice(0,24)}`);

  await s.end();
}
main().catch((e)=>{console.error("ERR",e);process.exit(1);});
