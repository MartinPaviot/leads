/**
 * Account-lists DB helpers — shared by /api/account-lists and /api/account-lists/[id].
 * Kept out of the route files so the route modules export only HTTP handlers
 * (extra exports from a `route.ts` can pass tsc/CI but break `next build`).
 *
 * A list is a tenant-scoped, user-curated bag of company ids. Counts are scoped
 * to the default working set (live + not excluded) so a chip count matches what
 * clicking the list shows.
 */
import { db } from "@/db";
import { accountLists, accountListMembers, companies } from "@/db/schema";
import { and, eq, sql, inArray, isNull, desc } from "drizzle-orm";

export interface AccountListSummary {
  id: string;
  name: string;
  count: number;
}

/** All of a tenant's lists with a live member count, newest-touched first. */
export async function listsWithCounts(tenantId: string): Promise<AccountListSummary[]> {
  const rows = await db
    .select({
      id: accountLists.id,
      name: accountLists.name,
      count: sql<number>`(
        SELECT count(*)::int FROM account_list_members m
        JOIN companies c ON c.id = m.company_id
        WHERE m.list_id = ${accountLists.id}
          AND c.tenant_id = ${tenantId}
          AND c.deleted_at IS NULL
          AND c.excluded_reason IS NULL
      )`,
    })
    .from(accountLists)
    .where(eq(accountLists.tenantId, tenantId))
    .orderBy(desc(accountLists.updatedAt));
  return rows.map((r) => ({ id: r.id, name: r.name, count: Number(r.count ?? 0) }));
}

/** Live member count for one list (default working set: not deleted, not excluded). */
export async function listLiveCount(listId: string, tenantId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(accountListMembers)
    .innerJoin(companies, eq(companies.id, accountListMembers.companyId))
    .where(
      and(
        eq(accountListMembers.listId, listId),
        eq(companies.tenantId, tenantId),
        isNull(companies.deletedAt),
        isNull(companies.excludedReason),
      ),
    );
  return Number(row?.count ?? 0);
}

/**
 * Insert membership rows for the company ids that genuinely belong to the tenant
 * (and aren't soft-deleted), de-duped against existing members. Never trusts
 * client ids blindly — cross-tenant / stale ids are dropped here. Returns the
 * resulting live member count.
 */
export async function addMembers(listId: string, tenantId: string, companyIds: string[]): Promise<number> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  if (ids.length > 0) {
    const owned = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt), inArray(companies.id, ids)));
    if (owned.length > 0) {
      await db
        .insert(accountListMembers)
        .values(owned.map((c) => ({ listId, companyId: c.id })))
        .onConflictDoNothing();
    }
  }
  return listLiveCount(listId, tenantId);
}
