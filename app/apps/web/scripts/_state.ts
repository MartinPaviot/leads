/** State + Lusha reset probe (throwaway). */
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const [tot] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt)));
  const [withPhone] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`${contacts.phone} is not null and ${contacts.phone} <> ''`));
  const [withEmail] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`${contacts.email} is not null and ${contacts.email} <> ''`));
  const [withLi] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`${contacts.linkedinUrl} is not null and ${contacts.linkedinUrl} <> ''`));
  const [withLast] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`${contacts.lastName} is not null and ${contacts.lastName} <> ''`));
  const [verified] = await db.select({ n: sql<number>`count(*)::int` }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`${contacts.properties}->>'email_status' = 'verified'`));
  const ch = await db.select({ p: contacts.phone }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`${contacts.phone} like '+41%'`));
  const fr = await db.select({ p: contacts.phone }).from(contacts).where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`${contacts.phone} like '+33%'`));
  console.log(`CONTACTS tenant ${tid}:`);
  console.log(`  total=${tot.n}  withPhone=${withPhone.n} (CH=${ch.length} FR=${fr.length})  withEmail=${withEmail.n}  verifiedEmail=${verified.n}  withLinkedIn=${withLi.n}  withLastName=${withLast.n}`);

  // Lusha reset probe (429 is rejected, doesn't consume quota)
  try {
    const res = await fetch(`https://api.lusha.com/v2/person?firstName=Test&lastName=Probe&companyDomain=example.com`, { headers: { api_key: process.env.LUSHA_API_KEY ?? "", accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    const hdr: Record<string, string> = {};
    res.headers.forEach((v, k) => { if (/limit|reset|retry|remain/i.test(k)) hdr[k] = v; });
    const body = await res.text().catch(() => "");
    console.log(`\nLUSHA probe status=${res.status}`);
    console.log(`  rate headers: ${JSON.stringify(hdr)}`);
    console.log(`  body: ${body.slice(0, 300)}`);
  } catch (e) { console.log(`lusha probe err: ${(e as Error).message}`); }
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
