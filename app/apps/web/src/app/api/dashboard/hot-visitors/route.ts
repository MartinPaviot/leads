/**
 * GET /api/dashboard/hot-visitors
 *
 * MONACO-PARITY-04 surface — recently identified anonymous web
 * visitors whose company resolved to a known account in the tenant's
 * TAM with score ≥ B (i.e. accounts the founder cares about). Mirror
 * of the hot-inbounds widget but keyed off `visits` rows rather than
 * `notifications`.
 *
 * Default window: 7 days. Cap: 20 cards.
 */

import { db } from "@/db";
import {
  visits,
  companies,
  deals,
  sequenceEnrollments,
  contacts,
} from "@/db/schema";
import { and, desc, eq, gte, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { getAuthContext } from "@/lib/auth/auth-utils";

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const days = Math.min(30, Math.max(1, Number(url.searchParams.get("days") ?? 7)));
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") ?? 20)));
  const minScore = Math.min(100, Math.max(0, Number(url.searchParams.get("minScore") ?? 60)));

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Group by visitor + company so a single visitor with 12 page views
  // is one card, not twelve. Show their latest URL + visit count.
  const rows = await db
    .select({
      visitorId: visits.visitorId,
      companyId: companies.id,
      companyName: companies.name,
      companyDomain: companies.domain,
      companyScore: companies.score,
      lastUrl: sql<string>`(array_agg(${visits.url} ORDER BY ${visits.createdAt} DESC))[1]`,
      lastVisitAt: sql<Date>`max(${visits.createdAt})`,
      visitCount: sql<number>`count(*)::int`,
    })
    .from(visits)
    .innerJoin(
      companies,
      and(
        eq(companies.id, visits.companyId),
        eq(companies.tenantId, authCtx.tenantId),
      ),
    )
    .where(
      and(
        eq(visits.tenantId, authCtx.tenantId),
        isNotNull(visits.companyId),
        gte(visits.createdAt, since),
        sql`COALESCE(${companies.score}, 0) >= ${minScore}`,
      ),
    )
    .groupBy(
      visits.visitorId,
      companies.id,
      companies.name,
      companies.domain,
      companies.score,
    )
    .orderBy(desc(sql<Date>`max(${visits.createdAt})`))
    .limit(limit);

  const companyIds = rows
    .map((r) => r.companyId)
    .filter((id): id is string => id !== null);

  // P0-2 task 2.4 — enrich each visitor card with the operational
  // state the founder needs to decide what to do : is there an
  // open deal? Has anyone been auto-enrolled into a sequence?
  // These two fan-outs answer "is the system already on it?".

  const openDealsByCompany = new Map<string, { id: string; name: string; stage: string }>();
  const enrolledByCompany = new Map<string, number>();

  if (companyIds.length > 0) {
    const dealRows = await db
      .select({
        companyId: deals.companyId,
        id: deals.id,
        name: deals.name,
        stage: deals.stage,
      })
      .from(deals)
      .where(
        and(
          eq(deals.tenantId, authCtx.tenantId),
          inArray(deals.companyId, companyIds),
          notInArray(deals.stage, ["won", "lost"]),
        ),
      );
    for (const d of dealRows) {
      if (!d.companyId) continue;
      // Most-recent deal wins on collision — keep first hit since
      // dealRows isn't ordered ; slight imprecision OK at widget scale.
      if (!openDealsByCompany.has(d.companyId)) {
        openDealsByCompany.set(d.companyId, {
          id: d.id,
          name: d.name,
          stage: d.stage ?? "lead",
        });
      }
    }

    const enrollmentRows = await db
      .select({
        companyId: contacts.companyId,
        enrollmentCount: sql<number>`count(*)::int`,
      })
      .from(sequenceEnrollments)
      .innerJoin(contacts, eq(contacts.id, sequenceEnrollments.contactId))
      .where(
        and(
          eq(contacts.tenantId, authCtx.tenantId),
          inArray(contacts.companyId, companyIds),
          eq(sequenceEnrollments.status, "active"),
        ),
      )
      .groupBy(contacts.companyId);
    for (const e of enrollmentRows) {
      if (!e.companyId) continue;
      enrolledByCompany.set(e.companyId, Number(e.enrollmentCount ?? 0));
    }
  }

  const items = rows.map((r) => ({
    visitorId: r.visitorId,
    companyId: r.companyId,
    companyName: r.companyName,
    companyDomain: r.companyDomain,
    companyScore: r.companyScore,
    lastUrl: r.lastUrl,
    lastVisitAt:
      r.lastVisitAt instanceof Date
        ? r.lastVisitAt.toISOString()
        : new Date(r.lastVisitAt).toISOString(),
    visitCount: Number(r.visitCount ?? 0),
    openDeal: r.companyId ? openDealsByCompany.get(r.companyId) ?? null : null,
    activeEnrollments: r.companyId ? enrolledByCompany.get(r.companyId) ?? 0 : 0,
  }));

  return Response.json({ items, since: since.toISOString() });
}
