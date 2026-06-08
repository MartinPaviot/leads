import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql, not } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const SRC = sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`;
async function cnt(label: string, cond: ReturnType<typeof sql>) {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), SRC, cond));
  console.log(`  ${label}: ${r.n}`);
}
async function main(){
  const [tot] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), SRC));
  console.log(`223-source rows: ${tot.n}`);
  await cnt("has domain", sql`${companies.domain} is not null and ${companies.domain} <> ''`);
  await cnt("has industry", sql`${companies.industry} is not null and ${companies.industry} <> ''`);
  await cnt("has size", sql`${companies.size} is not null`);
  await cnt("has revenue", sql`${companies.revenue} is not null`);
  await cnt("has state/canton (props)", sql`${companies.properties}->>'state' is not null and ${companies.properties}->>'state' <> ''`);
  await cnt("has country (props)", sql`${companies.properties}->>'country' is not null and ${companies.properties}->>'country' <> ''`);
  const sample = await db.select({ name: companies.name, domain: companies.domain, industry: companies.industry, size: companies.size, revenue: companies.revenue, st: sql<string>`${companies.properties}->>'state'` })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), SRC)).limit(6);
  console.log("sample:");
  for(const s of sample) console.log(`  ${s.name.slice(0,30).padEnd(30)} | dom=${s.domain||"∅"} | ind=${s.industry||"∅"} | size=${s.size||"∅"} | rev=${s.revenue||"∅"} | ${s.st||"∅"}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
