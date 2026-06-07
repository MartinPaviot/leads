/**
 * MATCH DEBUG (throwaway) — isolate which people/match param triggers the 400,
 * and see what identity (last_name/linkedin/email) the working form returns.
 */
import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { searchPeople, enrichPerson } from "@/lib/integrations/apollo-client";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";

type Combo = { label: string; params: Parameters<typeof enrichPerson>[0] };

async function tryCombo(c: Combo) {
  try {
    const p = await enrichPerson(c.params);
    console.log(`  [${c.label}] OK -> first=${p?.first_name ?? "-"} last=${p?.last_name ?? "-"} li=${p?.linkedin_url ?? "-"} email=${p?.email ?? "-"}(${p?.email_status ?? "-"}) phones=${JSON.stringify(p?.phone_numbers ?? [])}`);
  } catch (e) {
    console.log(`  [${c.label}] ERR -> ${(e as Error).message}`);
  }
}

async function main() {
  const [co] = await db
    .select({ id: companies.id, name: companies.name, domain: companies.domain })
    .from(companies)
    .where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt), isNull(companies.excludedReason), sql`${companies.domain} is not null and ${companies.domain} <> ''`))
    .limit(1);
  console.log(`company: ${co.name} (${co.domain})`);
  const r = await searchPeople({ q_organization_domains: co.domain!, person_seniorities: ["c_suite", "vp", "director", "owner"], per_page: 3 });
  const person = ((r.people ?? []) as Array<Record<string, unknown>>).find((p) => p.id)!;
  const id = String(person.id);
  const first = (person.first_name as string) ?? undefined;
  console.log(`search person: id=${id} first=${first ?? "-"} last=${(person.last_name as string) ?? "-"} li=${(person.linkedin_url as string) ?? "-"}\n`);

  await tryCombo({ label: "A name+org+domain (old form)", params: { first_name: first, organization_name: co.name, domain: co.domain! } });
  await tryCombo({ label: "B id only", params: { id } });
  await tryCombo({ label: "C id + revealEmail", params: { id, reveal_personal_emails: true } });
  await tryCombo({ label: "D name+org+domain + revealEmail", params: { first_name: first, organization_name: co.name, domain: co.domain!, reveal_personal_emails: true } });
  await tryCombo({ label: "E name+org+domain + revealEmail+revealPhone", params: { first_name: first, organization_name: co.name, domain: co.domain!, reveal_personal_emails: true, reveal_phone_number: true } });
  await tryCombo({ label: "F id + revealEmail+revealPhone", params: { id, reveal_personal_emails: true, reveal_phone_number: true } });

  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
