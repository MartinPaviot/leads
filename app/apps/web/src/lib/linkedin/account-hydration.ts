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
 *  3. QUOTA + PROGRESS — `limit` bounds the companies PROBED per run (≈ the
 *     real Unipile spend, ~1-2 views each), not just the matches, and the
 *     unhydrated filter runs in SQL with a no-match marker so the batch advances
 *     across runs instead of re-probing the same newest rows every day.
 *
 * Server-only (DB + live Unipile). Bounded by `limit` against the seat's ~100
 * profile-view/day quota (Unipile does NOT enforce it — we must).
 */

import { db } from "@/db";
import { companies } from "@/db/schema";
import { and, eq, isNotNull, sql, desc } from "drizzle-orm";
import { upsertAccount } from "@/db/canonical/upsert";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { resolveAndEnrichCompany, icpSegmentToPreserve, type KnownCompany } from "@/lib/providers/unipile/enrichment";
import { clampHydrationLimit } from "@/lib/linkedin/hydration-seat";
import { reserveDailyViews } from "@/lib/linkedin/view-budget";

const UNIPILE = "unipile";

/** A no-match row is stamped with an attempt and stays out of the unhydrated
 * window for this many days (so a company with no LinkedIn page isn't re-probed
 * every run, but is retried eventually in case it later gets a page). */
const HYDRATION_RETRY_DAYS = 30;

/** Profile views a single probe can spend (the candidate's company profile,
 * sometimes two during domain-confirmation) — reserved against the daily budget. */
const VIEWS_PER_PROBE = 2;

export interface HydrateExistingParams {
  tenantId: string;
  /** The connected seat's Unipile account_id (the search/profile viewer). */
  unipileAccountId: string;
  /** Max companies PROBED this run (= the quota spend). Clamped to [1, 50]; 25 default. */
  limit?: number;
  /** SQL-exclude rows already matched OR no-match-attempted in the last 30 days. */
  onlyUnhydrated?: boolean;
}

export interface HydrateExistingResult {
  /** Companies probed (Unipile calls spent ≈ processed × 1-2). */
  processed: number;
  hydrated: number;
  skippedNoMatch: number;
  segmentsPreserved: number;
  /** True if the seat's daily view budget was hit before `limit` was reached. */
  budgetExhausted: boolean;
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

  // `limit` bounds the number of companies PROBED this run (≈1-2 Unipile views
  // each) — i.e. the actual quota spend — not just the successful matches.
  const limit = clampHydrationLimit(params.limit);

  // onlyUnhydrated filters AT THE SQL LEVEL so the batch ADVANCES across runs:
  // exclude already-matched rows (companyId set) AND no-match rows attempted in
  // the last HYDRATION_RETRY_DAYS. Without this the query re-probed the newest
  // 3×limit rows every run and never reached older accounts.
  const unhydratedFilter = params.onlyUnhydrated
    ? sql`coalesce(${companies.vendorIds} ->> 'linkedin_company', '') = ''
        and coalesce(${companies.properties} -> 'linkedin' ->> 'companyId', '') = ''
        and (
          (${companies.properties} -> 'linkedinHydration' ->> 'attemptedAt') is null
          or (${companies.properties} -> 'linkedinHydration' ->> 'attemptedAt')::timestamptz
             < now() - make_interval(days => ${HYDRATION_RETRY_DAYS})
        )`
    : undefined;

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
    .where(and(eq(companies.tenantId, params.tenantId), isNotNull(companies.name), unhydratedFilter))
    // Never-attempted rows first (nulls first), then newest — so the batch walks
    // the WHOLE backlog round-robin instead of re-consuming the newest end.
    .orderBy(sql`(${companies.properties} -> 'linkedinHydration' ->> 'attemptedAt') asc nulls first`, desc(companies.createdAt))
    .limit(limit)) as AccountRow[];

  let processed = 0;
  let hydrated = 0;
  let skippedNoMatch = 0;
  let segmentsPreserved = 0;
  let budgetExhausted = false;

  for (const row of rows) {
    // Cross-call daily cap: reserve this probe's views against the seat's UTC-day
    // budget before spending. Stops repeated route/cron calls from draining the
    // seat's ~100 views/day (which would get the LinkedIn account restricted).
    if (!(await reserveDailyViews(params.unipileAccountId, VIEWS_PER_PROBE))) {
      budgetExhausted = true;
      break;
    }
    processed++; // one probe = bounded Unipile spend, whether or not it matches
    const known: KnownCompany = { name: row.name, domain: row.domain, linkedinCompanyId: knownLinkedInId(row) };

    let resolved = null;
    let threw = false;
    try {
      resolved = await resolveAndEnrichCompany(cfg, params.unipileAccountId, known);
    } catch {
      threw = true; // transient (network / rate-limit) — retry next run, don't poison
    }

    if (!resolved) {
      // Stamp ONLY a CLEAN no-match (a genuine "no LinkedIn page") so it leaves the
      // window for 30 days. A thrown/transient error is NOT stamped — otherwise a
      // mid-run rate-limit would misfile every later company as a 30-day skip.
      if (!threw) await markHydrationAttempt(row.id);
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

  return { processed, hydrated, skippedNoMatch, segmentsPreserved, budgetExhausted };
}

/** Stamp a no-match attempt (no Unipile call) so the row drops out of the
 * unhydrated window for HYDRATION_RETRY_DAYS instead of being re-probed daily. */
async function markHydrationAttempt(companyId: string): Promise<void> {
  const patch = { linkedinHydration: { attemptedAt: new Date().toISOString(), matched: false } };
  await db
    .update(companies)
    .set({ properties: sql`coalesce(${companies.properties}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(companies.id, companyId));
}
