/**
 * Metering metrics (spec 02, AC5). Queryable cost-per-qualified-account and
 * cache-hit-rate, computed from the credit_ledger. Tenant-scoped.
 *
 * Note: cost-per-qualified currently divides total spend by DISTINCT charged
 * accounts; once spec 09 lands a qualification flag, the denominator narrows to
 * qualified accounts (the query gains a join — same shape).
 */
import { db } from "@/db";
import { creditLedger } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";

export interface MetricScope {
  workspace: string;
  /** Only count ledger rows since this instant (default: all time). */
  since?: Date;
}

function where(scope: MetricScope) {
  const conds = [eq(creditLedger.tenantId, scope.workspace)];
  if (scope.since) conds.push(gte(creditLedger.createdAt, scope.since));
  return and(...conds);
}

/** Total spend / distinct accounts charged. Null when no accounts charged. */
export async function costPerQualifiedAccount(scope: MetricScope): Promise<number | null> {
  const [row] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${creditLedger.amount}), 0)`,
      accounts: sql<number>`COUNT(DISTINCT ${creditLedger.accountId})`,
    })
    .from(creditLedger)
    .where(where(scope));
  const accounts = Number(row?.accounts ?? 0);
  if (accounts === 0) return null;
  return Number(row.total) / accounts;
}

/** Share of metered calls served from cache, in [0,1]. Null when no calls. */
export async function cacheHitRate(scope: MetricScope): Promise<number | null> {
  const [row] = await db
    .select({
      hits: sql<number>`COUNT(*) FILTER (WHERE ${creditLedger.cacheHit})`,
      total: sql<number>`COUNT(*)`,
    })
    .from(creditLedger)
    .where(where(scope));
  const total = Number(row?.total ?? 0);
  if (total === 0) return null;
  return Number(row.hits) / total;
}

export const metrics = { costPerQualifiedAccount, cacheHitRate };
