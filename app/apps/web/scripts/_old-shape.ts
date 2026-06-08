import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main(){
  // Old companies = NOT the rev8m source, with industry populated.
  const rows = await db.select({ name: companies.name, domain: companies.domain, industry: companies.industry, size: companies.size, revenue: companies.revenue, props: companies.properties })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt),
      sql`(${companies.properties}->>'source' is distinct from 'apollo_romand_rev8m_sub100')`,
      sql`${companies.industry} is not null`)).limit(3);
  for(const r of rows){
    console.log(`\n${r.name}: industry=${r.industry} size=${r.size} rev=${r.revenue}`);
    console.log(`  properties keys: ${Object.keys((r.props as Record<string,unknown>)??{}).join(", ")}`);
    const p = (r.props as Record<string,unknown>)??{};
    for(const k of ["linkedin_url","linkedinUrl","linkedin","city","state","country","location","geography","website"]) if(k in p) console.log(`  ${k} = ${JSON.stringify(p[k]).slice(0,60)}`);
  }
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
