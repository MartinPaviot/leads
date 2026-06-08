import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { enrichOrganization } from "@/lib/integrations/apollo-client";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const ROMAND_STATE = /gen[eè]ve|geneva|vaud|valais|wallis|fribourg|freiburg|neuch[aâ]tel|jura/i;
const ROMAND_CITY = /gen[eè]ve|geneva|lausanne|sion|fribourg|neuch[aâ]tel|del[eé]mont|montreux|nyon|vevey|carouge|meyrin|morges|yverdon|bulle|martigny|monthey|renens|gland|rolle|pully|vernier|lancy|onex|plan-les-ouates|versoix|cologny|crissier|ecublens|prilly|sierre|payerne|nyon/i;
const CH = /switzerland|suisse|schweiz|svizzera/i;
async function main(){
  const rows = await db.select({ id: companies.id, name: companies.name, domain: companies.domain, props: companies.properties })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`));
  let romand=0, chOther=0, nonCh=0, noData=0, i=0;
  const intruders: string[] = [];
  for(const r of rows){
    i++;
    let org=null as Awaited<ReturnType<typeof enrichOrganization>>|null;
    try { if(r.domain) org = await enrichOrganization(r.domain); } catch { /* */ }
    const country=org?.country??""; const state=org?.state??""; const city=org?.city??"";
    const isCh = CH.test(country) || (r.domain??"").toLowerCase().endsWith(".ch");
    const isRomand = isCh && (ROMAND_STATE.test(state) || ROMAND_CITY.test(city) || ROMAND_CITY.test(r.name));
    const set: Record<string,unknown> = { properties: sql`COALESCE(${companies.properties},'{}'::jsonb) || ${JSON.stringify({city,state,country})}::jsonb` };
    if(org){
      if(!isCh){ set.excludedReason="sourced_not_swiss"; nonCh++; if(intruders.length<12) intruders.push(`NON-CH: ${r.name} | ${country||"?"} | ${r.domain}`); }
      else if(!isRomand){ set.excludedReason="sourced_ch_not_romand"; chOther++; if(intruders.length<12) intruders.push(`CH-non-romand: ${r.name} | ${state||city||"?"} | ${r.domain}`); }
      else romand++;
    } else { noData++; }
    await db.update(companies).set(set).where(eq(companies.id, r.id));
    if(i%40===0) console.log(`  ${i}/${rows.length} (romand=${romand} chOther=${chOther} nonCh=${nonCh} noData=${noData})`);
  }
  console.log(`\n=> VERIFIED ${rows.length}: ROMAND=${romand} (kept active), CH-non-romand=${chOther} (excluded), NON-CH=${nonCh} (excluded), no-Apollo-data=${noData} (kept, unconfirmed)`);
  if(intruders.length) console.log(`intruders excluded:\n  ${intruders.join("\n  ")}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
