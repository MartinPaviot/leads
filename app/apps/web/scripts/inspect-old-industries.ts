/** Read-only: every distinct industry value on the non-romand (old Apollo)
 * batch, so the unification map covers all of them. */
import postgres from "postgres";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s`
    SELECT COALESCE(industry,'(null)') ind, count(*)::int n,
           count(*) FILTER (WHERE jsonb_array_length(coalesce(properties->'naics_codes','[]'::jsonb))>0)::int has_naics
    FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL
      AND coalesce(properties->>'search_strategy','') <> 'Pilae ICP romand 100-1000'
    GROUP BY 1 ORDER BY 2 DESC`;
  let tot = 0;
  for (const r of rows) { tot += r.n; console.log(`  ${String(r.ind).padEnd(46)} ${String(r.n).padStart(4)}  naics:${r.has_naics}`); }
  console.log(`\n  distinct=${rows.length} total=${tot}`);
  await s.end();
}
main().catch((e)=>{console.error("ERR",e);process.exit(1);});
