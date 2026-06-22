/**
 * GET /api/sequences/drafts
 *
 * P0-1 task 1.2 — review-queue listing endpoint.
 *
 * Query :
 *   ?status=pending_approval (default) | approved | rejected | expired | sent | all
 *   ?sequenceId=<id>          optional filter
 *   ?limit=50 (default, max 200)
 *   ?cursor=<generatedAt-ISO> for cursor pagination
 *
 * Response :
 *   { drafts: Array<{...}>, nextCursor: string | null }
 *
 * Indexed by `sequence_drafts_tenant_status_idx` so the read is one
 * probe + scan for the page.
 */

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { sequenceDrafts } from "@/db/schema";
import { and, desc, eq, lt, sql } from "drizzle-orm";

const VALID_STATUSES = new Set([
  "pending_approval",
  "approved",
  "rejected",
  "expired",
  "sent",
]);

export async function GET(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") ?? "pending_approval";
  const sequenceId = url.searchParams.get("sequenceId");
  const limit = Math.min(
    200,
    Math.max(1, Number(url.searchParams.get("limit") ?? 50)),
  );
  const cursor = url.searchParams.get("cursor");

  const conditions = [eq(sequenceDrafts.tenantId, authCtx.tenantId)];

  if (statusParam !== "all") {
    if (!VALID_STATUSES.has(statusParam)) {
      return Response.json({ error: "Invalid status" }, { status: 400 });
    }
    conditions.push(
      eq(sequenceDrafts.status, statusParam as never),
    );
  }
  if (sequenceId) {
    conditions.push(eq(sequenceDrafts.sequenceId, sequenceId));
  }
  if (cursor) {
    const cursorDate = new Date(cursor);
    if (Number.isNaN(cursorDate.getTime())) {
      return Response.json({ error: "Invalid cursor" }, { status: 400 });
    }
    conditions.push(lt(sequenceDrafts.generatedAt, cursorDate));
  }

  const rows = await db
    .select()
    .from(sequenceDrafts)
    .where(and(...conditions))
    .orderBy(desc(sequenceDrafts.generatedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const drafts = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && drafts.length > 0
      ? drafts[drafts.length - 1].generatedAt?.toISOString() ?? null
      : null;

  return Response.json({
    drafts: drafts.map((d) => ({
      id: d.id,
      sequenceId: d.sequenceId,
      stepId: d.stepId,
      enrollmentId: d.enrollmentId,
      contactId: d.contactId,
      subject: d.subject,
      bodyText: d.bodyText,
      // bodyHtml is heavy ; not returned in list, only on detail.
      triggerReason: d.triggerReason,
      personalizationSources: d.personalizationSources,
      status: d.status,
      // P1-15 — quality score for the cockpit queue prioritisation.
      qualityScore: d.qualityScore ?? null,
      generatedAt: d.generatedAt?.toISOString(),
      reviewedAt: d.reviewedAt?.toISOString() ?? null,
      reviewedBy: d.reviewedBy ?? null,
      reviewReason: d.reviewReason ?? null,
      scheduledSendAt: d.scheduledSendAt?.toISOString() ?? null,
      version: d.version,
    })),
    nextCursor,
  });
}
