/**
 * Pilae phone-enrichment WAVE (tenant 47dca783, romand non-tech).
 *
 * Free Lusha plan = 100 calls/day, 40/min. So we enrich in daily waves.
 * The 363 contacts are already identity-revealed (last_name + linkedin +
 * verified email via Apollo people/match), so a wave only needs Lusha — no
 * Apollo reveal credits wasted. Idempotent: only touches phoneless contacts,
 * so re-runs resume. Stops immediately on 429 to preserve the next day's run.
 *
 * MUST run with the local cert bundle (Lusha TLS):
 *   NODE_EXTRA_CA_CERTS="C:/Users/marti/leads/.cacerts.pem" \
 *     npx tsx --env-file=.env.local scripts/_contacts-phones.ts
 *
 * Delete after the campaign is loaded; the durable path is the enrich-contact
 * Inngest function.
 */
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { enrichPersonLusha, type LushaPhone } from "@/lib/integrations/lusha-client";

const tid = "47dca783-dac0-45a5-85cb-d217b2a3174d";
const DAILY_LUSHA = 95;      // safety margin under the 100/day cap
const MIN_INTERVAL_MS = 1800; // ~33/min, under the 40/min cap

function scorePhone(p: LushaPhone): number {
  if (p.doNotCall) return -1;
  const n = p.number.replace(/\s/g, "");
  let s = /^\+41/.test(n) ? 100 : /^\+33/.test(n) ? 60 : 10;
  if (p.type === "mobile") s += 20;
  return s;
}
function bestPhone(phones: LushaPhone[]): LushaPhone | null {
  return phones.map((p) => ({ p, s: scorePhone(p) })).filter((x) => x.s >= 0).sort((a, b) => b.s - a.s)[0]?.p ?? null;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  if (!process.env.NODE_EXTRA_CA_CERTS) { console.error("ABORT: NODE_EXTRA_CA_CERTS unset — Lusha will TLS-fail. Re-run with the cert bundle."); process.exit(1); }

  const coRows = await db.select({ id: companies.id, name: companies.name, domain: companies.domain }).from(companies).where(and(eq(companies.tenantId, tid), isNull(companies.deletedAt)));
  const coMap = new Map(coRows.map((c) => [c.id, { name: c.name, domain: c.domain }]));

  // Phoneless contacts that are already identity-revealed (linkedin OR last name).
  const targets = await db
    .select({ id: contacts.id, fn: contacts.firstName, ln: contacts.lastName, li: contacts.linkedinUrl, email: contacts.email, companyId: contacts.companyId, props: contacts.properties })
    .from(contacts)
    .where(and(
      eq(contacts.tenantId, tid), isNull(contacts.deletedAt),
      sql`(${contacts.phone} is null or ${contacts.phone} = '')`,
      sql`(${contacts.linkedinUrl} is not null or ${contacts.lastName} is not null)`,
    ))
    .limit(DAILY_LUSHA);
  console.log(`wave: ${targets.length} phoneless revealed contacts to try (cap ${DAILY_LUSHA}/day)\n`);

  let calls = 0, withPhone = 0, rateLimited = false;
  for (const t of targets) {
    if (calls >= DAILY_LUSHA) break;
    const co = t.companyId ? coMap.get(t.companyId) : undefined;
    if (!t.li && !(t.fn && t.ln)) continue;
    if (calls > 0) await sleep(MIN_INTERVAL_MS);
    calls++;
    let lz: Awaited<ReturnType<typeof enrichPersonLusha>> = null;
    try {
      lz = await enrichPersonLusha({ firstName: t.fn ?? undefined, lastName: t.ln ?? undefined, linkedinUrl: t.li ?? undefined, companyDomain: co?.domain ?? undefined, companyName: co?.name });
    } catch (e) {
      const msg = (e as Error).message;
      if (/429|rate limit/i.test(msg)) { rateLimited = true; console.log(`  429 hit at call ${calls} — daily Lusha budget exhausted, stopping to preserve next wave.`); break; }
      continue; // other errors: skip this contact
    }
    if (!lz) continue;
    const phones = lz.phones ?? [];
    const best = bestPhone(phones);
    const props = (t.props as Record<string, unknown> | null) ?? {};
    const set: Record<string, unknown> = {
      lastEnrichedAt: new Date(),
      properties: sql`COALESCE(${contacts.properties}, '{}'::jsonb) || ${JSON.stringify({ ...props, enrichment_source: "apollo_match+lusha", phones, lusha_email: lz.email ?? null, enriched_at: new Date().toISOString() })}::jsonb`,
    };
    if (best) { set.phone = best.number; withPhone++; }
    if (!t.email && lz.email) set.email = lz.email;
    await db.update(contacts).set(set).where(eq(contacts.id, t.id));
    if (best || calls <= 6 || calls % 20 === 0) console.log(`  ${calls}/${targets.length} ${t.fn ?? ""} ${t.ln ?? ""} @${co?.name ?? "?"} -> ${best?.number ?? "no phone"} (withPhone=${withPhone})`);
  }

  console.log(`\n=> WAVE DONE: lushaCalls=${calls} newPhones=${withPhone} rateLimited=${rateLimited}`);
  if (rateLimited || calls >= DAILY_LUSHA) console.log(`   Next wave: after the daily reset (~24h). Re-run the same command.`);
  await (db as unknown as { $client?: { end?: () => Promise<void> } }).$client?.end?.();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
