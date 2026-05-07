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
import { visits, companies } from "@/db/schema";
import { and, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
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
  }));

  return Response.json({ items, since: since.toISOString() });
}
