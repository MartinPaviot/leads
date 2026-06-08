/**
 * LUSHA DIAG (throwaway) — why did the batch cliff to ~4% phone hits after 8?
 * Calls Lusha RAW on 15 already-revealed contacts (linkedin/name persisted by
 * the partial batch) and prints the real status per call. Distinguishes:
 *   429 = rate limit | 402/403 = credits | 404/empty = coverage | 200+phones = ok
 */
import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";

async function main() {
  const key = process.env.LUSHA_API_KEY ?? "";
  console.log(`cert=${process.env.NODE_EXTRA_CA_CERTS ? "set" : "MISSING"} key=${key.length}`);
  const rows = await db
    .select({ id: contacts.id, fn: contacts.firstName, ln: contacts.lastName, li: contacts.linkedinUrl, companyId: contacts.companyId })
    .from(contacts)
    .where(and(eq(contacts.tenantId, tid), isNull(contacts.deletedAt), sql`(${contacts.phone} is null or ${contacts.phone} = '')`, sql`(${contacts.linkedinUrl} is not null or ${contacts.lastName} is not null)`))
    .limit(15);
  console.log(`testing ${rows.length} revealed-but-phoneless contacts\n`);

  const tally: Record<string, number> = {};
  for (const r of rows) {
    const [co] = r.companyId ? await db.select({ domain: companies.domain }).from(companies).where(eq(companies.id, r.companyId)).limit(1) : [{ domain: null }];
    const qs = new URLSearchParams();
    if (r.li) qs.set("linkedinUrl", r.li);
    if (r.fn) qs.set("firstName", r.fn);
    if (r.ln) qs.set("lastName", r.ln);
    if (co?.domain) qs.set("companyDomain", co.domain);
    let label: string;
    try {
      const res = await fetch(`https://api.lusha.com/v2/person?${qs}`, { headers: { api_key: key, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
      const body = await res.text().catch(() => "");
      let nPhones = -1;
      try { const j = JSON.parse(body); nPhones = (j?.contact?.data?.phoneNumbers ?? j?.data?.phoneNumbers ?? []).length; } catch { /* */ }
      label = res.status === 200 ? (nPhones > 0 ? "200+phones" : "200+0phones") : `${res.status}`;
      console.log(`  ${r.fn} ${r.ln} li=${r.li ? "y" : "n"} -> status=${res.status} phones=${nPhones} ${res.status !== 200 ? body.slice(0, 140) : ""}`);
    } catch (e) {
      const err = e as Error & { cause?: { code?: string } };
      label = `FETCH:${err.cause?.code ?? err.name}`;
      console.log(`  ${r.fn} ${r.ln} -> ${label} ${err.message}`);
    }
    tally[label] = (tally[label] ?? 0) + 1;
  }
  console.log(`\nTALLY: ${JSON.stringify(tally)}`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
