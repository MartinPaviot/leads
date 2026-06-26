/**
 * Dashboard-summary metric building blocks, extracted so the tenant-scoping and
 * deal-stage semantics are unit-testable via drizzle `.toSQL()` (no DB) and so the
 * definitions stay single-sourced. See _summary-metrics.test.ts.
 */
import { and, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { sequenceEnrollments, sequences, deals } from "@/db/schema";

/**
 * Tenant-scoped WHERE for the weekly sequence-enrollment count.
 *
 * `sequenceEnrollments` has NO `tenantId` column, so the count MUST be confined to
 * the caller's tenant through the `sequences` join (callers innerJoin sequences on
 * sequenceId). Filtering only on `enrolledAt` — as the route did before — counts
 * EVERY tenant's enrollments (cross-tenant leak). `to` omitted = open-ended
 * (current week); provided = bounded window (previous week).
 */
export function weeklyEnrollmentWhere(tenantId: string, from: Date, to?: Date): SQL {
  const clauses = [eq(sequences.tenantId, tenantId), gte(sequenceEnrollments.enrolledAt, from)];
  if (to) clauses.push(lte(sequenceEnrollments.enrolledAt, to));
  return and(...clauses) as SQL;
}

/**
 * Pipeline value = OPEN deals only (exclude terminal won/lost), matching the
 * canonical predicate in dashboard/pipeline/route.ts. A bare SUM(value) folds
 * closed-deal value into the home "pipeline value" KPI.
 */
export const openDealValueSql = sql<number>`COALESCE(SUM(CASE WHEN ${deals.stage} NOT IN ('won','lost') THEN ${deals.value} ELSE 0 END), 0)::int`;

/** Active deals = OPEN deals only. A bare count(*) counts won+lost too. */
export const openDealCountSql = sql<number>`SUM(CASE WHEN ${deals.stage} NOT IN ('won','lost') THEN 1 ELSE 0 END)::int`;
