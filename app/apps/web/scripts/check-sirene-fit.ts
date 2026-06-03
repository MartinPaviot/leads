import postgres from "postgres";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const t = "47dca783-dac0-45a5-85cb-d217b2a3174d";
  const [icp] = await s`SELECT id FROM icps WHERE tenant_id=${t} AND name='Scale-up Tech / SaaS B2B'`;
  const r = await s`
    SELECT
      count(*)::int total,
      count(*) FILTER (WHERE f.fit_score >= 0.5)::int strong,
      count(*) FILTER (WHERE f.fit_score > 0)::int scored,
      count(*) FILTER (WHERE f.fit_score = 0)::int zero
    FROM company_icp_fit f JOIN companies c ON c.id = f.company_id
    WHERE f.icp_id = ${icp.id} AND c.properties->>'source' = 'sirene'`;
  console.log("SIRENE fit:", JSON.stringify(r[0]));
  // enriched (domain) vs identity-only
  const e = await s`
    SELECT
      count(*) FILTER (WHERE f.fit_score >= 0.5)::int strong
    FROM company_icp_fit f JOIN companies c ON c.id = f.company_id
    WHERE f.icp_id = ${icp.id} AND c.properties->>'source'='sirene' AND c.domain IS NOT NULL`;
  console.log("SIRENE enriched (domain) strong>=0.5:", e[0].strong);
  await s.end();
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
