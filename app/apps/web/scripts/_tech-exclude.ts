import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const TECH_RE = /information technology|software|saas|internet|computer|semiconduct|fintech|crypto|blockchain|\bit\b|telecommunic|digital|data infrastructure|cyber/i;
async function main(){
  const rows = await db.select({ id: companies.id, name: companies.name, industry: companies.industry })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), isNull(companies.excludedReason),
      sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`));
  let ex=0; const names: string[]=[];
  for(const r of rows){
    if(r.industry && TECH_RE.test(r.industry)){
      await db.update(companies).set({ excludedReason: "sourced_tech" }).where(eq(companies.id, r.id));
      ex++; if(names.length<12) names.push(`${r.name} (${r.industry})`);
    }
  }
  console.log(`tech excluded: ${ex} / ${rows.length} active`);
  if(names.length) console.log("  " + names.join("\n  "));
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
