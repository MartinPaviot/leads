/**
 * Spec 36 (T11) — hydrate EXISTING contacts with their full LinkedIn profile
 * (title, seniority, current company, summary, open-to-work, shared connections).
 * The contact counterpart of account-hydration.ts; reuses the same machinery:
 * SQL-level unhydrated filter so the batch advances, a no-match marker so locked
 * profiles aren't re-probed daily, and the per-seat daily view budget.
 *
 * WARM-FIRST: contacts that engaged with a post (properties.linkedinEngagement,
 * from post-sourcing) are hydrated first — they're 1st-degree, so the full
 * profile actually resolves (out-of-network/cold contacts return a thin profile
 * on the classic surface; still useful for headline/location/open-profile).
 *
 * Server-only (DB + live Unipile). The profile→properties mapping is the pure,
 * unit-tested enrichment.fullProfileToContact; this is the thin orchestration.
 */

import { db } from "@/db";
import { contacts } from "@/db/schema";
import { and, eq, isNotNull, sql, desc } from "drizzle-orm";
import { upsertContact } from "@/db/canonical/upsert";
import { readUnipileConfig } from "@/lib/providers/unipile/http";
import { UnipileApiError } from "@/lib/providers/unipile/client";
import { enrichContactFromLinkedIn } from "@/lib/providers/unipile/enrichment";
import { clampHydrationLimit } from "@/lib/linkedin/hydration-seat";
import { reserveDailyViews } from "@/lib/linkedin/view-budget";
import { publicIdentifierFromUrl } from "@/lib/providers/unipile/resolve-target";

const UNIPILE = "unipile";
const HYDRATION_RETRY_DAYS = 30;
const VIEWS_PER_PROBE = 1; // one profile fetch per contact

export interface HydrateContactsParams {
  tenantId: string;
  unipileAccountId: string;
  /** Max contacts PROBED this run (= profile-view spend). Clamped [1,50]; 25 default. */
  limit?: number;
  onlyUnhydrated?: boolean;
}

export interface HydrateContactsResult {
  processed: number;
  hydrated: number;
  skippedNoProfile: number;
  budgetExhausted: boolean;
}

interface ContactRow {
  id: string;
  linkedinUrl: string | null;
  properties: Record<string, unknown> | null;
}

/** A locked / out-of-network / not-found profile = a clean "no profile" (mark it,
 * skip 30d). 429/5xx/network are transient — rethrow so they aren't mis-marked. */
export function isCleanNoProfile(err: unknown): boolean {
  return err instanceof UnipileApiError && err.status >= 400 && err.status < 500 && err.status !== 429;
}

export async function hydrateExistingContacts(params: HydrateContactsParams): Promise<HydrateContactsResult> {
  const cfg = readUnipileConfig();
  if (!cfg) throw new Error("Unipile not configured");

  const limit = clampHydrationLimit(params.limit);
  const unhydratedFilter = params.onlyUnhydrated
    ? sql`(${contacts.properties} -> 'linkedin' ->> 'profileHydratedAt') is null
        and (
          (${contacts.properties} -> 'linkedinHydration' ->> 'attemptedAt') is null
          or (${contacts.properties} -> 'linkedinHydration' ->> 'attemptedAt')::timestamptz
             < now() - make_interval(days => ${HYDRATION_RETRY_DAYS})
        )`
    : undefined;

  const rows = (await db
    .select({ id: contacts.id, linkedinUrl: contacts.linkedinUrl, properties: contacts.properties })
    .from(contacts)
    .where(and(eq(contacts.tenantId, params.tenantId), isNotNull(contacts.linkedinUrl), unhydratedFilter))
    // Warm engagers first; then never-attempted; then newest.
    .orderBy(
      sql`(${contacts.properties} -> 'linkedinEngagement') is not null desc`,
      sql`(${contacts.properties} -> 'linkedinHydration' ->> 'attemptedAt') asc nulls first`,
      desc(contacts.createdAt),
    )
    .limit(limit)) as ContactRow[];

  let processed = 0;
  let hydrated = 0;
  let skippedNoProfile = 0;
  let budgetExhausted = false;

  for (const row of rows) {
    const identifier = publicIdentifierFromUrl(row.linkedinUrl);
    if (!identifier) { skippedNoProfile++; continue; } // no /in/ handle → can't resolve

    if (!(await reserveDailyViews(params.unipileAccountId, VIEWS_PER_PROBE))) {
      budgetExhausted = true;
      break;
    }
    processed++;

    let enrichment;
    try {
      enrichment = await enrichContactFromLinkedIn(cfg, params.unipileAccountId, identifier);
    } catch (err) {
      if (isCleanNoProfile(err)) {
        await markAttempt(row.id, params.tenantId);
        skippedNoProfile++;
        continue;
      }
      throw err; // transient — surface so the caller/cron retries the run, don't poison
    }

    const { fields, extras, raw } = enrichment;
    await upsertContact(params.tenantId, {
      linkedinUrl: fields.linkedinUrl ?? row.linkedinUrl ?? undefined,
      firstName: fields.firstName ?? undefined,
      lastName: fields.lastName ?? undefined,
      title: fields.title ?? undefined,
      provider: UNIPILE,
      observedAt: new Date(),
    });

    const li = {
      profileHydratedAt: new Date().toISOString(),
      seniority: extras.seniority,
      summary: extras.summary,
      location: extras.location,
      openToWork: extras.isOpenToWork,
      openProfile: extras.isOpenProfile,
      sharedConnections: extras.sharedConnectionsCount,
      currentCompany: extras.currentCompany,
      currentCompanyId: extras.currentCompanyId,
      workExperienceCount: raw.work_experience_total_count ?? raw.work_experience?.length ?? null,
      educationCount: raw.education_total_count ?? raw.education?.length ?? null,
      networkDistance: raw.network_distance ?? null,
    };
    await db
      .update(contacts)
      .set({ properties: sql`coalesce(${contacts.properties}, '{}'::jsonb) || ${JSON.stringify({ linkedin: li })}::jsonb` })
      .where(and(eq(contacts.id, row.id), eq(contacts.tenantId, params.tenantId)));
    hydrated++;
  }

  return { processed, hydrated, skippedNoProfile, budgetExhausted };
}

/** Stamp a no-profile attempt so the contact leaves the unhydrated window for 30 days. */
async function markAttempt(contactId: string, tenantId: string): Promise<void> {
  const patch = { linkedinHydration: { attemptedAt: new Date().toISOString(), matched: false } };
  await db
    .update(contacts)
    .set({ properties: sql`coalesce(${contacts.properties}, '{}'::jsonb) || ${JSON.stringify(patch)}::jsonb` })
    .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, tenantId)));
}
