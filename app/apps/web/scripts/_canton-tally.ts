import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main(){
  const rows = await db.select({ state: sql<string>`${companies.properties}->>'state'`, city: sql<string>`${companies.properties}->>'city'` })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), isNull(companies.excludedReason), sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`));
  const t = new Map<string,number>();
  for(const r of rows){ const k = (r.state||r.city||"?").trim()||"?"; t.set(k,(t.get(k)??0)+1); }
  console.log(`active romand (8M/<100): ${rows.length}`);
  console.log([...t.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>`  ${k}: ${v}`).join("\n"));
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
