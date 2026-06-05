/** Read-only: geo + category breakdown of live companies on the Pilae tenant,
 * to explain why so few Swiss companies and how coarse the categories are. */
import postgres from "postgres";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const line = (s = "") => console.log(s);
const h = (s: string) => { line(); line("=".repeat(64)); line(s); line("=".repeat(64)); };

async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });

  const [{ n: total }] = await s<{n:number}[]>`
    SELECT count(*)::int n FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL`;
  line(`Live companies: ${total}`);

  h("BY properties.country");
  for (const r of await s`
    SELECT COALESCE(properties->>'country','(null)') c, count(*)::int n FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)
    line(`  ${String(r.c).padEnd(28)} ${r.n}`);

  h("BY properties.region (top 25)");
  for (const r of await s`
    SELECT COALESCE(properties->>'region','(null)') c, count(*)::int n FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 25`)
    line(`  ${String(r.c).padEnd(36)} ${r.n}`);

  h("SWISS detection (country CH or .ch domain or swiss city/region)");
  const [{ n: chCountry }] = await s<{n:number}[]>`
    SELECT count(*)::int n FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL
      AND (upper(coalesce(properties->>'country',''))='CH'
           OR coalesce(properties->>'country','') ILIKE '%switz%' OR coalesce(properties->>'country','') ILIKE '%suisse%')`;
  const [{ n: chDomain }] = await s<{n:number}[]>`
    SELECT count(*)::int n FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL
      AND domain ILIKE '%.ch'`;
  line(`  country=CH:        ${chCountry}`);
  line(`  domain endswith .ch: ${chDomain}`);
  const swiss = await s<{name:string,domain:string|null,country:string|null,region:string|null}[]>`
    SELECT name, domain, properties->>'country' country, properties->>'region' region FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL
      AND (upper(coalesce(properties->>'country',''))='CH' OR domain ILIKE '%.ch')
    ORDER BY name LIMIT 40`;
  line(`  --- swiss-ish rows (first 40) ---`);
  for (const r of swiss) line(`    "${r.name}"  ${r.domain ?? "-"}  country=${r.country ?? "-"} region=${r.region ?? "-"}`);

  h("BY industry column (top 30)");
  for (const r of await s`
    SELECT COALESCE(industry,'(null)') c, count(*)::int n FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 30`)
    line(`  ${String(r.c).padEnd(40)} ${r.n}`);

  h("BY properties.employee_band");
  for (const r of await s`
    SELECT COALESCE(properties->>'employee_band','(null)') c, count(*)::int n FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)
    line(`  ${String(r.c).padEnd(28)} ${r.n}`);

  h("search_strategy provenance (how Apollo was queried)");
  for (const r of await s`
    SELECT COALESCE(properties->>'search_strategy','(null)') c, count(*)::int n FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)
    line(`  ${String(r.c).padEnd(44)} ${r.n}`);

  await s.end();
}
main().catch((e)=>{console.error("ERR",e);process.exit(1);});
