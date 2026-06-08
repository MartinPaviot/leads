/**
 * PHONE PROBE (throwaway) — the hard gate before re-spending on a batch.
 *
 * For a few real romand non-tech companies, run the full chain and print
 * every field so we can see exactly where a phone does/doesn't appear:
 *   1) searchPeople(domain)            -> person.id + first_name (identity masked)
 *   2) enrichPerson({id, reveal})      -> last_name, linkedin_url, email, phones
 *   3) enrichPersonLusha(linkedinUrl)  -> phones  (strongest key)
 *   3b) enrichPersonLusha(name+company)-> phones  (fallback key)
 *
 * Verdict per contact: APOLLO_PHONE / LUSHA_VIA_LI / LUSHA_VIA_NAME / NO_PHONE.
 * Delete after use.
 */
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { searchPeople, enrichPerson } from "@/lib/integrations/apollo-client";
import { enrichPersonLusha } from "@/lib/integrations/lusha-client";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const TECH_RE = /soft|inform|internet|comput|saas|technolog|digital|telecom|semiconduct/i;
const SEN = ["c_suite", "vp", "director", "head", "owner", "partner"];
const WANT = 3; // successful chains to collect

function phones(arr: Array<{ raw_number?: string; number?: string; type?: string }> | undefined): string {
  if (!arr || arr.length === 0) return "[]";
  return arr.map((p) => `${p.raw_number ?? p.number}(${p.type ?? "?"})`).join(", ");
}

async function main() {
  console.log(`APOLLO_API_KEY set: ${Boolean(process.env.APOLLO_API_KEY)} | LUSHA_API_KEY set: ${Boolean(process.env.LUSHA_API_KEY)}`);
  const cos = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain, industry: companies.industry })
    .from(companies)
    .where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt), isNull(companies.excludedReason), sql`${companies.domain} is not null and ${companies.domain} <> ''`))
    .limit(60);
  const target = cos.filter((c) => !TECH_RE.test(c.industry ?? ""));
  console.log(`candidate companies (non-tech, with domain): ${target.length}\n`);

  let done = 0;
  let apolloPhone = 0, lushaLi = 0, lushaName = 0;
  for (const c of target) {
    if (done >= WANT) break;

    // 1) SEARCH
    let person: Record<string, unknown> | undefined;
    try {
      const r = await searchPeople({ q_organization_domains: c.domain!, person_seniorities: SEN, per_page: 3 });
      person = ((r.people ?? []) as Array<Record<string, unknown>>).find((p) => p.id);
    } catch (e) {
      console.log(`- ${c.name} (${c.domain}): search error ${(e as Error).message.slice(0, 80)}`);
      continue;
    }
    if (!person) {
      console.log(`- ${c.name} (${c.domain}): search returned 0 people`);
      continue;
    }
    done++;
    const sId = String(person.id);
    const sFirst = (person.first_name as string) ?? null;
    const sLast = (person.last_name as string) ?? null;
    const sLi = (person.linkedin_url as string) ?? null;
    console.log(`\n===== ${done}/${WANT}  ${c.name}  (${c.domain})  [${c.industry}] =====`);
    console.log(`  SEARCH: id=${sId} first=${sFirst ?? "-"} last=${sLast ?? "-"} li=${sLi ?? "-"}`);

    // 2) MATCH by id + reveal
    let m: Awaited<ReturnType<typeof enrichPerson>> = null;
    try {
      m = await enrichPerson({ id: sId, reveal_personal_emails: true });
    } catch (e) {
      console.log(`  MATCH error: ${(e as Error).message.slice(0, 120)}`);
    }
    const mFirst = m?.first_name ?? sFirst;
    const mLast = m?.last_name ?? sLast;
    const mLi = m?.linkedin_url ?? sLi;
    console.log(`  MATCH:  first=${mFirst ?? "-"} last=${mLast ?? "-"} li=${mLi ?? "-"} email=${m?.email ?? "-"}(${m?.email_status ?? "-"}) phones=${phones(m?.phone_numbers)}`);
    if (m?.phone_numbers && m.phone_numbers.length > 0) apolloPhone++;

    // 3) LUSHA via linkedin
    if (mLi) {
      try {
        const lz = await enrichPersonLusha({ linkedinUrl: mLi });
        console.log(`  LUSHA(li):   email=${lz?.email ?? "-"} phones=${phones(lz?.phones)}`);
        if (lz?.phones && lz.phones.length > 0) lushaLi++;
      } catch (e) { console.log(`  LUSHA(li) error: ${(e as Error).message.slice(0, 120)}`); }
    } else {
      console.log(`  LUSHA(li):   skipped (no linkedin from match)`);
    }

    // 3b) LUSHA via name + company
    if (mFirst && mLast) {
      try {
        const lz = await enrichPersonLusha({ firstName: mFirst, lastName: mLast, companyDomain: c.domain!, companyName: c.name });
        console.log(`  LUSHA(name): email=${lz?.email ?? "-"} phones=${phones(lz?.phones)}`);
        if (lz?.phones && lz.phones.length > 0) lushaName++;
      } catch (e) { console.log(`  LUSHA(name) error: ${(e as Error).message.slice(0, 120)}`); }
    } else {
      console.log(`  LUSHA(name): skipped (no full name${mLast ? "" : " — last name missing"})`);
    }
  }

  console.log(`\n================ VERDICT ================`);
  console.log(`chains run: ${done}`);
  console.log(`  Apollo inline phone:      ${apolloPhone}/${done}`);
  console.log(`  Lusha via linkedin:       ${lushaLi}/${done}`);
  console.log(`  Lusha via name+company:   ${lushaName}/${done}`);
  const anyPhone = apolloPhone + lushaLi + lushaName;
  console.log(anyPhone > 0 ? `=> GATE PASS: at least one path yields phones. Proceed to batch.` : `=> GATE FAIL: 0 phones on every path. Do NOT batch — escalate (Zeliq/Kaspr/landline).`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
