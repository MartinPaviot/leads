/** Read-only: how rich is the romand batch's firmographic data, and how
 * does that drive the coarse categories? */
import postgres from "postgres";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const STRAT = "Pilae ICP romand 100-1000";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const base = s`tenant_id=${TENANT} AND deleted_at IS NULL AND properties->>'search_strategy'=${STRAT}`;

  const [{ n }] = await s<{n:number}[]>`SELECT count(*)::int n FROM companies WHERE ${base}`;
  console.log(`Romand batch size: ${n}`);

  const cov = await s<{has_naics:number,has_sic:number,has_rev:number,has_city:number}[]>`
    SELECT
      count(*) FILTER (WHERE jsonb_array_length(coalesce(properties->'naics_codes','[]'::jsonb))>0)::int has_naics,
      count(*) FILTER (WHERE jsonb_array_length(coalesce(properties->'sic_codes','[]'::jsonb))>0)::int has_sic,
      count(*) FILTER (WHERE coalesce(properties->>'annual_revenue','')<>'')::int has_rev,
      count(*) FILTER (WHERE coalesce(properties->>'city','')<>'')::int has_city
    FROM companies WHERE ${base}`;
  console.log("Firmographic coverage:", cov[0]);

  console.log("\nIndustry buckets (romand batch only):");
  for (const r of await s`SELECT industry, count(*)::int n FROM companies WHERE ${base} GROUP BY 1 ORDER BY 2 DESC`)
    console.log(`  ${String(r.industry).padEnd(40)} ${r.n}`);

  console.log("\nGrade distribution (romand batch):");
  for (const r of await s`SELECT properties->>'score_grade' g, count(*)::int n FROM companies WHERE ${base} GROUP BY 1 ORDER BY 1`)
    console.log(`  ${r.g}: ${r.n}`);

  // Of the "Autre" bucket, how many had ANY code?
  const [{ autre, autre_nocode }] = await s<{autre:number,autre_nocode:number}[]>`
    SELECT count(*)::int autre,
      count(*) FILTER (WHERE jsonb_array_length(coalesce(properties->'naics_codes','[]'::jsonb))=0
                        AND jsonb_array_length(coalesce(properties->'sic_codes','[]'::jsonb))=0)::int autre_nocode
    FROM companies WHERE ${base} AND industry='Autre'`;
  console.log(`\n"Autre" bucket: ${autre} total, of which ${autre_nocode} had NO sic/naics code at all`);

  await s.end();
}
main().catch((e)=>{console.error("ERR",e);process.exit(1);});
