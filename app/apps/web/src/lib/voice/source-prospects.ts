/**
 * Source callable prospects for a tenant from its ICP — the supply side that
 * guarantees the call list is never empty.
 *
 * ICP settings -> Apollo company search -> insert new companies -> Apollo
 * people search per company -> insert new contacts -> fire `contact/created`
 * so the existing enrichment function resolves phone + email. The daily call
 * list then tops up from these freshly-callable contacts.
 *
 * Pure lib so it can run from the Inngest job (automatic) and be invoked /
 * tested directly. Apollo-gated; degrades to a no-op with a reason when no key.
 */

import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { and, eq, isNull, inArray, sql } from "drizzle-orm";
import { normalizeTitle } from "@/lib/contacts/role-status";
import {
  searchOrganizations,
  searchPeople,
  isApolloAvailable,
  type OrgSearchParams,
} from "@/lib/integrations/apollo-client";
import { flatFiltersToHardApollo } from "@/lib/icp/flat-filters-to-apollo";
import { sizesToApolloRanges, senioritiesToApollo } from "@/lib/config/icp-constants";
import { getTenantSettings, hasUsableIcp, parseRoleKeywords } from "@/lib/config/tenant-settings";
import { filterAllowed, filterAllowedContacts } from "@/lib/accounts/suppression";
import { inngest } from "@/inngest/client";

export interface SourceResult {
  ok: boolean;
  reason?: "apollo_unavailable" | "no_icp" | "no_orgs";
  companiesAdded: number;
  contactsAdded: number;
}

/** Build an Apollo org-search from the tenant's ICP settings. */
function orgParamsFromIcp(settings: Awaited<ReturnType<typeof getTenantSettings>>): OrgSearchParams {
  const hard = flatFiltersToHardApollo({
    excludeGeographies: settings.excludeGeographies,
    technologies: settings.targetTechnologies,
    revenueMin: settings.targetRevenueMin,
    revenueMax: settings.targetRevenueMax,
    fundingRecencyDays: settings.fundingRecencyDays,
    totalFundingMin: settings.totalFundingMin,
    totalFundingMax: settings.totalFundingMax,
    minJobOpenings: settings.minJobOpenings,
    hiringTitles: settings.hiringTitles,
  });
  const sizeRanges = sizesToApolloRanges(settings.targetCompanySizes ?? []);
  const keywordTags = [...(settings.targetIndustries ?? []), ...(settings.targetKeywords ?? [])].filter(Boolean);
  return {
    ...hard,
    ...(sizeRanges.length ? { organization_num_employees_ranges: sizeRanges } : {}),
    ...(settings.targetGeographies?.length ? { organization_locations: settings.targetGeographies } : {}),
    ...(keywordTags.length ? { q_organization_keyword_tags: keywordTags } : {}),
    page: 1,
    per_page: 100,
  };
}

/**
 * Source up to `maxCompanies` new companies and `maxContactsPerCompany`
 * contacts each into the tenant from its ICP, then kick off enrichment.
 */
export async function sourceProspectsForTenant(args: {
  tenantId: string;
  maxCompanies?: number;
  maxContactsPerCompany?: number;
}): Promise<SourceResult> {
  const tenantId = args.tenantId;
  const maxCompanies = Math.max(1, Math.min(100, args.maxCompanies ?? 25));
  const perCompany = Math.max(1, Math.min(25, args.maxContactsPerCompany ?? 5));

  if (!isApolloAvailable()) {
    return { ok: false, reason: "apollo_unavailable", companiesAdded: 0, contactsAdded: 0 };
  }

  const settings = await getTenantSettings(tenantId);
  if (!hasUsableIcp(settings)) {
    return { ok: false, reason: "no_icp", companiesAdded: 0, contactsAdded: 0 };
  }

  // Apollo company search from the ICP.
  let orgs;
  try {
    const res = await searchOrganizations(orgParamsFromIcp(settings));
    orgs = res.organizations.slice(0, maxCompanies);
  } catch {
    return { ok: false, reason: "no_orgs", companiesAdded: 0, contactsAdded: 0 };
  }
  if (orgs.length === 0) {
    return { ok: false, reason: "no_orgs", companiesAdded: 0, contactsAdded: 0 };
  }

  // Dedup companies by domain.
  const domains = orgs.map((o) => o.primary_domain?.toLowerCase()).filter((d): d is string => !!d);
  const existing = domains.length
    ? await db
        .select({ domain: companies.domain })
        .from(companies)
        .where(and(eq(companies.tenantId, tenantId), inArray(companies.domain, domains)))
    : [];
  const existingDomains = new Set(existing.map((c) => c.domain?.toLowerCase()).filter(Boolean));

  // Suppression ledger: never re-source an account the user removed or excluded
  // (durable across hard-deletes + domain-less identities). Keep only allowed.
  const allowedOrgs = await filterAllowed(
    tenantId,
    orgs.map((o) => ({ domain: o.primary_domain, name: o.name, nativeId: o.id, nativeIdType: "apollo", _d: o.primary_domain?.toLowerCase() ?? null })),
  );
  const allowedDomains = new Set(allowedOrgs.map((o) => o._d).filter((x): x is string => !!x));

  const seniorities = senioritiesToApollo(settings.targetSeniorities ?? []);
  const titles = parseRoleKeywords(settings); // lowercase role nouns from targetRoles
  const effectiveSeniorities = seniorities.length ? seniorities : ["c_suite", "vp", "director", "head"];

  let companiesAdded = 0;
  let contactsAdded = 0;

  for (const org of orgs) {
    const domain = org.primary_domain?.toLowerCase();
    if (!domain || existingDomains.has(domain)) continue;
    if (!allowedDomains.has(domain)) continue; // suppressed (removed/excluded)
    existingDomains.add(domain);

    // Insert the company.
    let companyId: string;
    try {
      const [row] = await db
        .insert(companies)
        .values({
          tenantId,
          name: org.name,
          domain,
          industry: org.industry ?? null,
          description: org.description ?? null,
          properties: { source: "icp_sourcing", apollo_id: org.id },
        })
        .returning({ id: companies.id });
      companyId = row.id;
      companiesAdded++;
    } catch {
      continue;
    }

    // People at this company matching the persona.
    let people;
    try {
      const res = await searchPeople({
        q_organization_domains: domain,
        person_seniorities: effectiveSeniorities,
        ...(titles.length ? { person_titles: titles } : {}),
        per_page: perCompany,
      });
      people = res.people.slice(0, perCompany);
    } catch {
      continue;
    }
    if (people.length === 0) continue;

    // Dedup contacts by email within the tenant.
    const emails = people
      .map((p) => p.email?.trim().toLowerCase())
      .filter((e): e is string => !!e && !e.includes("email_not_unlocked") && !e.includes("domain.com"));
    const existingContacts = emails.length
      ? await db
          .select({ email: contacts.email })
          .from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), isNull(contacts.deletedAt), inArray(contacts.email, emails)))
      : [];
    const seen = new Set(existingContacts.map((c) => c.email?.toLowerCase()).filter(Boolean));

    // Dedup by Apollo person id too: the same person can come back under a
    // new/changed email and would otherwise create a duplicate row (the
    // Fabien Courvoisier x2 case). Seeds the seen-set from existing rows.
    const apolloIds = people.map((p) => p.id).filter((id): id is string => !!id);
    // Match either key: this lib writes `apolloId`, the enrichment/match path
    // writes `apollo_id`. Coalescing both prevents cross-path duplicate rows.
    const existingApollo = apolloIds.length
      ? await db
          .select({ apolloId: sql<string>`coalesce(${contacts.properties} ->> 'apolloId', ${contacts.properties} ->> 'apollo_id')` })
          .from(contacts)
          .where(
            and(
              eq(contacts.tenantId, tenantId),
              isNull(contacts.deletedAt),
              sql`coalesce(${contacts.properties} ->> 'apolloId', ${contacts.properties} ->> 'apollo_id') = ANY(${apolloIds})`,
            ),
          )
      : [];
    const seenApollo = new Set(existingApollo.map((r) => r.apolloId).filter(Boolean));

    const toInsert: (typeof contacts.$inferInsert)[] = [];
    for (const p of people) {
      const email = p.email?.trim().toLowerCase() || null;
      const usableEmail = email && !email.includes("email_not_unlocked") && !email.includes("domain.com") ? email : null;
      if (usableEmail) {
        if (seen.has(usableEmail)) continue;
        seen.add(usableEmail);
      }
      if (p.id) {
        if (seenApollo.has(p.id)) continue;
        seenApollo.add(p.id);
      }
      toInsert.push({
        tenantId,
        companyId,
        firstName: p.first_name?.trim() || null,
        lastName: p.last_name?.trim() || null,
        email: usableEmail,
        // Strip a company name a provider glued onto the title
        // ("Directeur Général Afiro" -> "Directeur Général").
        title: normalizeTitle(p.title, org.name),
        phone: p.phone_numbers?.[0]?.raw_number || null,
        linkedinUrl: p.linkedin_url || null,
        properties: { source: "icp_sourcing", apolloId: p.id, seniority: p.seniority ?? null },
      });
    }
    if (toInsert.length === 0) continue;

    // Suppression ledger: drop any contact the user removed (by email/LinkedIn),
    // so deleted contacts are never re-sourced.
    const allowedContacts = await filterAllowedContacts(
      tenantId,
      toInsert.map((r) => ({ email: r.email ?? null, linkedin: r.linkedinUrl ?? null, _row: r })),
    );
    const finalInsert = allowedContacts.map((c) => c._row);
    if (finalInsert.length === 0) continue;

    try {
      const inserted = await db.insert(contacts).values(finalInsert).returning({ id: contacts.id });
      contactsAdded += inserted.length;
      // Fire enrichment so phones/emails get resolved (the daily list needs a phone).
      for (const row of inserted) {
        inngest.send({ name: "contact/created", data: { contactId: row.id, tenantId } }).catch(() => {});
      }
    } catch {
      // Non-fatal: keep going with the next company.
    }
  }

  return { ok: companiesAdded > 0 || contactsAdded > 0, companiesAdded, contactsAdded };
}
