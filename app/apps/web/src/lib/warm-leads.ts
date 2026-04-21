/**
 * Warm-lead ranking — WS-3's heuristic for "who should the user
 * follow up with right now". Uses existing `activities` table rows
 * (sync'd from Gmail/Outlook); no new storage.
 *
 * Ranking = recency × exchange depth × ICP fit.
 *   recencyScore:  exponential decay from last activity (0-1).
 *   depthScore:    log(activityCount+1) / log(20) (0-1, caps at 20 exchanges).
 *   icpScore:      1 if contact's company matches any tenant-targeted
 *                  industry or seniority matches any targeted seniority,
 *                  else 0.5. (Full ICP scoring is out of scope — a
 *                  coarse signal is enough for ranking.)
 *
 * Composite = 0.4 * recency + 0.3 * depth + 0.3 * icp
 *
 * Cold filter: contacts with no incoming activity (no replies) are
 * excluded — they're the opposite of "warm". Same for contacts whose
 * domain is in `DEFAULT_IGNORED_DOMAINS`.
 *
 * Ephemeral per-tenant cache keyed by tenantId + 5min TTL avoids
 * repeat inbox scans when the dashboard mounts/rehydrates.
 */

import { db } from "@/db";
import { activities, contacts, companies } from "@/db/schema";
import { and, eq, gte, isNotNull, sql } from "drizzle-orm";
import { getTenantSettings, buildIgnoredDomains } from "@/lib/tenant-settings";

export interface WarmLead {
  contactId: string;
  name: string;
  email: string;
  companyName: string | null;
  companyDomain: string | null;
  lastActivityAt: Date;
  daysSinceLast: number;
  exchangeCount: number;
  /** 0-1 composite rank score. Higher is warmer. */
  rankScore: number;
  /** Summary of the last exchange the user can recognise instantly. */
  lastSummary: string | null;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; leads: WarmLead[] }>();

export function clearWarmLeadCacheForTest(): void {
  cache.clear();
}

export async function rankWarmLeads(
  tenantId: string,
  options: { limit?: number; sinceDays?: number } = {},
): Promise<WarmLead[]> {
  const limit = options.limit ?? 3;
  const sinceDays = options.sinceDays ?? 90;

  const cached = cache.get(tenantId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.leads.slice(0, limit);
  }

  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const settings = await getTenantSettings(tenantId);
  const ignored = buildIgnoredDomains(settings, settings.companyDomain);
  const targetedSeniorities = new Set(
    (settings.targetSeniorities ?? []).map((s) => s.toLowerCase()),
  );
  const targetedIndustries = new Set(
    (settings.targetIndustries ?? []).map((s) => s.toLowerCase()),
  );

  // Pull aggregated activity per contact within the window. We join
  // contacts + companies so the ICP signal can fire without a
  // second roundtrip.
  const rows = await db
    .select({
      contactId: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      title: contacts.title,
      companyId: contacts.companyId,
      companyName: companies.name,
      companyDomain: companies.domain,
      industry: companies.industry,
      activityCount: sql<number>`count(${activities.id})::int`,
      lastActivityAt: sql<Date>`max(${activities.occurredAt})`,
      inboundCount: sql<number>`sum(case when ${activities.direction} = 'inbound' then 1 else 0 end)::int`,
      lastSummary: sql<string | null>`(array_agg(${activities.summary} order by ${activities.occurredAt} desc))[1]`,
    })
    .from(activities)
    .innerJoin(contacts, eq(activities.entityId, contacts.id))
    .leftJoin(companies, eq(contacts.companyId, companies.id))
    .where(
      and(
        eq(activities.tenantId, tenantId),
        eq(activities.entityType, "contact"),
        isNotNull(contacts.email),
        gte(activities.occurredAt, since),
      ),
    )
    .groupBy(
      contacts.id,
      contacts.firstName,
      contacts.lastName,
      contacts.email,
      contacts.title,
      contacts.companyId,
      companies.name,
      companies.domain,
      companies.industry,
    );

  const now = Date.now();
  const leads: WarmLead[] = [];

  for (const r of rows) {
    if (!r.email) continue;
    const emailDomain = r.email.split("@")[1]?.toLowerCase() ?? "";
    if (ignored.has(emailDomain)) continue;
    // Must have at least one inbound activity — otherwise it's a cold
    // contact the user hasn't actually talked to.
    if ((r.inboundCount ?? 0) < 1) continue;

    const lastAt = r.lastActivityAt ? new Date(r.lastActivityAt) : null;
    if (!lastAt || Number.isNaN(lastAt.getTime())) continue;
    const daysSince = Math.max(
      0,
      Math.floor((now - lastAt.getTime()) / (24 * 60 * 60 * 1000)),
    );

    const recencyScore = Math.exp(-daysSince / 14); // 14-day half-life
    const depthScore = Math.min(
      1,
      Math.log(Math.max(1, r.activityCount)) / Math.log(20),
    );
    const titleLower = r.title?.toLowerCase() ?? "";
    const industryLower = r.industry?.toLowerCase() ?? "";
    const icpFit =
      [...targetedSeniorities].some((s) => titleLower.includes(s)) ||
      (industryLower && targetedIndustries.has(industryLower))
        ? 1
        : 0.5;

    const rankScore = 0.4 * recencyScore + 0.3 * depthScore + 0.3 * icpFit;

    leads.push({
      contactId: r.contactId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" ") || r.email,
      email: r.email,
      companyName: r.companyName,
      companyDomain: r.companyDomain,
      lastActivityAt: lastAt,
      daysSinceLast: daysSince,
      exchangeCount: r.activityCount ?? 0,
      rankScore,
      lastSummary: r.lastSummary,
    });
  }

  leads.sort((a, b) => b.rankScore - a.rankScore);

  cache.set(tenantId, { at: now, leads });
  return leads.slice(0, limit);
}
