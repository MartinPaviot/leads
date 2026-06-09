/**
 * POST /api/icps/restore — bring soft-deleted ICPs back.
 *   { ids: string[] }  — restore the given ICPs
 *   { all: true }      — restore every deleted ICP in the tenant
 *
 * Clears deleted_at and fires the tenant recompute so the restored ICP's
 * company_icp_fit cells (dropped on delete) are rebuilt from its preserved
 * criteria. Admin-only, tenant-scoped, audited.
 */

import { getAuthContext, requireAdmin } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { icps } from "@/db/schema";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { logAudit } from "@/lib/infra/audit-log";
import { inngest } from "@/inngest/client";

export async function POST(req: Request) {
  const authCtx = await getAuthContext();
  if (!authCtx) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const adminCheck = requireAdmin(authCtx);
  if (adminCheck) return adminCheck;

  let body: { ids?: unknown; all?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const restoreAll = body.all === true;
  const ids = Array.isArray(body.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
  if (!restoreAll && ids.length === 0) {
    return Response.json({ error: "ids array or all:true required" }, { status: 400 });
  }

  const scope = and(
    eq(icps.tenantId, authCtx.tenantId),
    isNotNull(icps.deletedAt),
    restoreAll ? undefined : inArray(icps.id, ids),
  );

  const result = await db
    .update(icps)
    .set({ deletedAt: null, updatedAt: sql`now()` })
    .where(scope)
    .returning({ id: icps.id });

  const restoredIds = result.map((r) => r.id);

  // Rebuild the fit matrix for the restored ICP(s) from their preserved
  // criteria (their cells were dropped on delete).
  if (restoredIds.length > 0) {
    inngest
      .send({ name: "icp/recompute-tenant", data: { tenantId: authCtx.tenantId } })
      .catch(() => {});
  }

  await logAudit({
    tenantId: authCtx.tenantId,
    userId: authCtx.appUserId,
    action: "update",
    entityType: "icp",
    entityId: restoreAll ? "*" : ids.join(","),
    metadata: { op: "restore", count: restoredIds.length, all: restoreAll },
  });

  return Response.json({ success: true, restored: restoredIds.length });
}
