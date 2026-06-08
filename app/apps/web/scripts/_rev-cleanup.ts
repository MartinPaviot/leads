import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main(){
  // 1) Null the unreliable Apollo revenue on the whole sourced set.
  const nulled = await db.update(companies).set({ revenue: null, properties: sql`(${companies.properties} - 'annual_revenue') || '{"revenue_unreliable":"apollo_estimate_removed"}'::jsonb` })
    .where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`))
    .returning({ id: companies.id });
  // 2) Exclude micro (<=5 employees) — not ICP.
  const micro = await db.update(companies).set({ excludedReason: "sourced_micro" })
    .where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), isNull(companies.excludedReason),
      sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`,
      sql`(${companies.size} ~ '^[0-9]+$' and ${companies.size}::int <= 5)`))
    .returning({ id: companies.id });
  // remaining active
  const [act] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), isNull(companies.excludedReason), sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`));
  // size distribution of the remaining
  const dist = await db.select({ band: sql<string>`case when ${companies.size}::int<=10 then '6-10' when ${companies.size}::int<=20 then '11-20' when ${companies.size}::int<=50 then '21-50' else '51-100' end`, n: sql<number>`count(*)::int` })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), isNull(companies.excludedReason), sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`, sql`${companies.size} ~ '^[0-9]+$'`)).groupBy(sql`1`);
  console.log(`revenue nulled on ${nulled.length}; micro(<=5) excluded ${micro.length}; remaining active ${act.n}`);
  console.log("size bands (remaining):", dist.map(d=>`${d.band}:${d.n}`).join(", "));
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
