import { db } from "@/db";
import { companies } from "@/db/schema";
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { liftSuppression } from "@/lib/accounts/suppression";

/**
 * POST /api/accounts/restore — bring soft-deleted accounts back.
 *   { ids: string[] }  — restore the given accounts
 *   { all: true }      — restore every deleted account in the tenant
 *
 * Clears deleted_at AND lifts the 'deleted' suppression so the account is
 * eligible for sourcing again. Tenant-scoped.
 */
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const denied = requirePermission(authCtx.role, "companies:delete");
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
        eq(companies.tenantId, authCtx.tenantId),
        isNotNull(companies.deletedAt),
        restoreAll ? undefined : inArray(companies.id, ids),
      );

      const result = await db
        .update(companies)
        .set({ deletedAt: null, updatedAt: sql`now()` })
        .where(scope)
        .returning({ id: companies.id });

      const restoredIds = result.map((r) => r.id);
      if (restoredIds.length > 0) {
        await liftSuppression(authCtx.tenantId, restoredIds, "deleted").catch((e) =>
          console.error("liftSuppression (restore) failed:", e),
        );
      }

      await logAudit({
        tenantId: authCtx.tenantId,
        userId: authCtx.appUserId,
        action: "update",
        entityType: "company",
        entityId: restoreAll ? "*" : ids.join(","),
        metadata: { op: "restore", count: restoredIds.length, all: restoreAll },
      });

      return Response.json({ success: true, restored: restoredIds.length });
    } catch (error) {
      console.error("Failed to restore accounts:", error);
      return Response.json({ error: "Failed to restore accounts" }, { status: 500 });
    }
  });
}
