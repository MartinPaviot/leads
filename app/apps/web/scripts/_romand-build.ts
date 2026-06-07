/**
 * One-off: build the Suisse-romande NON-TECH call list on prod.
 * Broad romand locations × many non-tech sectors, paginated Apollo
 * (more leads), tech excluded, decision-makers extracted, phones
 * enriched via the Apollo->Lusha waterfall. Delete after use.
 */
import { db } from "@/db";
import { tenants, companies, contacts } from "@/db/schema";
import { and, eq, isNull, desc, sql } from "drizzle-orm";
import {
  searchOrganizations,
  searchPeople,
  employeeCountToRange,
} from "@/lib/integrations/apollo-client";
import { enrichContact } from "@/lib/providers/contact-enrichment/waterfall";

const ROMAND = ["Geneva", "Lausanne", "Vaud", "Valais", "Fribourg", "Neuchâtel", "Jura", "Sion", "Montreux", "Nyon", "Vevey", "Morges"];
const SECTORS = [
  "health care", "hospital & health care", "medical practice", "mental health care", "pharmaceuticals",
  "non-profit organization management", "philanthropy", "civic & social organization", "fund-raising",
  "government administration", "public policy", "education management", "higher education", "primary/secondary education",
  "manufacturing", "construction", "building materials", "machinery", "automotive", "food production",
  "retail", "wholesale", "consumer goods", "hospitality", "hotels", "food & beverages", "leisure travel & tourism",
  "real estate", "logistics and supply chain", "transportation/trucking/railroad", "financial services",
  "insurance", "banking", "utilities", "renewables & environment", "facilities services", "luxury goods & jewelry",
];
const SIZES = ["101,200", "201,500", "501,1000"];
const SENIORITIES = ["c_suite", "vp", "director", "head", "owner", "partner"];
const TECH_RE = /\b(software|information technology|internet|comput|saas|technolog|digital|it services|telecommunic|semiconductor|e-?learning)\b/i;

const TARGET_COMPANIES = 150;
const PER_COMPANY = 2;
const ENRICH_CAP = 250;

function cleanDomain(raw?: string | null): string | null {
  if (!raw) return null;
  return raw.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").trim() || null;
}

async function main() {
  // 1. Pilae tenant — pilae.ch login, locked Pilae ICP, 767 companies.
  const tenantId = "47dca783-dac0-45a5-85cb-d217b2a3174d";
  const [t] = await db.select({ name: tenants.name, settings: tenants.settings }).from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) { console.log("Pilae tenant not found"); return; }
  const [cc] = await db.select({ n: sql<number>`count(*)::int` }).from(companies).where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));
  console.log(`tenant ${tenantId} (${t?.name}) — ${cc.n} existing companies`);

  // 2. Merge the romand non-tech ICP into settings (preserve other keys).
  const settings = { ...((t?.settings as Record<string, unknown>) ?? {}) };
  settings.targetGeographies = ROMAND;
  settings.targetIndustries = SECTORS;
  settings.targetCompanySizes = ["101-200", "201-500", "501-1000"];
  settings.targetSeniorities = SENIORITIES;
  settings.excludeKeywords = ["software", "information technology", "saas", "tech"];
  await db.update(tenants).set({ settings }).where(eq(tenants.id, tenantId));
  console.log("set romand non-tech ICP on tenant settings (tech excluded)");

  // 3. Dedup set.
  const existing = await db.select({ domain: companies.domain }).from(companies).where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt)));
  const known = new Set(existing.map((c) => c.domain?.toLowerCase()).filter((d): d is string => !!d));

  // 4. Paginated Apollo source.
  const fresh: Array<{ id: string; domain: string; name: string }> = [];
  for (let page = 1; page <= 8 && fresh.length < TARGET_COMPANIES; page++) {
    let res;
    try {
      res = await searchOrganizations({ organization_locations: ROMAND, q_organization_keyword_tags: SECTORS, organization_num_employees_ranges: SIZES, page, per_page: 100 });
    } catch (e) { console.warn(`apollo page ${page}:`, (e as Error).message); break; }
    const orgs = res.organizations ?? [];
    if (!orgs.length) break;
    for (const o of orgs) {
      if (fresh.length >= TARGET_COMPANIES) break;
      const domain = cleanDomain(o.primary_domain ?? o.website_url);
      if (!domain || known.has(domain)) continue;
      if (TECH_RE.test(o.industry ?? "")) continue;
      known.add(domain);
      try {
        const [row] = await db.insert(companies).values({
          tenantId, name: o.name, domain, industry: o.industry ?? null,
          size: o.estimated_num_employees ? employeeCountToRange(o.estimated_num_employees) : null,
          description: o.description ?? null, sourceSystem: "apollo", lastEnrichedAt: new Date(),
          properties: { source: "icp_sourcing", apollo_id: o.id, country: (o as Record<string, unknown>).country ?? null, search_strategy: "romand_non_tech" },
        }).returning({ id: companies.id });
        fresh.push({ id: row.id, domain, name: o.name });
      } catch { /* dup race */ }
    }
    console.log(`page ${page}: ${orgs.length} scanned -> ${fresh.length} new romand non-tech`);
    if (orgs.length < 100) break;
  }
  console.log(`=> ${fresh.length} new companies inserted`);

  // 5. Decision-makers.
  const newContacts: Array<{ id: string; email: string | null; firstName: string | null; lastName: string | null; domain: string; companyName: string }> = [];
  for (const c of fresh) {
    let people;
    try {
      const r = await searchPeople({ q_organization_domains: c.domain, person_seniorities: SENIORITIES, per_page: PER_COMPANY });
      people = (r.people ?? []).slice(0, PER_COMPANY);
    } catch { continue; }
    for (const p of people as Array<Record<string, unknown>>) {
      const email = (p.email as string | undefined)?.trim()?.toLowerCase() ?? null;
      if (email) {
        const [ex] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email))).limit(1);
        if (ex) continue;
      }
      const nameParts = ((p.name as string | undefined) ?? "").split(" ");
      const fn = (p.first_name as string | undefined) ?? nameParts[0] ?? null;
      const ln = (p.last_name as string | undefined) ?? (nameParts.slice(1).join(" ") || null);
      try {
        const [row] = await db.insert(contacts).values({
          tenantId, companyId: c.id, firstName: fn, lastName: ln, email,
          title: (p.title as string | undefined) ?? null, linkedinUrl: (p.linkedin_url as string | undefined) ?? null,
          sourceSystem: "apollo",
          properties: { enrichment_source: "apollo_search", seniority: p.seniority ?? null, apollo_id: p.id ?? null, discovered_via: "romand_build" },
        }).returning({ id: contacts.id });
        newContacts.push({ id: row.id, email, firstName: fn, lastName: ln, domain: c.domain, companyName: c.name });
      } catch { /* dup */ }
    }
  }
  console.log(`=> ${newContacts.length} new decision-maker contacts inserted`);

  // 6. Phone enrichment via the Apollo->Lusha waterfall (CH).
  let enriched = 0, withPhone = 0;
  for (const ct of newContacts.slice(0, ENRICH_CAP)) {
    try {
      const wf = await enrichContact(
        { firstName: ct.firstName ?? undefined, lastName: ct.lastName ?? undefined, email: ct.email ?? undefined, companyDomain: ct.domain, companyName: ct.companyName },
        { tenantId },
      );
      const d = wf.data;
      const phone = d.mobilePhone ?? d.phones?.[0]?.number ?? null;
      const setObj: Record<string, unknown> = {
        lastEnrichedAt: new Date(),
        properties: sql`COALESCE(${contacts.properties}, '{}'::jsonb) || ${JSON.stringify({ enrichment_source: "apollo+lusha", phones: d.phones ?? [], email_status: d.emailStatus ?? null, enriched_at: new Date().toISOString() })}::jsonb`,
      };
      if (phone) { setObj.phone = phone; withPhone++; }
      if (!ct.email && d.email) setObj.email = d.email;
      await db.update(contacts).set(setObj).where(eq(contacts.id, ct.id));
      enriched++;
      if (enriched % 20 === 0) console.log(`enriched ${enriched}, ${withPhone} with phone`);
    } catch { /* non-fatal per contact */ }
  }
  console.log(`=> enriched ${enriched} contacts; ${withPhone} now have a phone`);
  console.log(`DONE — companies +${fresh.length}, contacts +${newContacts.length}, phones ${withPhone}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
