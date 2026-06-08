import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main(){
  const rows = await db.select({ name: companies.name, rev: companies.revenue, size: companies.size, ind: companies.industry })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), isNull(companies.excludedReason),
      sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`));
  const parsed = rows.map(r=>({ name:r.name, rev: Number(r.rev)||0, size: Number(r.size)||0, ind:r.ind }));
  const withRev = parsed.filter(p=>p.rev>0);
  console.log(`active: ${rows.length}, with numeric revenue: ${withRev.length}`);
  const b: Record<string,number> = { "<8M":0, "8-20M":0, "20-50M":0, "50-100M":0, ">100M":0 };
  for(const p of withRev){ const m=p.rev/1e6; if(m<8)b["<8M"]++; else if(m<20)b["8-20M"]++; else if(m<50)b["20-50M"]++; else if(m<100)b["50-100M"]++; else b[">100M"]++; }
  console.log("revenue buckets:", JSON.stringify(b));
  const susp = withRev.filter(p=>p.size>0 && p.rev/p.size > 2_000_000);
  console.log(`\nrev/employee > $2M (suspicious): ${susp.length}/${withRev.length}`);
  for(const p of susp.sort((a,b)=> (b.rev/b.size)-(a.rev/a.size)).slice(0,12)) console.log(`  ${p.name.slice(0,32).padEnd(32)} $${(p.rev/1e6).toFixed(1)}M / ${p.size}emp = $${(p.rev/p.size/1e6).toFixed(1)}M/emp | ${p.ind}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
