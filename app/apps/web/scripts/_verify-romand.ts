import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const ROMAND_STATE = /gen[eè]ve|geneva|vaud|valais|fribourg|freiburg|neuch[aâ]tel|jura/i;
const ROMAND_CITY = /gen[eè]ve|geneva|lausanne|sion|fribourg|neuch[aâ]tel|del[eé]mont|montreux|nyon|vevey|carouge|meyrin|morges|yverdon|bulle|martigny|monthey|renens|gland|rolle|pully|chaux-de-fonds|vernier|lancy|onex|plan-les-ouates|versoix|cologny|st-sulpice|crissier|ecublens|prilly|aigle|sierre|payerne|estavayer|bussigny|le locle/i;
async function main(){
  const rows = await db.select({ name: companies.name, domain: companies.domain, props: companies.properties })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`));
  const byState = new Map<string, number>();
  let romand=0, ch=0, uncertain=0; const intruders: string[] = [];
  for(const r of rows){
    const p = (r.props as Record<string,unknown>) ?? {};
    const city = String(p.city ?? ""); const state = String(p.state ?? "");
    const dom = (r.domain ?? "").toLowerCase();
    byState.set(state||"(none)", (byState.get(state||"(none)")??0)+1);
    const isRomand = ROMAND_STATE.test(state) || ROMAND_CITY.test(city) || ROMAND_CITY.test(r.name);
    if(isRomand) romand++;
    else if(dom.endsWith(".ch")) { ch++; }
    else { uncertain++; if(intruders.length<15) intruders.push(`${r.name} | ${dom} | city=${city} state=${state}`); }
  }
  console.log(`226-source rows: ${rows.length}`);
  console.log(`  romand-confirmed (canton/ville): ${romand}`);
  console.log(`  .ch domain but no explicit romand city/state: ${ch}`);
  console.log(`  uncertain (no romand signal + non-.ch): ${uncertain}`);
  console.log(`  by Apollo state: ${[...byState.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>`${k}:${v}`).join(", ")}`);
  if(intruders.length) console.log(`  uncertain samples:\n   ${intruders.join("\n   ")}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
