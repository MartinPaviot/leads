import { db, tenants, deals, companies, contacts } from "../../../lib/db";
import { sql, desc, eq, count, isNotNull } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";

export const dynamic = "force-dynamic";

interface ScoringModelStatus {
  tenantId: string;
  tenantName: string;
  isTrained: boolean;
  sampleSize: number;
  lastTrainedAt: Date | null;
  modelConfig: Record<string, unknown>;
}

async function getScoringModelStatus(): Promise<ScoringModelStatus[]> {
  const allTenants = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      settings: tenants.settings,
    })
    .from(tenants)
    .orderBy(tenants.name);

  const results: ScoringModelStatus[] = [];

  for (const t of allTenants) {
    const settings = (t.settings || {}) as Record<string, unknown>;
    const scoringModel = (settings.scoringModel || settings.scoring_model || null) as Record<string, unknown> | null;

    // Count scored entities as proxy for sample size
    const [scored] = await db
      .select({
        companiesScored: sql<number>`count(*) filter (where ${companies.score} is not null)`,
        contactsScored: sql<number>`count(*) filter (where ${contacts.score} is not null)`,
        dealsScored: sql<number>`count(*) filter (where ${deals.score} is not null)`,
      })
      .from(companies)
      .leftJoin(contacts, eq(contacts.tenantId, companies.tenantId))
      .leftJoin(deals, eq(deals.tenantId, companies.tenantId))
      .where(eq(companies.tenantId, t.id));

    const sampleSize = Number(scored?.companiesScored || 0) +
      Number(scored?.contactsScored || 0) +
      Number(scored?.dealsScored || 0);

    const isTrained = scoringModel !== null && Object.keys(scoringModel).length > 0;
    const lastTrainedAt = scoringModel?.lastTrainedAt
      ? new Date(scoringModel.lastTrainedAt as string)
      : scoringModel?.last_trained_at
        ? new Date(scoringModel.last_trained_at as string)
        : null;

    results.push({
      tenantId: t.id,
      tenantName: t.name,
      isTrained,
      sampleSize,
      lastTrainedAt,
      modelConfig: scoringModel || {},
    });
  }

  return results;
}

interface DealAccuracy {
  tenantId: string;
  tenantName: string;
  closedWon: number;
  closedLost: number;
  avgScoreWon: number | null;
  avgScoreLost: number | null;
  scoredDeals: number;
  totalClosed: number;
}

async function getModelAccuracy(): Promise<DealAccuracy[]> {
  const rows = await db
    .select({
      tenantId: deals.tenantId,
      tenantName: tenants.name,
      closedWon: sql<number>`count(*) filter (where ${deals.stage} = 'closed_won')`,
      closedLost: sql<number>`count(*) filter (where ${deals.stage} = 'closed_lost')`,
      avgScoreWon: sql<number>`avg(${deals.score}) filter (where ${deals.stage} = 'closed_won')`,
      avgScoreLost: sql<number>`avg(${deals.score}) filter (where ${deals.stage} = 'closed_lost')`,
      scoredDeals: sql<number>`count(*) filter (where ${deals.score} is not null and ${deals.stage} in ('closed_won', 'closed_lost'))`,
      totalClosed: sql<number>`count(*) filter (where ${deals.stage} in ('closed_won', 'closed_lost'))`,
    })
    .from(deals)
    .leftJoin(tenants, eq(tenants.id, deals.tenantId))
    .where(sql`${deals.stage} in ('closed_won', 'closed_lost')`)
    .groupBy(deals.tenantId, tenants.name)
    .orderBy(desc(sql`count(*) filter (where ${deals.stage} in ('closed_won', 'closed_lost'))`));

  return rows.map((r) => ({
    tenantId: r.tenantId,
    tenantName: r.tenantName || r.tenantId,
    closedWon: Number(r.closedWon),
    closedLost: Number(r.closedLost),
    avgScoreWon: r.avgScoreWon ? Number(r.avgScoreWon) : null,
    avgScoreLost: r.avgScoreLost ? Number(r.avgScoreLost) : null,
    scoredDeals: Number(r.scoredDeals),
    totalClosed: Number(r.totalClosed),
  }));
}

interface FeatureImportance {
  feature: string;
  coverage: number;
  avgScoreWhenPresent: number | null;
  avgScoreWhenAbsent: number | null;
  lift: number | null;
}

async function getFeatureImportance(): Promise<FeatureImportance[]> {
  // Analyze which company features correlate most with deal score
  const features: FeatureImportance[] = [];

  // Industry
  const [industryStats] = await db
    .select({
      withIndustry: sql<number>`count(*) filter (where ${companies.industry} is not null)`,
      withoutIndustry: sql<number>`count(*) filter (where ${companies.industry} is null)`,
      avgScoreWith: sql<number>`avg(${companies.score}) filter (where ${companies.industry} is not null)`,
      avgScoreWithout: sql<number>`avg(${companies.score}) filter (where ${companies.industry} is null)`,
      total: count(),
    })
    .from(companies)
    .where(isNotNull(companies.score));

  const totalScored = Number(industryStats?.total || 0);
  if (totalScored > 0) {
    const withPct = Number(industryStats?.withIndustry || 0) / totalScored;
    const avgWith = industryStats?.avgScoreWith ? Number(industryStats.avgScoreWith) : null;
    const avgWithout = industryStats?.avgScoreWithout ? Number(industryStats.avgScoreWithout) : null;
    features.push({
      feature: "Industry",
      coverage: withPct,
      avgScoreWhenPresent: avgWith,
      avgScoreWhenAbsent: avgWithout,
      lift: avgWith && avgWithout ? avgWith - avgWithout : null,
    });
  }

  // Size
  const [sizeStats] = await db
    .select({
      withSize: sql<number>`count(*) filter (where ${companies.size} is not null)`,
      withoutSize: sql<number>`count(*) filter (where ${companies.size} is null)`,
      avgScoreWith: sql<number>`avg(${companies.score}) filter (where ${companies.size} is not null)`,
      avgScoreWithout: sql<number>`avg(${companies.score}) filter (where ${companies.size} is null)`,
      total: count(),
    })
    .from(companies)
    .where(isNotNull(companies.score));

  if (Number(sizeStats?.total || 0) > 0) {
    const withPct = Number(sizeStats?.withSize || 0) / Number(sizeStats?.total || 1);
    const avgWith = sizeStats?.avgScoreWith ? Number(sizeStats.avgScoreWith) : null;
    const avgWithout = sizeStats?.avgScoreWithout ? Number(sizeStats.avgScoreWithout) : null;
    features.push({
      feature: "Company Size",
      coverage: withPct,
      avgScoreWhenPresent: avgWith,
      avgScoreWhenAbsent: avgWithout,
      lift: avgWith && avgWithout ? avgWith - avgWithout : null,
    });
  }

  // Revenue
  const [revenueStats] = await db
    .select({
      withRevenue: sql<number>`count(*) filter (where ${companies.revenue} is not null)`,
      withoutRevenue: sql<number>`count(*) filter (where ${companies.revenue} is null)`,
      avgScoreWith: sql<number>`avg(${companies.score}) filter (where ${companies.revenue} is not null)`,
      avgScoreWithout: sql<number>`avg(${companies.score}) filter (where ${companies.revenue} is null)`,
      total: count(),
    })
    .from(companies)
    .where(isNotNull(companies.score));

  if (Number(revenueStats?.total || 0) > 0) {
    const withPct = Number(revenueStats?.withRevenue || 0) / Number(revenueStats?.total || 1);
    const avgWith = revenueStats?.avgScoreWith ? Number(revenueStats.avgScoreWith) : null;
    const avgWithout = revenueStats?.avgScoreWithout ? Number(revenueStats.avgScoreWithout) : null;
    features.push({
      feature: "Revenue",
      coverage: withPct,
      avgScoreWhenPresent: avgWith,
      avgScoreWhenAbsent: avgWithout,
      lift: avgWith && avgWithout ? avgWith - avgWithout : null,
    });
  }

  // Activity count (meetings as proxy for engagement)
  // activities table uses entityType='company' + entityId, and activityType enum values like 'meeting_completed'
  const [meetingScoreStats] = await db
    .select({
      withMeetings: sql<number>`count(distinct c.id) filter (where c.id in (select entity_id from activities where entity_type = 'company' and activity_type in ('meeting_scheduled', 'meeting_completed')))`,
      avgScoreWithMeeting: sql<number>`avg(c.score) filter (where c.id in (select entity_id from activities where entity_type = 'company' and activity_type in ('meeting_scheduled', 'meeting_completed')))`,
      avgScoreWithoutMeeting: sql<number>`avg(c.score) filter (where c.id not in (select entity_id from activities where entity_type = 'company' and activity_type in ('meeting_scheduled', 'meeting_completed')))`,
      total: sql<number>`count(*)`,
    })
    .from(sql`companies c`)
    .where(sql`c.score is not null`);

  if (Number(meetingScoreStats?.total || 0) > 0) {
    const withMeetings = Number(meetingScoreStats?.withMeetings || 0);
    const totalCompanies = Number(meetingScoreStats?.total || 0);
    const avgWith = meetingScoreStats?.avgScoreWithMeeting ? Number(meetingScoreStats.avgScoreWithMeeting) : null;
    const avgWithout = meetingScoreStats?.avgScoreWithoutMeeting ? Number(meetingScoreStats.avgScoreWithoutMeeting) : null;
    features.push({
      feature: "Meetings Held",
      coverage: totalCompanies > 0 ? withMeetings / totalCompanies : 0,
      avgScoreWhenPresent: avgWith,
      avgScoreWhenAbsent: avgWithout,
      lift: avgWith && avgWithout ? avgWith - avgWithout : null,
    });
  }

  // Sort by absolute lift value descending
  features.sort((a, b) => Math.abs(b.lift || 0) - Math.abs(a.lift || 0));

  return features;
}

interface ForecastAccuracy {
  tenantId: string;
  tenantName: string;
  predictedRevenue: number;
  actualRevenue: number;
  accuracy: number | null;
  dealCount: number;
}

async function getForecastAccuracy(): Promise<ForecastAccuracy[]> {
  // Compare predicted (value * score) vs actual (value of closed_won)
  const rows = await db
    .select({
      tenantId: deals.tenantId,
      tenantName: tenants.name,
      predictedRevenue: sql<number>`coalesce(sum(${deals.value} * coalesce(${deals.score}, 0.5)), 0)`,
      actualRevenue: sql<number>`coalesce(sum(${deals.value}) filter (where ${deals.stage} = 'closed_won'), 0)`,
      dealCount: sql<number>`count(*) filter (where ${deals.stage} in ('closed_won', 'closed_lost'))`,
    })
    .from(deals)
    .leftJoin(tenants, eq(tenants.id, deals.tenantId))
    .where(sql`${deals.stage} in ('closed_won', 'closed_lost')`)
    .groupBy(deals.tenantId, tenants.name)
    .orderBy(desc(sql`count(*) filter (where ${deals.stage} in ('closed_won', 'closed_lost'))`));

  return rows.map((r) => {
    const predicted = Number(r.predictedRevenue) || 0;
    const actual = Number(r.actualRevenue) || 0;
    const accuracy = predicted > 0 ? 1 - Math.abs(predicted - actual) / Math.max(predicted, actual) : null;
    return {
      tenantId: r.tenantId,
      tenantName: r.tenantName || r.tenantId,
      predictedRevenue: predicted,
      actualRevenue: actual,
      accuracy,
      dealCount: Number(r.dealCount),
    };
  });
}

export default async function ScoringPage() {
  const [modelStatus, accuracy, featureImportance, forecastAccuracy] = await Promise.all([
    getScoringModelStatus(),
    getModelAccuracy(),
    getFeatureImportance(),
    getForecastAccuracy(),
  ]);

  const trainedCount = modelStatus.filter((m) => m.isTrained).length;
  const totalTenants = modelStatus.length;
  const totalClosedDeals = accuracy.reduce((sum, a) => sum + a.totalClosed, 0);
  const avgSeparation = accuracy.length > 0
    ? accuracy.reduce((sum, a) => {
        if (a.avgScoreWon !== null && a.avgScoreLost !== null) {
          return sum + (a.avgScoreWon - a.avgScoreLost);
        }
        return sum;
      }, 0) / Math.max(accuracy.filter((a) => a.avgScoreWon !== null && a.avgScoreLost !== null).length, 1)
    : null;

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Forecast &amp; Scoring
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Scoring model status, accuracy &amp; feature importance
      </p>

      {/* Overview */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Models Trained"
          value={`${trainedCount} / ${totalTenants}`}
          subtitle="tenants"
          status={trainedCount > 0 ? "healthy" : "warning"}
        />
        <StatCard
          label="Closed Deals"
          value={totalClosedDeals}
          subtitle="won + lost (training data)"
        />
        <StatCard
          label="Score Separation"
          value={avgSeparation !== null ? avgSeparation.toFixed(2) : "--"}
          subtitle="avg(won) - avg(lost)"
          status={avgSeparation !== null ? (avgSeparation > 0.15 ? "healthy" : avgSeparation > 0 ? "warning" : "critical") : undefined}
        />
        <StatCard
          label="Features Analyzed"
          value={featureImportance.length}
          subtitle="industry, size, revenue, meetings"
        />
      </div>

      {/* Scoring Model Status per Tenant */}
      <h2 className="text-[16px] font-semibold mb-3">Scoring Model Status</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Tenant</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Sample Size</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Last Trained</th>
            </tr>
          </thead>
          <tbody>
            {modelStatus.map((m) => (
              <tr key={m.tenantId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{m.tenantName}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      background: m.isTrained ? "oklch(0.95 0.03 145)" : "var(--color-bg-muted)",
                      color: m.isTrained ? "var(--color-success)" : "var(--color-text-tertiary)",
                    }}
                  >
                    {m.isTrained ? "Trained" : "Not trained"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: m.sampleSize > 100 ? "var(--color-text-primary)" : m.sampleSize > 0 ? "var(--color-warning)" : "var(--color-text-tertiary)" }}>
                    {m.sampleSize}
                  </span>
                </td>
                <td className="px-4 py-3" style={{ color: "var(--color-text-tertiary)" }}>
                  {m.lastTrainedAt ? m.lastTrainedAt.toLocaleDateString() : "--"}
                </td>
              </tr>
            ))}
            {modelStatus.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No tenants yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Model Accuracy */}
      <h2 className="text-[16px] font-semibold mb-3">Model Accuracy</h2>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-text-tertiary)" }}>
        Predicted win probability vs actual outcomes on closed deals
      </p>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Tenant</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Won</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Lost</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Score (Won)</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Score (Lost)</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Separation</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Scored</th>
            </tr>
          </thead>
          <tbody>
            {accuracy.map((a) => {
              const separation = a.avgScoreWon !== null && a.avgScoreLost !== null
                ? a.avgScoreWon - a.avgScoreLost
                : null;
              return (
                <tr key={a.tenantId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium">{a.tenantName}</td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-success)", fontVariantNumeric: "tabular-nums" }}>
                    {a.closedWon}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-danger)", fontVariantNumeric: "tabular-nums" }}>
                    {a.closedLost}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {a.avgScoreWon !== null ? (
                      <span style={{ fontWeight: 600 }}>{a.avgScoreWon.toFixed(2)}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {a.avgScoreLost !== null ? (
                      <span style={{ fontWeight: 600 }}>{a.avgScoreLost.toFixed(2)}</span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {separation !== null ? (
                      <span style={{
                        fontWeight: 600,
                        color: separation > 0.15 ? "var(--color-success)" : separation > 0 ? "var(--color-warning)" : "var(--color-danger)",
                      }}>
                        {separation > 0 ? "+" : ""}{separation.toFixed(2)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>
                    {a.scoredDeals} / {a.totalClosed}
                  </td>
                </tr>
              );
            })}
            {accuracy.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No closed deals to measure accuracy</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Feature Importance */}
      <h2 className="text-[16px] font-semibold mb-3">Feature Importance</h2>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-text-tertiary)" }}>
        Score lift when feature is present vs absent (across all scored companies)
      </p>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Feature</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Coverage</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Score (present)</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Score (absent)</th>
              <th className="px-4 py-3 font-medium" style={{ color: "var(--color-text-tertiary)", width: "20%" }}>Lift</th>
            </tr>
          </thead>
          <tbody>
            {featureImportance.map((f) => (
              <tr key={f.feature} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{f.feature}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums", color: "var(--color-text-tertiary)" }}>
                  {(f.coverage * 100).toFixed(0)}%
                </td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {f.avgScoreWhenPresent !== null ? f.avgScoreWhenPresent.toFixed(2) : "--"}
                </td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {f.avgScoreWhenAbsent !== null ? f.avgScoreWhenAbsent.toFixed(2) : "--"}
                </td>
                <td className="px-4 py-3">
                  {f.lift !== null ? (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(Math.abs(f.lift) * 200, 100)}%`,
                            background: f.lift > 0 ? "var(--color-success)" : "var(--color-danger)",
                          }}
                        />
                      </div>
                      <span
                        className="text-[11px] font-semibold"
                        style={{
                          color: f.lift > 0 ? "var(--color-success)" : "var(--color-danger)",
                          fontVariantNumeric: "tabular-nums",
                          minWidth: 40,
                          textAlign: "right",
                        }}
                      >
                        {f.lift > 0 ? "+" : ""}{f.lift.toFixed(2)}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                  )}
                </td>
              </tr>
            ))}
            {featureImportance.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No scored companies to analyze features</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Forecast Accuracy */}
      <h2 className="text-[16px] font-semibold mb-3">Forecast Accuracy</h2>
      <p className="text-[12px] mb-3" style={{ color: "var(--color-text-tertiary)" }}>
        Predicted revenue (value x score) vs actual closed-won revenue
      </p>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Tenant</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Predicted Revenue</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Actual Revenue</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Accuracy</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Closed Deals</th>
            </tr>
          </thead>
          <tbody>
            {forecastAccuracy.map((f) => (
              <tr key={f.tenantId} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{f.tenantName}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  ${f.predictedRevenue.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  ${f.actualRevenue.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {f.accuracy !== null ? (
                    <span style={{
                      fontWeight: 600,
                      color: f.accuracy >= 0.8 ? "var(--color-success)" : f.accuracy >= 0.5 ? "var(--color-warning)" : "var(--color-danger)",
                    }}>
                      {(f.accuracy * 100).toFixed(0)}%
                    </span>
                  ) : (
                    <span style={{ color: "var(--color-text-tertiary)" }}>--</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right" style={{ color: "var(--color-text-tertiary)" }}>
                  {f.dealCount}
                </td>
              </tr>
            ))}
            {forecastAccuracy.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No closed deals for forecast comparison</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
