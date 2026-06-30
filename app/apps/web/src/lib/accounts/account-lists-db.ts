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

/** A drizzle executor — the base `db` OR a transaction handle. Lets the member
 * writes run inside a route's transaction (atomic create / patch). */
export type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** All of a tenant's lists with a live member count, newest-touched first.
 * Single GROUP BY pass (one scan) rather than a correlated subquery per list. */
export async function listsWithCounts(tenantId: string): Promise<AccountListSummary[]> {
  const rows = await db
    .select({
      id: accountLists.id,
      name: accountLists.name,
      // count() of the joined company id — NULL (no live member) counts as 0.
      count: sql<number>`count(${companies.id})::int`,
    })
    .from(accountLists)
    .leftJoin(accountListMembers, eq(accountListMembers.listId, accountLists.id))
    .leftJoin(
      companies,
      and(
        eq(companies.id, accountListMembers.companyId),
        eq(companies.tenantId, tenantId),
        isNull(companies.deletedAt),
        isNull(companies.excludedReason),
      ),
    )
    .where(eq(accountLists.tenantId, tenantId))
    .groupBy(accountLists.id, accountLists.name, accountLists.updatedAt)
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
 * client ids blindly — cross-tenant / stale ids are dropped here. Runs on the
 * given executor so it can join a route's transaction. Returns nothing — callers
 * compute the resulting count via listLiveCount once the tx commits.
 */
export async function insertMembers(
  exec: Executor,
  listId: string,
  tenantId: string,
  companyIds: string[],
): Promise<void> {
  const ids = [...new Set(companyIds.filter(Boolean))];
  if (ids.length === 0) return;
  const owned = await exec
    .select({ id: companies.id })
    .from(companies)
    .where(and(eq(companies.tenantId, tenantId), isNull(companies.deletedAt), inArray(companies.id, ids)));
  if (owned.length > 0) {
    await exec
      .insert(accountListMembers)
      .values(owned.map((c) => ({ listId, companyId: c.id })))
      .onConflictDoNothing();
  }
}

/** Non-transactional convenience: insert members then return the live count. */
export async function addMembers(listId: string, tenantId: string, companyIds: string[]): Promise<number> {
  await insertMembers(db, listId, tenantId, companyIds);
  return listLiveCount(listId, tenantId);
}

/** True for a Postgres unique-violation (23505) — lets a route map the
 * (tenant_id, name) constraint race to a 409 instead of a generic 500. */
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "23505";
}
