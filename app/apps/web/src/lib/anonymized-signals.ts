/**
 * Cross-tenant anonymized signal aggregation (#96).
 *
 * Collects anonymized, non-PII signal patterns across all tenants
 * to improve scoring weights, email timing, and industry benchmarks.
 *
 * Privacy guarantees:
 * - No company names, contact names, or email addresses
 * - Only aggregate counts and rates (e.g., "SaaS companies 50-200 employees:
 *   avg deal cycle 45 days, avg reply rate 12%")
 * - Minimum k-anonymity threshold: data only reported when >=10 tenants
 *   contribute to a bucket
 * - Tenants can opt out via settings.anonymizedDataContribution = false
 */

import { db } from "@/db";
import {
  signalOutcomes,
  companies,
  deals,
  tenants,
  anonymizedSignalBenchmarks,
} from "@/db/schema";
import { and, eq, sql, gte, isNotNull, ne } from "drizzle-orm";

/** Minimum number of distinct tenants required per bucket (k-anonymity). */
const K_ANONYMITY_THRESHOLD = 10;

export interface AnonymizedSignalBucket {
  industry: string;
  companySize: string;
  signalType: string;
  /** Fraction of signals that led to won deals (0.0 - 1.0). */
  outcomeRate: number;
  /** Number of distinct tenants contributing to this bucket. */
  sampleSize: number;
  /** Total signal outcome observations in this bucket. */
  totalObservations: number;
  /** Average deal cycle in days for won deals (null if not enough data). */
  avgDealCycleDays: number | null;
  /** ISO timestamp of last aggregation. */
  updatedAt: string;
}

/**
 * Aggregate anonymized signal outcomes across all opted-in tenants.
 *
 * This function:
 * 1. Identifies tenants that have NOT opted out (anonymizedDataContribution !== false)
 * 2. Joins signal_outcomes with companies to get industry + size
 * 3. Groups by (industry, companySize, signalType)
 * 4. Filters out buckets with fewer than K_ANONYMITY_THRESHOLD distinct tenants
 * 5. Upserts results into the anonymized_signal_benchmarks table
 * 6. Returns the resulting buckets
 */
export async function aggregateAnonymizedSignals(): Promise<AnonymizedSignalBucket[]> {
  // Step 1: Identify opted-out tenants so we can exclude them.
  // Tenants with anonymizedDataContribution explicitly set to false are excluded.
  // Default (undefined / true) means opted in.
  const allTenants = await db
    .select({ id: tenants.id, settings: tenants.settings })
    .from(tenants);

  const optedOutTenantIds = new Set<string>();
  for (const t of allTenants) {
    const settings = (t.settings || {}) as Record<string, unknown>;
    if (settings.anonymizedDataContribution === false) {
      optedOutTenantIds.add(t.id);
    }
  }

  // Step 2: Query signal outcomes joined with company industry + size,
  // grouped by (industry, companySize, signalType), counting distinct
  // tenants and computing win rates.
  //
  // We use a raw SQL aggregation because drizzle's groupBy + countDistinct
  // on a multi-table join with conditional counting is more readable this way.
  const rawBuckets = await db
    .select({
      industry: companies.industry,
      companySize: companies.size,
      signalType: signalOutcomes.signalType,
      distinctTenants: sql<number>`count(distinct ${signalOutcomes.tenantId})::int`,
      totalObservations: sql<number>`count(*)::int`,
      wonCount: sql<number>`count(*) filter (where ${signalOutcomes.outcome} = 'won')::int`,
      // Average deal cycle: days between deal creation and last signal outcome
      // (proxy for deal velocity). Only for won deals with a company reference.
      avgDealCycleDays: sql<number | null>`
        avg(
          case
            when ${signalOutcomes.outcome} = 'won'
              and ${deals.createdAt} is not null
              and ${signalOutcomes.recordedAt} is not null
            then extract(epoch from (${signalOutcomes.recordedAt} - ${deals.createdAt})) / 86400.0
            else null
          end
        )::real
      `,
    })
    .from(signalOutcomes)
    .innerJoin(companies, eq(signalOutcomes.companyId, companies.id))
    .innerJoin(deals, eq(signalOutcomes.dealId, deals.id))
    .where(
      and(
        isNotNull(companies.industry),
        isNotNull(companies.size),
        // Exclude soft-deleted companies
        sql`${companies.deletedAt} is null`,
      )
    )
    .groupBy(companies.industry, companies.size, signalOutcomes.signalType);

  // Step 3: Filter for k-anonymity and exclude opted-out tenants.
  // Since SQL can't filter by a Set in the WHERE clause efficiently for
  // the distinct-tenant count excluding specific tenants, we do a second
  // pass: re-query per bucket only including opted-in tenants.
  // However, for the initial implementation (before production data),
  // we take the pragmatic approach: filter opted-out tenants from the
  // rawBuckets result. The distinctTenants count from SQL includes all
  // tenants; we need to re-count excluding opted-out ones.
  //
  // For correctness, we re-query with the exclusion baked in.
  // This is a weekly cron, so performance is acceptable.

  // Build a NOT IN clause for opted-out tenants
  const optedOutArray = Array.from(optedOutTenantIds);

  // Re-query with opted-out tenants excluded
  const filteredBuckets = optedOutArray.length > 0
    ? await db
        .select({
          industry: companies.industry,
          companySize: companies.size,
          signalType: signalOutcomes.signalType,
          distinctTenants: sql<number>`count(distinct ${signalOutcomes.tenantId})::int`,
          totalObservations: sql<number>`count(*)::int`,
          wonCount: sql<number>`count(*) filter (where ${signalOutcomes.outcome} = 'won')::int`,
          avgDealCycleDays: sql<number | null>`
            avg(
              case
                when ${signalOutcomes.outcome} = 'won'
                  and ${deals.createdAt} is not null
                  and ${signalOutcomes.recordedAt} is not null
                then extract(epoch from (${signalOutcomes.recordedAt} - ${deals.createdAt})) / 86400.0
                else null
              end
            )::real
          `,
        })
        .from(signalOutcomes)
        .innerJoin(companies, eq(signalOutcomes.companyId, companies.id))
        .innerJoin(deals, eq(signalOutcomes.dealId, deals.id))
        .where(
          and(
            isNotNull(companies.industry),
            isNotNull(companies.size),
            sql`${companies.deletedAt} is null`,
            sql`${signalOutcomes.tenantId} not in (${sql.join(
              optedOutArray.map((id) => sql`${id}`),
              sql`, `,
            )})`,
          )
        )
        .groupBy(companies.industry, companies.size, signalOutcomes.signalType)
    : rawBuckets;

  // Step 4: Apply k-anonymity threshold
  const now = new Date().toISOString();
  const buckets: AnonymizedSignalBucket[] = filteredBuckets
    .filter((b) => b.distinctTenants >= K_ANONYMITY_THRESHOLD)
    .filter((b): b is typeof b & { industry: string; companySize: string } =>
      b.industry !== null && b.companySize !== null
    )
    .map((b) => ({
      industry: b.industry!,
      companySize: b.companySize!,
      signalType: b.signalType,
      outcomeRate: b.totalObservations > 0 ? b.wonCount / b.totalObservations : 0,
      sampleSize: b.distinctTenants,
      totalObservations: b.totalObservations,
      avgDealCycleDays: b.avgDealCycleDays !== null
        ? Math.round(b.avgDealCycleDays * 10) / 10
        : null,
      updatedAt: now,
    }));

  // Step 5: Upsert into the benchmarks table (replace all — this is a
  // full refresh, not incremental). We delete-then-insert inside a
  // transaction so readers never see a partially refreshed state.
  if (buckets.length > 0) {
    await db.transaction(async (tx) => {
      // Clear existing benchmarks
      await tx.delete(anonymizedSignalBenchmarks).execute();

      // Insert fresh data
      await tx.insert(anonymizedSignalBenchmarks).values(
        buckets.map((b) => ({
          industry: b.industry,
          companySize: b.companySize,
          signalType: b.signalType,
          outcomeRate: b.outcomeRate,
          tenantCount: b.sampleSize,
          totalObservations: b.totalObservations,
          avgDealCycleDays: b.avgDealCycleDays,
          aggregatedAt: new Date(),
        }))
      );
    });
  }

  return buckets;
}

/**
 * Get anonymized benchmarks for a specific industry and company size.
 *
 * Returns all signal type buckets matching the given filters. If no
 * exact match exists for the company size, returns all sizes for that
 * industry so the caller can pick the closest match.
 *
 * This reads from the pre-computed `anonymized_signal_benchmarks` table
 * (not a live aggregation), so it is fast and safe to call from API
 * routes without concern for query cost.
 */
export async function getAnonymizedBenchmark(
  industry: string,
  companySize: string,
): Promise<AnonymizedSignalBucket[]> {
  // Try exact match first
  const exactRows = await db
    .select()
    .from(anonymizedSignalBenchmarks)
    .where(
      and(
        eq(anonymizedSignalBenchmarks.industry, industry),
        eq(anonymizedSignalBenchmarks.companySize, companySize),
      )
    );

  if (exactRows.length > 0) {
    return exactRows.map(rowToBucket);
  }

  // Fall back to all sizes for this industry
  const industryRows = await db
    .select()
    .from(anonymizedSignalBenchmarks)
    .where(eq(anonymizedSignalBenchmarks.industry, industry));

  return industryRows.map(rowToBucket);
}

/**
 * Get all available benchmarks. Used by the API endpoint to return
 * the full dataset when no filters are applied.
 */
export async function getAllBenchmarks(): Promise<AnonymizedSignalBucket[]> {
  const rows = await db
    .select()
    .from(anonymizedSignalBenchmarks);

  return rows.map(rowToBucket);
}

/** Map a DB row to the public AnonymizedSignalBucket interface. */
function rowToBucket(row: typeof anonymizedSignalBenchmarks.$inferSelect): AnonymizedSignalBucket {
  return {
    industry: row.industry,
    companySize: row.companySize,
    signalType: row.signalType,
    outcomeRate: row.outcomeRate,
    sampleSize: row.tenantCount,
    totalObservations: row.totalObservations,
    avgDealCycleDays: row.avgDealCycleDays,
    updatedAt: row.updatedAt.toISOString(),
  };
}
