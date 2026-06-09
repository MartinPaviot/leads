import { db } from "@/db";
import { deals } from "@/db/schema";
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { cascadeSoftRestoreDeal } from "@/lib/deals/cascade-delete";

/**
 * POST /api/opportunities/restore — bring soft-deleted deals back.
 *   { ids: string[] }  — restore the given deals
 *   { all: true }      — restore every deleted deal in the tenant
 *
 * Clears deleted_at on the deal AND restores the activities/notes/tasks that
 * were cascade-deleted together with it (matched by the shared delete
 * timestamp). Tenant-scoped, permission-gated, audited. Deals carry no
 * suppression entry, so there's nothing to lift (unlike accounts).
 */
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const denied = requirePermission(authCtx.role, "deals:delete");
    if (denied) return denied;

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

    try {
      const scope = and(
        eq(deals.tenantId, authCtx.tenantId),
        isNotNull(deals.deletedAt),
        restoreAll ? undefined : inArray(deals.id, ids),
      );

      // Capture each target's delete timestamp BEFORE clearing it, so the
      // deal's cascade children (activities/notes/tasks) deleted together with
      // it — matched by that shared timestamp — are restored too.
      const targets = await db
        .select({ id: deals.id, deletedAt: deals.deletedAt })
        .from(deals)
        .where(scope);

      for (const t of targets) {
        if (t.deletedAt) {
          await cascadeSoftRestoreDeal(authCtx.tenantId, t.id, t.deletedAt).catch((e) =>
            console.error(`cascade restore failed for deal ${t.id}:`, e),
          );
        }
      }

      const result = await db
        .update(deals)
        .set({ deletedAt: null, updatedAt: sql`now()` })
        .where(scope)
        .returning({ id: deals.id });

      const restoredIds = result.map((r) => r.id);

      await logAudit({
        tenantId: authCtx.tenantId,
        userId: authCtx.appUserId,
        action: "update",
        entityType: "deal",
        entityId: restoreAll ? "*" : ids.join(","),
        metadata: { op: "restore", count: restoredIds.length, all: restoreAll },
      });

      return Response.json({ success: true, restored: restoredIds.length });
    } catch (error) {
      console.error("Failed to restore deals:", error);
      return Response.json({ error: "Failed to restore deals" }, { status: 500 });
    }
  });
}
