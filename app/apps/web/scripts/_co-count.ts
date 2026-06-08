import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main(){
  const [tot] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt)));
  const [rev8] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`));
  console.log(`total companies (tenant): ${tot.n}  |  new via 8M/<100 ICP: ${rev8.n}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
