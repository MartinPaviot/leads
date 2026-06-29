/**
 * Spec 36 (T11) — source contacts/accounts from a LinkedIn / Sales-Navigator
 * search INTO the canonical model. This is cohabitation fix #1: every row is
 * written through upsertAccount/upsertContact with provider "unipile", so a
 * sourced person dedups onto the SAME canonical contact as the Apollo one
 * (by normalized linkedin_url / email), merges field-by-field with provenance,
 * and keeps both vendor ids. Their linkedin_url then matches the connected
 * seat's relations → the warm-path graph lights up.
 *
 * Server-only (DB + live Unipile). The result→canonical mapping is the pure,
 * unit-tested sales-nav-mapping; this is the thin orchestration over it.
 */

import { db } from "@/db";
import { contacts, companies } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { upsertAccount, upsertContact } from "@/db/canonical/upsert";
import { setCustomFieldValue } from "@/lib/context/custom-fields";
import {
  readUnipileConfig,
  searchLinkedIn,
  type LinkedInSearchApi,
  type LinkedInSearchCategory,
  type LinkedInSearchResult,
  type UnipileConfig,
} from "@/lib/providers/unipile/http";
import { enrichAccountFromLinkedIn, type LinkedInAccountFields } from "@/lib/providers/unipile/enrichment";
import { salesNavToContact, salesNavToAccount, linkedinCustomFieldValues } from "./sales-nav-mapping";

const UNIPILE = "unipile";

/** Per-run hydration context — dedups company fetches so we spend 1 call/company. */
interface HydrateCtx {
  cfg: UnipileConfig;
  unipileAccountId: string;
  seen: Set<string>;
}

export interface SalesNavSourcingParams {
  tenantId: string;
  /** The connected seat's Unipile account_id (the search viewer). */
  unipileAccountId: string;
  query: { api: LinkedInSearchApi; category?: LinkedInSearchCategory; keywords?: string; url?: string; [k: string]: unknown };
  /** Custom-field keys the tenant enabled from LINKEDIN_FIELD_CATALOG. */
  enabledLinkedInCategories?: string[];
  /** Cap a single run. */
  maxResults?: number;
  /**
   * Hydrate each employer with its LinkedIn company profile (domain, industry,
   * size, description + the headcount-growth signal). OFF by default: it spends
   * ~1 LinkedIn profile-view/company against the seat's ~100/day quota.
   */
  hydrateAccounts?: boolean;
}

export interface SalesNavSourcingResult {
  searched: number;
  accountsUpserted: number;
  contactsUpserted: number;
  skippedNoIdentity: number;
}

/**
 * Paginate the search and upsert each result through the canonical layer.
 * Person results contribute the employer account (by name) + the contact
 * (keyed on the normalized linkedin_url). Enabled LinkedIn categories are
 * written into the contact's properties.customFields.
 */
export async function sourceFromSalesNav(params: SalesNavSourcingParams): Promise<SalesNavSourcingResult> {
  const cfg = readUnipileConfig();
  if (!cfg) throw new Error("Unipile not configured");

  const max = params.maxResults ?? 100;
  const enabled = params.enabledLinkedInCategories ?? [];
  let searched = 0;
  let accountsUpserted = 0;
  let contactsUpserted = 0;
  let skippedNoIdentity = 0;
  let cursor: string | null = null;
  const hydrate: HydrateCtx | null = params.hydrateAccounts
    ? { cfg, unipileAccountId: params.unipileAccountId, seen: new Set() }
    : null;

  while (searched < max) {
    const page = await searchLinkedIn(cfg, params.unipileAccountId, params.query, { cursor, limit: Math.min(50, max - searched) });
    if (page.items.length === 0) break;

    for (const result of page.items) {
      searched++;
      await sourceOne(params.tenantId, result, enabled, hydrate).then((r) => {
        if (r.account) accountsUpserted++;
        if (r.contact) contactsUpserted++;
        else if (r.skipped) skippedNoIdentity++;
      });
      if (searched >= max) break;
    }

    cursor = page.cursor;
    if (!cursor) break;
  }

  return { searched, accountsUpserted, contactsUpserted, skippedNoIdentity };
}

/** Company id from the search result's current role (the LinkedIn numeric id). */
function companyIdOf(result: LinkedInSearchResult): string | null {
  const cid = (result.current_positions ?? []).map((p) => p.company_id).find((v) => v != null);
  return cid != null ? String(cid) : null;
}

async function sourceOne(
  tenantId: string,
  result: LinkedInSearchResult,
  enabledCategories: string[],
  hydrate: HydrateCtx | null,
): Promise<{ account: boolean; contact: boolean; skipped: boolean }> {
  const observedAt = new Date();

  // Employer account — by name, optionally hydrated with the LinkedIn company
  // profile (domain/industry/size + headcount-growth signal). Hydration is
  // deduped per company across the run so we spend at most 1 fetch/company.
  const acct = salesNavToAccount(result);
  let enriched: LinkedInAccountFields | null = null;
  let linkedinProps: Record<string, unknown> | null = null;
  const cid = companyIdOf(result);
  if (hydrate && cid && !hydrate.seen.has(cid)) {
    hydrate.seen.add(cid);
    try {
      const e = await enrichAccountFromLinkedIn(hydrate.cfg, hydrate.unipileAccountId, cid);
      enriched = e.fields;
      // Keep the FULL industry list + specialties (not just the single column),
      // the HQ, and the headcount-growth signal — the multi-industry fidelity.
      const li: Record<string, unknown> = {
        industries: e.extras.industries,
        specialties: e.extras.specialties,
        hq: { city: e.extras.hqCity, country: e.extras.hqCountry },
        foundationDate: e.extras.foundationDate,
      };
      if (e.growth.totalCount != null) li.headcountGrowth = e.growth;
      linkedinProps = { linkedin: li };
    } catch {
      /* hydration is best-effort — fall back to name-only */
    }
  }

  let companyId: string | null = null;
  let account = false;
  const name = enriched?.name ?? acct.name;
  if (name) {
    const row = await upsertAccount(tenantId, {
      name,
      domain: enriched?.domain ?? undefined,
      industry: enriched?.industry ?? undefined,
      size: enriched?.size ?? undefined,
      description: enriched?.description ?? undefined,
      provider: UNIPILE,
      observedAt,
    });
    companyId = row?.id ?? null;
    account = true;
    if (companyId && linkedinProps) {
      await db
        .update(companies)
        .set({ properties: sql`coalesce(${companies.properties}, '{}'::jsonb) || ${JSON.stringify(linkedinProps)}::jsonb` })
        .where(eq(companies.id, companyId));
    }
  }

  // Contact — keyed on the normalized linkedin_url (the shared dedup key).
  const c = salesNavToContact(result);
  if (!c.linkedinUrl) return { account, contact: false, skipped: true };

  const contact = await upsertContact(tenantId, {
    linkedinUrl: c.linkedinUrl,
    firstName: c.firstName,
    lastName: c.lastName,
    title: c.title,
    companyId: companyId ?? undefined,
    provider: UNIPILE,
    observedAt,
  });

  // Enabled LinkedIn categories → properties.customFields.
  if (contact && enabledCategories.length > 0) {
    const vals = linkedinCustomFieldValues(result, enabledCategories);
    if (Object.keys(vals).length > 0) {
      let props = (contact.properties as Record<string, unknown> | null) ?? {};
      for (const [key, value] of Object.entries(vals)) props = setCustomFieldValue(props, key, value);
      await db.update(contacts).set({ properties: props as never }).where(eq(contacts.id, contact.id));
    }
  }

  return { account, contact: true, skipped: false };
}
