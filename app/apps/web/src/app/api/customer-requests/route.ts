/**
 * /api/customer-requests
 *
 * Sprint-3 audit follow-up — voice-of-customer capture + queue read.
 *
 *   POST  : tenant-context capture. Body { verbatim, source, metadata? }.
 *           Runs the classifier, dedupes on (tenantId, canonicalKey),
 *           returns either the created or pre-existing row.
 *
 *   GET   : admin-only queue listing. Filters : ?status, ?kind, ?days.
 *           Sorts by ARR exposure × creation recency. Drives the
 *           Customer Council dashboard at /admin/customer-requests.
 */

import { db } from "@/db";
import { customerRequests } from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { classifyCustomerMessage } from "@/lib/voice-of-customer/classifier";
import { logger } from "@/lib/observability/logger";

const captureSchema = z.object({
  verbatim: z.string().min(8).max(5000),
  source: z
    .enum(["chat", "support", "onboarding_feedback", "in_product_widget"])
    .default("chat"),
  metadata: z.record(z.unknown()).optional(),
  /** Optional override — caller can force a kind/canonicalKey when
   *  the upstream context is richer than what the regex sees (rare). */
  forceKind: z.string().optional(),
});

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof captureSchema>;
  try {
    body = captureSchema.parse(await req.json());
  } catch (err) {
    return Response.json(
      {
        error: "Invalid payload",
        details: err instanceof Error ? err.message : String(err),
      },
      { status: 400 },
    );
  }

  // Run classifier — if no match and no force, this isn't a request,
  // we don't store anything (mundane chatter).
  const classified = classifyCustomerMessage(body.verbatim);
  if (!classified && !body.forceKind) {
    return Response.json({ ok: true, captured: false, reason: "no_pattern_match" });
  }

  const kind = (classified?.kind ?? body.forceKind) as string;
  const canonicalKey = classified?.canonicalKey ?? null;

  // Dedupe : same (tenant, canonicalKey) within last 30 days → reuse.
  if (canonicalKey) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [existing] = await db
      .select({ id: customerRequests.id })
      .from(customerRequests)
      .where(
        and(
          eq(customerRequests.tenantId, authCtx.tenantId),
          eq(customerRequests.canonicalKey, canonicalKey),
          gte(customerRequests.createdAt, thirtyDaysAgo),
        ),
      )
      .limit(1);
    if (existing) {
      return Response.json({
        ok: true,
        captured: true,
        deduped: true,
        id: existing.id,
        kind,
        canonicalKey,
      });
    }
  }

  let created;
  try {
    [created] = await db
      .insert(customerRequests)
      .values({
        tenantId: authCtx.tenantId,
        kind,
        verbatim: body.verbatim.slice(0, 2000),
        source: body.source,
        canonicalKey,
        metadata: {
          ...(body.metadata ?? {}),
          ...(classified?.matchedSnippet
            ? { matchedSnippet: classified.matchedSnippet }
            : {}),
          capturedBy: authCtx.userId,
        },
      })
      .returning({ id: customerRequests.id });
  } catch (err) {
    logger.warn("customer-requests: insert failed", {
      tenantId: authCtx.tenantId,
      err: err instanceof Error ? err.message : String(err),
    });
    return Response.json({ error: "Insert failed" }, { status: 500 });
  }

  return Response.json({
    ok: true,
    captured: true,
    deduped: false,
    id: created?.id,
    kind,
    canonicalKey,
  });
}

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  const url = new URL(req.url);
  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");
  const days = Math.min(180, Math.max(1, Number(url.searchParams.get("days") ?? 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const conditions = [gte(customerRequests.createdAt, since)];
  if (status) conditions.push(eq(customerRequests.status, status));
  if (kind) conditions.push(eq(customerRequests.kind, kind));

  // Aggregated view : group by canonical_key, count requests across
  // tenants, sum ARR exposure. Drives the prioritisation surface.
  const aggregated = await db
    .select({
      canonicalKey: customerRequests.canonicalKey,
      kind: customerRequests.kind,
      requestCount: sql<number>`count(*)::int`,
      tenantCount: sql<number>`count(distinct ${customerRequests.tenantId})::int`,
      totalArrUsd: sql<number>`COALESCE(sum(${customerRequests.tenantArrUsd}), 0)::float8`,
      latestVerbatim: sql<string>`(array_agg(${customerRequests.verbatim} ORDER BY ${customerRequests.createdAt} DESC))[1]`,
      firstSeenAt: sql<Date>`min(${customerRequests.createdAt})`,
      lastSeenAt: sql<Date>`max(${customerRequests.createdAt})`,
    })
    .from(customerRequests)
    .where(and(...conditions))
    .groupBy(customerRequests.canonicalKey, customerRequests.kind)
    .orderBy(desc(sql`count(distinct ${customerRequests.tenantId})`))
    .limit(100);

  return Response.json({
    windowDays: days,
    aggregated: aggregated.map((row) => ({
      canonicalKey: row.canonicalKey,
      kind: row.kind,
      requestCount: Number(row.requestCount ?? 0),
      tenantCount: Number(row.tenantCount ?? 0),
      totalArrUsd: Number(row.totalArrUsd ?? 0),
      latestVerbatim: row.latestVerbatim ? String(row.latestVerbatim) : null,
      firstSeenAt:
        row.firstSeenAt instanceof Date
          ? row.firstSeenAt.toISOString()
          : new Date(String(row.firstSeenAt)).toISOString(),
      lastSeenAt:
        row.lastSeenAt instanceof Date
          ? row.lastSeenAt.toISOString()
          : new Date(String(row.lastSeenAt)).toISOString(),
    })),
  });
}
