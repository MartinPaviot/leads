/** Extract decision-makers (+verified emails via Apollo id-match) for the 223
 *  net-new romand rev>=8M companies. Phones come later via Lusha waves. */
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { searchPeople, enrichPerson } from "@/lib/integrations/apollo-client";
const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const SEN = ["c_suite","vp","director","head","owner","partner"];
const PER_COMPANY = 3;
async function main(){
  if(!process.env.NODE_EXTRA_CA_CERTS){ console.error("set cert bundle"); process.exit(1); }
  const cos = await db.select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies).where(and(eq(companies.tenantId,tid), isNull(companies.deletedAt), isNull(companies.excludedReason),
      sql`${companies.properties}->>'source' = 'apollo_romand_rev8m_sub100'`, sql`${companies.domain} is not null and ${companies.domain} <> ''`));
  console.log(`extracting decideurs from ${cos.length} romand companies (${PER_COMPANY}/co)`);
  let inserted=0, withEmail=0, scanned=0;
  for(const c of cos){
    scanned++;
    let people: Array<Record<string,unknown>> = [];
    try { const r = await searchPeople({ q_organization_domains: c.domain!, person_seniorities: SEN, per_page: PER_COMPANY }); people = ((r.people??[]) as Array<Record<string,unknown>>).filter(p=>p.id).slice(0,PER_COMPANY); } catch { continue; }
    for(const p of people){
      const apolloId = String(p.id);
      let m: Awaited<ReturnType<typeof enrichPerson>> = null;
      try { m = await enrichPerson({ id: apolloId, reveal_personal_emails: true }); } catch {}
      const email = (m?.email ?? (p.email as string|undefined) ?? null)?.trim()?.toLowerCase() ?? null;
      if(email){ const [ex] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.tenantId,tid), eq(contacts.email,email))).limit(1); if(ex) continue; }
      try {
        await db.insert(contacts).values({ tenantId: tid, companyId: c.id, firstName: m?.first_name ?? (p.first_name as string|undefined) ?? null, lastName: m?.last_name ?? null, email, title: m?.title ?? (p.title as string|undefined) ?? null, linkedinUrl: m?.linkedin_url ?? null, sourceSystem: "apollo", lastEnrichedAt: new Date(), properties: { enrichment_source: "apollo_match", seniority: m?.seniority ?? p.seniority ?? null, apollo_id: apolloId, email_status: m?.email_status ?? null, discovered_via: "romand_rev8m_decideurs" } });
        inserted++; if(email) withEmail++;
      } catch {}
    }
    if(scanned%40===0) console.log(`  ${scanned}/${cos.length} cos -> ${inserted} contacts (${withEmail} email)`);
  }
  console.log(`=> DONE: ${inserted} decideurs (${withEmail} verified email) from ${cos.length} romand companies`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1);});
