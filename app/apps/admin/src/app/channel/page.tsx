/**
 * WS-1: Notetaker Channel dashboard.
 *
 * Treats the Elevay-branded meeting bot as a measurable acquisition channel:
 *   - exposures (lifetime + 30d)
 *   - signups attributed (lifetime + 30d + conversion)
 *   - K-factor over the last 12 weeks
 *   - top referring tenants
 *   - exposure → signup delay distribution
 *
 * Queries only aggregates from `notetaker_exposures` joined with `tenants`.
 */

import { db, notetakerExposures, tenants } from "../../lib/db";
import { sql, desc, eq, isNotNull, and, gte } from "drizzle-orm";
import { StatCard } from "../../components/stat-card";

export const dynamic = "force-dynamic";

async function getTotals() {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);

  const [totals] = await db
    .select({
      exposures: sql<number>`count(*)::int`,
      exposuresLast30d: sql<number>`count(*) filter (where ${notetakerExposures.exposureAt} >= ${thirtyDaysAgo})::int`,
      ctaClicks: sql<number>`count(*) filter (where ${notetakerExposures.ctaClickedAt} is not null)::int`,
      signups: sql<number>`count(*) filter (where ${notetakerExposures.signupAttributedTenantId} is not null)::int`,
      signupsLast30d: sql<number>`count(*) filter (where ${notetakerExposures.signupAttributedAt} >= ${thirtyDaysAgo})::int`,
    })
    .from(notetakerExposures);

  // Conversion rate against *settled* exposures only (older than 90d, full attribution window elapsed)
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
  const [settled] = await db
    .select({
      total: sql<number>`count(*)::int`,
      converted: sql<number>`count(*) filter (where ${notetakerExposures.signupAttributedTenantId} is not null)::int`,
    })
    .from(notetakerExposures)
    .where(sql`${notetakerExposures.exposureAt} < ${ninetyDaysAgo}`);

  const conversionRate = settled && settled.total > 0
    ? (settled.converted / settled.total)
    : null;

  return { ...totals, conversionRate, settledTotal: settled?.total ?? 0 };
}

async function getWeeklyKFactor() {
  // K-factor week t = signups_attributed_in_week_t / unique_referring_tenants_who_exposed_in_week_t
  // Approximate with a single SQL that buckets both sides by ISO week.
  const rows = await db.execute(sql`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', now() - interval '11 weeks'),
        date_trunc('week', now()),
        interval '1 week'
      ) AS week_start
    ),
    exposures_by_week AS (
      SELECT date_trunc('week', ${notetakerExposures.exposureAt}) AS w,
             count(DISTINCT ${notetakerExposures.referringTenantId}) AS referrers
      FROM ${notetakerExposures}
      WHERE ${notetakerExposures.exposureAt} >= date_trunc('week', now() - interval '11 weeks')
      GROUP BY 1
    ),
    signups_by_week AS (
      SELECT date_trunc('week', ${notetakerExposures.signupAttributedAt}) AS w,
             count(*) AS signups
      FROM ${notetakerExposures}
      WHERE ${notetakerExposures.signupAttributedAt} >= date_trunc('week', now() - interval '11 weeks')
      GROUP BY 1
    )
    SELECT weeks.week_start AS week,
           coalesce(exposures_by_week.referrers, 0) AS referrers,
           coalesce(signups_by_week.signups, 0) AS signups
    FROM weeks
    LEFT JOIN exposures_by_week ON weeks.week_start = exposures_by_week.w
    LEFT JOIN signups_by_week ON weeks.week_start = signups_by_week.w
    ORDER BY weeks.week_start;
  `);

  return (rows as unknown as Array<{ week: Date; referrers: number; signups: number }>).map((r) => ({
    week: new Date(r.week),
    referrers: Number(r.referrers),
    signups: Number(r.signups),
    kFactor: Number(r.referrers) > 0 ? Number(r.signups) / Number(r.referrers) : 0,
  }));
}

async function getTopReferrers() {
  const rows = await db
    .select({
      tenantId: notetakerExposures.referringTenantId,
      tenantName: tenants.name,
      exposures: sql<number>`count(*)::int`,
      signups: sql<number>`count(*) filter (where ${notetakerExposures.signupAttributedTenantId} is not null)::int`,
    })
    .from(notetakerExposures)
    .leftJoin(tenants, eq(tenants.id, notetakerExposures.referringTenantId))
    .groupBy(notetakerExposures.referringTenantId, tenants.name)
    .orderBy(desc(sql`count(*) filter (where ${notetakerExposures.signupAttributedTenantId} is not null)`))
    .limit(10);
  return rows;
}

async function getDelayStats() {
  const [row] = await db
    .select({
      medianDays: sql<number>`percentile_cont(0.5) within group (order by extract(epoch from (${notetakerExposures.signupAttributedAt} - ${notetakerExposures.exposureAt})) / 86400)`,
      p90Days: sql<number>`percentile_cont(0.9) within group (order by extract(epoch from (${notetakerExposures.signupAttributedAt} - ${notetakerExposures.exposureAt})) / 86400)`,
      count: sql<number>`count(*)::int`,
    })
    .from(notetakerExposures)
    .where(
      and(
        isNotNull(notetakerExposures.signupAttributedAt),
        gte(notetakerExposures.exposureAt, new Date(Date.now() - 180 * 24 * 3600 * 1000))
      )
    );
  return row;
}

function formatPct(n: number | null): string {
  if (n === null) return "--";
  return `${(n * 100).toFixed(1)}%`;
}

export default async function ChannelPage() {
  const [totals, weekly, topReferrers, delayStats] = await Promise.all([
    getTotals(),
    getWeeklyKFactor(),
    getTopReferrers(),
    getDelayStats(),
  ]);

  const ctaConversion = totals.exposures > 0
    ? (totals.ctaClicks / totals.exposures)
    : 0;

  const latestK = weekly[weekly.length - 1]?.kFactor ?? 0;

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Notetaker Channel
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Recorder as an acquisition channel · exposures, attribution, K-factor
      </p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Exposures (lifetime)"
          value={totals.exposures}
          subtitle={`${totals.exposuresLast30d} last 30d`}
        />
        <StatCard
          label="Signups attributed"
          value={totals.signups}
          subtitle={`${totals.signupsLast30d} last 30d`}
          status={totals.signups > 0 ? "healthy" : "warning"}
        />
        <StatCard
          label="Conversion (settled)"
          value={formatPct(totals.conversionRate)}
          subtitle={`${totals.settledTotal} exposures >90d old`}
          status={(totals.conversionRate ?? 0) >= 0.02 ? "healthy" : "warning"}
        />
        <StatCard
          label="K-factor (latest week)"
          value={latestK.toFixed(2)}
          subtitle="signups / exposing tenants"
          status={latestK >= 0.3 ? "healthy" : "warning"}
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label="CTA click rate"
          value={formatPct(ctaConversion)}
          subtitle={`${totals.ctaClicks} clicks / ${totals.exposures} exposures`}
        />
        <StatCard
          label="Median exposure → signup"
          value={delayStats?.medianDays != null ? `${Number(delayStats.medianDays).toFixed(1)}d` : "--"}
          subtitle={`p90: ${delayStats?.p90Days != null ? Number(delayStats.p90Days).toFixed(1) + "d" : "--"}`}
        />
        <StatCard
          label="Attributed signups (180d)"
          value={delayStats?.count ?? 0}
          subtitle="used for delay stats"
        />
      </div>

      {/* Weekly K-factor */}
      <h2 className="text-[16px] font-semibold mb-3">K-factor — last 12 weeks</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[12px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-3 py-2.5 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Week starting</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Referring tenants</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Signups attributed</th>
              <th className="px-3 py-2.5 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>K-factor</th>
            </tr>
          </thead>
          <tbody>
            {weekly.map((w: { week: Date; referrers: number; signups: number; kFactor: number }) => (
              <tr key={w.week.toISOString()} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-3 py-2 font-medium">{w.week.toLocaleDateString()}</td>
                <td className="px-3 py-2 text-right" style={{ color: "var(--color-text-tertiary)" }}>{w.referrers}</td>
                <td className="px-3 py-2 text-right">{w.signups}</td>
                <td className="px-3 py-2 text-right">
                  <span style={{ color: w.kFactor >= 0.3 ? "var(--color-success)" : w.kFactor > 0 ? "var(--color-text-secondary)" : "var(--color-text-tertiary)", fontWeight: 600 }}>
                    {w.kFactor.toFixed(2)}
                  </span>
                </td>
              </tr>
            ))}
            {weekly.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No exposure data yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Top referring tenants */}
      <h2 className="text-[16px] font-semibold mb-3">Top referring tenants</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Tenant</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Exposures</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Signups</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Conversion</th>
            </tr>
          </thead>
          <tbody>
            {topReferrers.map((r: { tenantId: string; tenantName: string | null; exposures: number; signups: number }) => {
              const conv = r.exposures > 0 ? r.signups / r.exposures : 0;
              return (
                <tr key={r.tenantId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">{r.tenantName || r.tenantId}</td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>{r.exposures}</td>
                  <td className="px-4 py-3 text-right">{r.signups}</td>
                  <td className="px-4 py-3 text-right">
                    <span style={{ color: conv >= 0.02 ? "var(--color-success)" : "var(--color-text-secondary)", fontWeight: 600 }}>
                      {formatPct(conv)}
                    </span>
                  </td>
                </tr>
              );
            })}
            {topReferrers.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No referring tenants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
