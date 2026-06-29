/**
 * Spec 36 (T11) — hydrate EXISTING canonical accounts with their real LinkedIn
 * firmographics, fixing the two caveats of the first pass:
 *
 *  1. FALSE MATCH — resolving a company by a name string can bind the wrong
 *     LinkedIn page. We go through `resolveAndEnrichCompany`, which confirms a
 *     candidate by DOMAIN (or normalized NAME) before trusting it, and persists
 *     the resolved LinkedIn company id (vendor_ids.linkedin_company) so the next
 *     run is a direct, idempotent fetch — never a name search again.
 *
 *  2. COARSE LABEL IN THE `industry` COLUMN — a sourcing label like "B2B SaaS"
 *     is an ICP SEGMENT, not a LinkedIn industry. We write the precise primary
 *     industry to the column through upsertAccount(provider "unipile", rank 55 >
 *     apollo 50 > tam 45 — so it wins via provenance), and PRESERVE the old
 *     coarse label in properties.icpSegment so the ICP signal is never lost. The
 *     full industry list + specialties + HQ + headcount-growth live in
 *     properties.linkedin (multi-value fidelity the single column can't hold).
 *
 * Server-only (DB + live Unipile). Read-bounded by `limit`; each company costs
 * ~1-2 LinkedIn profile views against the seat's ~100/day quota.
 */

import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNotNull, sql, desc } from "drizzle-orm";
import { upsertAccount } from "@/db/canonical/upsert";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { resolveAndEnrichCompany, icpSegmentToPreserve, type KnownCompany } from "@/lib/providers/unipile/enrichment";

const UNIPILE = "unipile";

export interface HydrateExistingParams {
  tenantId: string;
  /** The connected seat's Unipile account_id (the search/profile viewer). */
  unipileAccountId: string;
  /** Cap a single run (LinkedIn profile-view quota ~100/seat/day). */
  limit?: number;
  /** Skip accounts already hydrated (properties.linkedin.companyId present). */
  onlyUnhydrated?: boolean;
}

export interface HydrateExistingResult {
  processed: number;
  hydrated: number;
  skippedNoMatch: number;
  segmentsPreserved: number;
}

interface AccountRow {
  id: string;
  name: string | null;
  domain: string | null;
  industry: string | null;
  vendorIds: Record<string, string> | null;
  properties: Record<string, unknown> | null;
}

/** The previously-resolved LinkedIn company id, from either side-map. */
function knownLinkedInId(row: AccountRow): string | null {
  const fromVendor = row.vendorIds?.linkedin_company ?? null;
  const li = row.properties?.linkedin as { companyId?: string } | undefined;
  return fromVendor ?? li?.companyId ?? null;
}

export async function hydrateExistingAccounts(params: HydrateExistingParams): Promise<HydrateExistingResult> {
  const cfg = readUnipileConfig();
  if (!cfg) throw new Error("Unipile not configured");

  const limit = params.limit ?? 25;
  const rows = (await db
    .select({
      id: companies.id,
      name: companies.name,
      domain: companies.domain,
      industry: companies.industry,
      vendorIds: companies.vendorIds,
      properties: companies.properties,
    })
    .from(companies)
    .where(and(eq(companies.tenantId, params.tenantId), isNotNull(companies.name)))
    .orderBy(desc(companies.createdAt))
    .limit(params.onlyUnhydrated ? limit * 3 : limit)) as AccountRow[];

  let processed = 0;
  let hydrated = 0;
  let skippedNoMatch = 0;
  let segmentsPreserved = 0;

  for (const row of rows) {
    if (hydrated >= limit) break;
    const linkedinCompanyId = knownLinkedInId(row);
    if (params.onlyUnhydrated && linkedinCompanyId) continue;
    processed++;

    const known: KnownCompany = { name: row.name, domain: row.domain, linkedinCompanyId };
    let resolved;
    try {
      resolved = await resolveAndEnrichCompany(cfg, params.unipileAccountId, known);
    } catch {
      skippedNoMatch++;
      continue;
    }
    if (!resolved) {
      skippedNoMatch++;
      continue;
    }

    const { fields, extras, growth } = resolved.enrichment;

    // 1) Precise firmographics → canonical columns, through provenance. The
    //    LinkedIn primary industry wins the `industry` column (unipile rank 55).
    await upsertAccount(params.tenantId, {
      name: fields.name ?? row.name ?? undefined,
      domain: fields.domain ?? row.domain ?? undefined,
      industry: fields.industry ?? undefined,
      size: fields.size ?? undefined,
      description: fields.description ?? undefined,
      provider: UNIPILE,
      vendorIds: { linkedin_company: resolved.linkedinCompanyId },
      observedAt: new Date(),
    });

    // 2) Multi-value fidelity + the preserved ICP segment → properties.
    const li: Record<string, unknown> = {
      companyId: resolved.linkedinCompanyId,
      industries: extras.industries,
      specialties: extras.specialties,
      hq: { city: extras.hqCity, country: extras.hqCountry },
      foundationDate: extras.foundationDate,
      matchConfidence: resolved.confidence,
    };
    if (growth.totalCount != null) li.headcountGrowth = growth;

    const segment = icpSegmentToPreserve(row.industry, fields.industry);
    const patch: Record<string, unknown> = { linkedin: li };
    if (segment) {
      patch.icpSegment = segment;
      segmentsPreserved++;
    }

    await db
      .update(companies)
      .set({ properties: sql`coalesce(${companies.properties}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
      .where(eq(companies.id, row.id));

    hydrated++;
  }

  return { processed, hydrated, skippedNoMatch, segmentsPreserved };
}
