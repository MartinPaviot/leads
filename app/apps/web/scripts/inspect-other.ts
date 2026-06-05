import postgres from "postgres";
const TENANT = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main() {
  const s = postgres(process.env.DATABASE_URL!, { max: 1 });
  const rows = await s<{name:string,domain:string|null}[]>`
    SELECT name, domain FROM companies
    WHERE tenant_id=${TENANT} AND deleted_at IS NULL AND industry='other'
    ORDER BY name`;
  console.log(`"other" accounts: ${rows.length}`);
  for (const r of rows) console.log(`  ${r.name}  |  ${r.domain ?? "-"}`);
  await s.end();
}
main().catch((e)=>{console.error("ERR",e);process.exit(1);});
