/** Full firmographic enrich for the 223 romand companies: store industry,
 *  size, revenue, description, linkedin (Apollo SEARCH masked these; ENRICH has them). */
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { enrichOrganization } from "@/lib/integrations/apollo-client";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
async function main(){
  const rows = await db.select({ id: companies.id, name: companies.name, domain: companies.domain, props: companies.properties })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt),
      sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`, sql`${companies.domain} is not null`));
  console.log(`full-enriching ${rows.length} companies`);
  let ind=0, sz=0, rev=0, li=0, i=0;
  for(const r of rows){
    i++;
    let o: Awaited<ReturnType<typeof enrichOrganization>> = null;
    try { o = await enrichOrganization(r.domain!); } catch {}
    if(!o){ continue; }
    const set: Record<string,unknown> = {
      industry: o.industry ?? null,
      size: o.estimated_num_employees != null ? String(o.estimated_num_employees) : null,
      revenue: o.annual_revenue != null ? String(o.annual_revenue) : null,
      description: o.description ?? null,
      lastEnrichedAt: new Date(),
      properties: sql`COALESCE(${companies.properties},'{}'::jsonb) || ${JSON.stringify({ linkedin_url: o.linkedin_url ?? null, founded_year: o.founded_year ?? null, technologies: (o.technology_names ?? []).slice(0,12), annual_revenue: o.annual_revenue ?? null, employees: o.estimated_num_employees ?? null })}::jsonb`,
    };
    await db.update(companies).set(set).where(eq(companies.id, r.id));
    if(o.industry) ind++; if(o.estimated_num_employees!=null) sz++; if(o.annual_revenue!=null) rev++; if(o.linkedin_url) li++;
    if(i%40===0) console.log(`  ${i}/${rows.length} (industry=${ind} size=${sz} rev=${rev} li=${li})`);
  }
  console.log(`=> DONE ${rows.length}: industry=${ind}, size=${sz}, revenue=${rev}, linkedin=${li}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
