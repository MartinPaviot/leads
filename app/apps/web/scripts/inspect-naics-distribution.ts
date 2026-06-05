/** Read-only: distribution of NAICS (and SIC) code prefixes across the
 * romand batch, so the crosswalk maps every code that actually occurs. */
import postgres from "postgres";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const STRAT = "Pilae ICP romand 100-1000";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s<{name:string,naics:string[],sic:string[]}[]>`
    SELECT name,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(properties->'naics_codes','[]'::jsonb))) naics,
      ARRAY(SELECT jsonb_array_elements_text(coalesce(properties->'sic_codes','[]'::jsonb))) sic
    FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL AND properties->>'search_strategy'=${STRAT}`;

  const n2 = new Map<string,number>(), n3 = new Map<string,number>(), sic2 = new Map<string,number>();
  let noCode = 0;
  for (const r of rows) {
    const naics = r.naics ?? [], sic = r.sic ?? [];
    if (!naics.length && !sic.length) noCode++;
    // use the FIRST (primary) naics code per company
    if (naics[0]) {
      n2.set(naics[0].slice(0,2), (n2.get(naics[0].slice(0,2))??0)+1);
      n3.set(naics[0].slice(0,3), (n3.get(naics[0].slice(0,3))??0)+1);
    }
    if (sic[0]) sic2.set(sic[0].slice(0,2), (sic2.get(sic[0].slice(0,2))??0)+1);
  }
  const dump = (m:Map<string,number>, label:string) => {
    console.log(`\n=== ${label} (primary code) ===`);
    for (const [k,v] of [...m.entries()].sort((a,b)=>b[1]-a[1])) console.log(`  ${k.padEnd(6)} ${v}`);
  };
  console.log(`rows=${rows.length}  no-code=${noCode}`);
  dump(n2, "NAICS 2-digit");
  dump(n3, "NAICS 3-digit");
  dump(sic2, "SIC 2-digit");
  await s.end();
}
main().catch((e)=>{console.error("ERR",e);process.exit(1);});
