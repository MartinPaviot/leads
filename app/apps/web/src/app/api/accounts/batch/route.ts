import { db } from "@/db";
import { companies } from "@/db/schema";
import { withAuthRLS } from "@/lib/auth/auth-utils";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requirePermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/infra/audit-log";
import { suppressAccounts } from "@/lib/accounts/suppression";
import { cascadeSoftDeleteCompanies, CASCADE_TYPES, type CascadeType } from "@/lib/accounts/cascade-delete";

/**
 * Batch fetch accounts by IDs — replaces N+1 individual fetches.
 * POST /api/accounts/batch { ids: string[] }
 */
export async function POST(req: Request) {
  return withAuthRLS(async (authCtx) => {
    try {
      const body = await req.json();
      const ids: string[] = body.ids;

      if (!Array.isArray(ids) || ids.length === 0) {
        return Response.json({ error: "ids array required" }, { status: 400 });
      }

      // Cap at 50 to prevent abuse
      const limitedIds = ids.slice(0, 50);

      const accounts = await db
        .select({
          id: companies.id,
          name: companies.name,
          domain: companies.domain,
          industry: companies.industry,
          size: companies.size,
          score: companies.score,
        })
        .from(companies)
        .where(and(
          eq(companies.tenantId, authCtx.tenantId),
          inArray(companies.id, limitedIds),
          isNull(companies.deletedAt),
        ));

      // Return as a map for easy client-side lookup
      const accountMap: Record<string, typeof accounts[0]> = {};
      for (const a of accounts) {
        accountMap[a.id] = a;
      }

      return Response.json({ accounts: accountMap });
    } catch (error) {
      return Response.json({ error: "Failed to fetch accounts" }, { status: 500 });
    }
  });
}

/**
 * Bulk soft-delete accounts.
 * DELETE /api/accounts/batch
 *   { ids: string[] }            — delete the given accounts
 *   { all: true }                — delete every account in the tenant
 *   { cascade?: CascadeType[] }  — also soft-delete the ticked related sets
 *                                  (contacts/deals/activities/notes/tasks)
 *
 * Soft-delete only (sets deleted_at) — everything lands in the Archive view
 * and is restorable. The cascade shares ONE timestamp with the accounts so a
 * later restore brings back exactly the set deleted together (symmetric
 * cascade-restore, same contract as DELETE /api/accounts/[id]).
 * Tenant-scoped: the `all` path can never touch another tenant's rows.
 */
export async function DELETE(req: Request) {
  return withAuthRLS(async (authCtx) => {
    const denied = requirePermission(authCtx.role, "companies:delete");
    if (denied) return denied;

    let body: { ids?: unknown; all?: unknown; cascade?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const deleteAll = body.all === true;
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((x): x is string => typeof x === "string")
      : [];
    const cascade: CascadeType[] = Array.isArray(body.cascade)
      ? body.cascade.filter(
          (t): t is CascadeType => typeof t === "string" && (CASCADE_TYPES as readonly string[]).includes(t),
        )
      : [];

    if (!deleteAll && ids.length === 0) {
      return Response.json({ error: "ids array or all:true required" }, { status: 400 });
    }

    try {
      const tenantScope = and(
        eq(companies.tenantId, authCtx.tenantId),
        isNull(companies.deletedAt),
        deleteAll ? undefined : inArray(companies.id, ids),
      );

      // Capture the stable identity of what we're about to remove so the
      // suppression ledger can keep it out of future sourcing for good.
      const removed = await db
        .select({ id: companies.id, name: companies.name, domain: companies.domain, properties: companies.properties })
        .from(companies)
        .where(tenantScope);

      // Cascade the selected related sets first (soft-delete, recoverable),
      // then the accounts. One shared timestamp across accounts AND cascade so
      // restoring an account also restores what was deleted with it.
      const deletedAt = new Date();
      const cascaded = cascade.length
        ? await cascadeSoftDeleteCompanies(authCtx.tenantId, removed.map((r) => r.id), cascade, deletedAt)
        : {};

      const result = await db
        .update(companies)
        // Spec 35 D5 dual-write: soft-delete archives the account (reversible).
        .set({ deletedAt, targetingStatus: "archived", updatedAt: deletedAt })
        .where(tenantScope)
        .returning({ id: companies.id });

      if (removed.length > 0) {
        await suppressAccounts({
          tenantId: authCtx.tenantId,
          kind: "deleted",
          reason: "user_deleted",
          createdBy: authCtx.appUserId,
          companies: removed,
        }).catch((e) => console.error("suppressAccounts (delete) failed:", e));
      }

      await logAudit({
        tenantId: authCtx.tenantId,
        userId: authCtx.appUserId,
        action: "delete",
        entityType: "company",
        entityId: deleteAll ? "*" : ids.join(","),
        metadata: { deletedCount: result.length, all: deleteAll, softDeleted: true, cascaded },
      });

      return Response.json({ success: true, deleted: result.length, cascaded });
    } catch (error) {
      console.error("Failed to bulk-delete accounts:", error);
      return Response.json({ error: "Failed to delete accounts" }, { status: 500 });
    }
  });
}
