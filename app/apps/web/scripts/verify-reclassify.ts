import postgres from "postgres";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const fr = await s`SELECT count(*)::int n FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL
    AND industry IN ('Industrie / commerce / hospitalité','Public / parapublic / éducation','Fondation / ONG','Santé','Autre','Finance / banque','Tech / IT','Organisation internationale')`;
  console.log(`Old FR-bucket rows remaining in industry column: ${fr[0].n} (expect 0)`);
  const rev = await s`SELECT count(*)::int n FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL
    AND properties ? 'prev_industry'`;
  console.log(`Rows with prev_industry stored (reversible): ${rev[0].n} (expect 586)`);
  const distinct = await s`SELECT count(DISTINCT industry)::int n FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL`;
  console.log(`Distinct industry values now: ${distinct[0].n}`);
  const sectors = await s`SELECT properties->>'icp_sector' sec, count(*)::int n FROM companies WHERE tenant_id=${TENANT} AND deleted_at IS NULL GROUP BY 1 ORDER BY 2 DESC`;
  console.log("icp_sector coverage:");
  for (const r of sectors) console.log(`  ${String(r.sec).padEnd(40)} ${r.n}`);
  await s.end();
}
main().catch((e)=>{console.error("ERR",e);process.exit(1);});
