import { db, deals, contacts, activities, signalOutcomes, companies } from "../../../lib/db";
import { sql, desc, eq, count, gte, and, isNotNull } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";

export const dynamic = "force-dynamic";

// ─── Predictive Model Status ────────────────────────────────────

async function getScoringModelStatus() {
  // Check if any signal outcomes exist (proxy for "model trained")
  const [outcomes] = await db
    .select({
      totalOutcomes: count(),
      wonOutcomes: sql<number>`count(*) filter (where ${signalOutcomes.outcome} = 'won')`,
      lostOutcomes: sql<number>`count(*) filter (where ${signalOutcomes.outcome} = 'lost')`,
      distinctSignalTypes: sql<number>`count(distinct ${signalOutcomes.signalType})`,
      lastRecordedAt: sql<Date>`max(${signalOutcomes.recordedAt})`,
    })
    .from(signalOutcomes);

  const totalOutcomes = Number(outcomes?.totalOutcomes || 0);
  const wonOutcomes = Number(outcomes?.wonOutcomes || 0);
  const lostOutcomes = Number(outcomes?.lostOutcomes || 0);
  const sampleSize = totalOutcomes;
  const priorWinRate = sampleSize > 0 ? wonOutcomes / sampleSize : 0;

  // Check if enough data for a reliable model (minimum 10 outcomes per signal type)
  const isModelTrained = totalOutcomes >= 10;

  return {
    isModelTrained,
    sampleSize,
    wonOutcomes,
    lostOutcomes,
    priorWinRate,
    distinctSignalTypes: Number(outcomes?.distinctSignalTypes || 0),
    lastTrainedAt: outcomes?.lastRecordedAt || null,
  };
}

// ─── Stall Predictions ──────────────────────────────────────────

async function getStallPredictions() {
  // Deals that are open but haven't had activity in the last 14 days
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const openDeals = await db
    .select({
      id: deals.id,
      name: deals.name,
      stage: deals.stage,
      value: deals.value,
      score: deals.score,
      companyId: deals.companyId,
      updatedAt: deals.updatedAt,
      createdAt: deals.createdAt,
    })
    .from(deals)
    .where(
      and(
        sql`${deals.stage} NOT IN ('won', 'lost')`,
        sql`${deals.deletedAt} IS NULL`
      )
    )
    .orderBy(desc(deals.updatedAt))
    .limit(100);

  // For each deal, check last activity date
  const dealIds = openDeals.map((d) => d.id);
  const lastActivities =
    dealIds.length > 0
      ? await db
          .select({
            entityId: activities.entityId,
            lastActivity: sql<Date>`max(${activities.occurredAt})`,
            activityCount: count(),
          })
          .from(activities)
          .where(
            and(
              eq(activities.entityType, "deal"),
              sql`${activities.entityId} IN ${dealIds}`,
              sql`${activities.deletedAt} IS NULL`
            )
          )
          .groupBy(activities.entityId)
      : [];

  const activityMap = Object.fromEntries(
    lastActivities.map((a) => [a.entityId, { lastActivity: a.lastActivity, count: Number(a.activityCount) }])
  );

  // Get company names for deals
  const companyIds = [...new Set(openDeals.filter((d) => d.companyId).map((d) => d.companyId!))];
  const companyNames =
    companyIds.length > 0
      ? await db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(sql`${companies.id} IN ${companyIds}`)
      : [];
  const companyMap = Object.fromEntries(companyNames.map((c) => [c.id, c.name]));

  // Score stall risk (higher = more at risk)
  const atRiskDeals = openDeals
    .map((deal) => {
      const activity = activityMap[deal.id];
      const lastActivityDate = activity?.lastActivity ? new Date(activity.lastActivity) : null;
      const daysSinceActivity = lastActivityDate
        ? (Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24)
        : 999;
      const isStalled = daysSinceActivity > 14;

      // Simple risk score: based on inactivity, low CRM score, and stage stagnation
      let riskProbability = 0;
      if (daysSinceActivity > 30) riskProbability += 0.4;
      else if (daysSinceActivity > 14) riskProbability += 0.25;
      else if (daysSinceActivity > 7) riskProbability += 0.1;

      if (!activity || activity.count < 3) riskProbability += 0.2;
      if (deal.score != null && Number(deal.score) < 0.4) riskProbability += 0.2;
      if (deal.stage === "lead" || deal.stage === "qualification") riskProbability += 0.1;

      riskProbability = Math.min(riskProbability, 1.0);

      return {
        ...deal,
        companyName: deal.companyId ? companyMap[deal.companyId] || null : null,
        lastActivityDate,
        daysSinceActivity: Math.round(daysSinceActivity),
        activityCount: activity?.count || 0,
        riskProbability,
        isStalled,
      };
    })
    .filter((d) => d.riskProbability > 0.3)
    .sort((a, b) => b.riskProbability - a.riskProbability);

  return {
    totalAtRisk: atRiskDeals.length,
    topAtRisk: atRiskDeals.slice(0, 5),
    totalOpenDeals: openDeals.length,
  };
}

// ─── Win/Loss Analysis Coverage ─────────────────────────────────

async function getWinLossAnalysis() {
  const [closedDeals] = await db
    .select({
      totalClosed: count(),
      wonDeals: sql<number>`count(*) filter (where ${deals.stage} = 'won')`,
      lostDeals: sql<number>`count(*) filter (where ${deals.stage} = 'lost')`,
      withSummary: sql<number>`count(*) filter (where ${deals.summary} is not null and ${deals.summary} != '')`,
      totalValue: sql<number>`coalesce(sum(${deals.value}) filter (where ${deals.stage} = 'won'), 0)`,
      avgDealCycle: sql<number>`avg(extract(epoch from (${deals.updatedAt} - ${deals.createdAt})) / 86400) filter (where ${deals.stage} IN ('won', 'lost'))`,
    })
    .from(deals)
    .where(
      and(
        sql`${deals.stage} IN ('won', 'lost')`,
        sql`${deals.deletedAt} IS NULL`
      )
    );

  const totalClosed = Number(closedDeals?.totalClosed || 0);
  const withSummary = Number(closedDeals?.withSummary || 0);

  return {
    totalClosed,
    wonDeals: Number(closedDeals?.wonDeals || 0),
    lostDeals: Number(closedDeals?.lostDeals || 0),
    withPostMortem: withSummary,
    postMortemCoverage: totalClosed > 0 ? withSummary / totalClosed : 0,
    totalWonValue: Number(closedDeals?.totalValue || 0),
    avgDealCycleDays: Number(closedDeals?.avgDealCycle || 0),
  };
}

// ─── Buyer Intent Distribution ──────────────────────────────────

async function getBuyerIntentDistribution() {
  // Contact scores as proxy for buyer intent
  const scoreBuckets = await db
    .select({
      bucket: sql<string>`CASE
        WHEN ${contacts.score} >= 0.8 THEN 'Very High (0.8-1.0)'
        WHEN ${contacts.score} >= 0.6 THEN 'High (0.6-0.8)'
        WHEN ${contacts.score} >= 0.4 THEN 'Medium (0.4-0.6)'
        WHEN ${contacts.score} >= 0.2 THEN 'Low (0.2-0.4)'
        ELSE 'Very Low (0-0.2)'
      END`,
      count: count(),
      avgScore: sql<number>`avg(${contacts.score})`,
    })
    .from(contacts)
    .where(
      and(
        isNotNull(contacts.score),
        sql`${contacts.deletedAt} IS NULL`
      )
    )
    .groupBy(
      sql`CASE
        WHEN ${contacts.score} >= 0.8 THEN 'Very High (0.8-1.0)'
        WHEN ${contacts.score} >= 0.6 THEN 'High (0.6-0.8)'
        WHEN ${contacts.score} >= 0.4 THEN 'Medium (0.4-0.6)'
        WHEN ${contacts.score} >= 0.2 THEN 'Low (0.2-0.4)'
        ELSE 'Very Low (0-0.2)'
      END`
    )
    .orderBy(sql`avg(${contacts.score}) desc`);

  const [totalContacts] = await db
    .select({
      total: count(),
      scored: sql<number>`count(*) filter (where ${contacts.score} is not null)`,
    })
    .from(contacts)
    .where(sql`${contacts.deletedAt} IS NULL`);

  return {
    buckets: scoreBuckets.map((b) => ({
      bucket: b.bucket as string,
      count: Number(b.count),
      avgScore: Number(b.avgScore || 0),
    })),
    totalContacts: Number(totalContacts?.total || 0),
    scoredContacts: Number(totalContacts?.scored || 0),
  };
}

// ─── Email Intelligence ─────────────────────────────────────────

async function getEmailIntelligence() {
  // Activity-based email thread analysis
  const emailTypes = [
    "email_sent",
    "email_received",
    "email_opened",
    "email_replied",
  ] as const;

  const [emailStats] = await db
    .select({
      totalEmails: count(),
      uniqueThreads: sql<number>`count(distinct ${activities.threadId})`,
      withSentiment: sql<number>`count(*) filter (where ${activities.sentiment} is not null)`,
      positive: sql<number>`count(*) filter (where ${activities.sentiment} = 'positive')`,
      neutral: sql<number>`count(*) filter (where ${activities.sentiment} = 'neutral')`,
      negative: sql<number>`count(*) filter (where ${activities.sentiment} = 'negative')`,
      withIntent: sql<number>`count(*) filter (where array_length(${activities.intent}, 1) > 0)`,
    })
    .from(activities)
    .where(
      and(
        sql`${activities.activityType} IN ('email_sent', 'email_received', 'email_opened', 'email_replied')`,
        sql`${activities.deletedAt} IS NULL`
      )
    );

  // Intent signal distribution (from activities.intent array)
  const intentDistribution = await db.execute(sql`
    SELECT intent_signal, count(*) AS signal_count
    FROM ${activities},
         unnest(${activities.intent}) AS intent_signal
    WHERE ${activities.activityType} IN ('email_sent', 'email_received', 'email_replied')
      AND ${activities.deletedAt} IS NULL
      AND array_length(${activities.intent}, 1) > 0
    GROUP BY intent_signal
    ORDER BY count(*) DESC
    LIMIT 10
  `);

  return {
    totalEmails: Number(emailStats?.totalEmails || 0),
    uniqueThreads: Number(emailStats?.uniqueThreads || 0),
    withSentiment: Number(emailStats?.withSentiment || 0),
    sentimentBreakdown: {
      positive: Number(emailStats?.positive || 0),
      neutral: Number(emailStats?.neutral || 0),
      negative: Number(emailStats?.negative || 0),
    },
    withIntent: Number(emailStats?.withIntent || 0),
    intentSignals: (intentDistribution as unknown as Array<{ intent_signal: string; signal_count: number }>).map(
      (r) => ({
        signal: String(r.intent_signal),
        count: Number(r.signal_count),
      })
    ),
  };
}

export default async function IntelligencePage() {
  const [model, stalls, winLoss, intent, emailIntel] = await Promise.all([
    getScoringModelStatus(),
    getStallPredictions(),
    getWinLossAnalysis(),
    getBuyerIntentDistribution(),
    getEmailIntelligence(),
  ]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Deal Intelligence
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Predictive scoring, stall detection, win/loss analysis &middot; Signal-driven deal coaching
      </p>

      {/* Predictive Model Status */}
      <h2 className="text-[16px] font-semibold mb-3">Predictive Model Status</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Model Status"
          value={model.isModelTrained ? "Trained" : "Insufficient Data"}
          status={model.isModelTrained ? "healthy" : "warning"}
          subtitle={model.isModelTrained ? `${model.distinctSignalTypes} signal types` : "Need 10+ outcomes"}
        />
        <StatCard
          label="Training Sample Size"
          value={model.sampleSize}
          subtitle={`${model.wonOutcomes} won / ${model.lostOutcomes} lost`}
        />
        <StatCard
          label="Prior Win Rate"
          value={model.sampleSize > 0 ? `${(model.priorWinRate * 100).toFixed(1)}%` : "--"}
          status={model.priorWinRate > 0.3 ? "healthy" : model.priorWinRate > 0 ? "warning" : undefined}
        />
        <StatCard
          label="Last Trained"
          value={
            model.lastTrainedAt
              ? new Date(model.lastTrainedAt).toLocaleDateString()
              : "Never"
          }
          subtitle={
            model.lastTrainedAt
              ? `${Math.round(
                  (Date.now() - new Date(model.lastTrainedAt).getTime()) / (1000 * 60 * 60 * 24)
                )} days ago`
              : "No outcome data"
          }
        />
      </div>

      {/* Stall Predictions */}
      <h2 className="text-[16px] font-semibold mb-3">Stall Predictions</h2>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <StatCard
          label="Deals At Risk"
          value={stalls.totalAtRisk}
          status={stalls.totalAtRisk > 5 ? "critical" : stalls.totalAtRisk > 0 ? "warning" : "healthy"}
          subtitle={`of ${stalls.totalOpenDeals} open deals`}
        />
        <StatCard
          label="Open Pipeline"
          value={stalls.totalOpenDeals}
          subtitle="Active deals in pipeline"
        />
        <StatCard
          label="Risk Rate"
          value={
            stalls.totalOpenDeals > 0
              ? `${((stalls.totalAtRisk / stalls.totalOpenDeals) * 100).toFixed(0)}%`
              : "--"
          }
          status={
            stalls.totalOpenDeals > 0 && stalls.totalAtRisk / stalls.totalOpenDeals > 0.3
              ? "critical"
              : "healthy"
          }
        />
      </div>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Deal</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Company</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Stage</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Value</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Days Inactive</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Risk</th>
            </tr>
          </thead>
          <tbody>
            {stalls.topAtRisk.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No deals flagged at-risk. Pipeline is healthy.
                </td>
              </tr>
            ) : (
              stalls.topAtRisk.map((deal) => (
                <tr key={deal.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <td className="px-4 py-3 font-medium max-w-[200px] truncate">{deal.name}</td>
                  <td className="px-4 py-3" style={{ color: "var(--color-text-secondary)" }}>
                    {deal.companyName || "--"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="rounded-md px-2 py-0.5 text-[11px] font-medium capitalize"
                      style={{ background: "var(--color-bg-muted)", color: "var(--color-text-secondary)" }}
                    >
                      {deal.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {deal.value ? `$${deal.value.toLocaleString()}` : "--"}
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <span
                      style={{
                        color: deal.daysSinceActivity > 30 ? "var(--color-danger)" : "var(--color-warning)",
                        fontWeight: 600,
                      }}
                    >
                      {deal.daysSinceActivity < 999 ? `${deal.daysSinceActivity}d` : "Never"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                    <RiskBar probability={deal.riskProbability} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Win/Loss Analysis */}
      <h2 className="text-[16px] font-semibold mb-3">Win/Loss Analysis</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Closed Deals"
          value={winLoss.totalClosed}
          subtitle={`${winLoss.wonDeals} won / ${winLoss.lostDeals} lost`}
        />
        <StatCard
          label="Win Rate"
          value={
            winLoss.totalClosed > 0
              ? `${((winLoss.wonDeals / winLoss.totalClosed) * 100).toFixed(0)}%`
              : "--"
          }
          status={
            winLoss.totalClosed > 0 && winLoss.wonDeals / winLoss.totalClosed > 0.3
              ? "healthy"
              : "warning"
          }
        />
        <StatCard
          label="Post-Mortem Coverage"
          value={`${(winLoss.postMortemCoverage * 100).toFixed(0)}%`}
          status={winLoss.postMortemCoverage > 0.7 ? "healthy" : winLoss.postMortemCoverage > 0.3 ? "warning" : "critical"}
          subtitle={`${winLoss.withPostMortem} of ${winLoss.totalClosed} deals`}
        />
        <StatCard
          label="Avg Deal Cycle"
          value={winLoss.avgDealCycleDays > 0 ? `${Math.round(winLoss.avgDealCycleDays)}d` : "--"}
          subtitle={winLoss.totalWonValue > 0 ? `$${winLoss.totalWonValue.toLocaleString()} total won` : "No won deals"}
        />
      </div>

      {/* Buyer Intent Distribution */}
      <h2 className="text-[16px] font-semibold mb-3">Buyer Intent Distribution</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div
          className="rounded-xl p-4"
          style={{
            border: "1px solid var(--color-border-default)",
            background: "var(--color-bg-card)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="text-[13px] font-semibold mb-3">
            Contact Scores ({intent.scoredContacts} of {intent.totalContacts} scored)
          </div>
          {intent.buckets.length === 0 ? (
            <div className="py-4 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              No scored contacts yet
            </div>
          ) : (
            <div className="space-y-2.5">
              {intent.buckets.map((bucket) => {
                const maxCount = Math.max(...intent.buckets.map((b) => b.count), 1);
                const pct = bucket.count / maxCount;
                const barColor =
                  bucket.avgScore >= 0.7
                    ? "var(--color-success)"
                    : bucket.avgScore >= 0.4
                      ? "var(--color-warning)"
                      : "var(--color-text-tertiary)";
                return (
                  <div key={bucket.bucket}>
                    <div className="flex justify-between text-[12px] mb-1">
                      <span style={{ color: "var(--color-text-secondary)" }}>{bucket.bucket}</span>
                      <span style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                        {bucket.count}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.max(pct * 100, 2)}%`,
                          background: barColor,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Email Intelligence Summary */}
        <div
          className="rounded-xl p-4"
          style={{
            border: "1px solid var(--color-border-default)",
            background: "var(--color-bg-card)",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div className="text-[13px] font-semibold mb-3">
            Email Sentiment ({emailIntel.withSentiment} analyzed)
          </div>
          {emailIntel.totalEmails === 0 ? (
            <div className="py-4 text-center text-[12px]" style={{ color: "var(--color-text-tertiary)" }}>
              No email activity data yet
            </div>
          ) : (
            <>
              <div className="space-y-2.5 mb-4">
                <SentimentBar
                  label="Positive"
                  count={emailIntel.sentimentBreakdown.positive}
                  total={emailIntel.withSentiment}
                  color="var(--color-success)"
                />
                <SentimentBar
                  label="Neutral"
                  count={emailIntel.sentimentBreakdown.neutral}
                  total={emailIntel.withSentiment}
                  color="var(--color-text-tertiary)"
                />
                <SentimentBar
                  label="Negative"
                  count={emailIntel.sentimentBreakdown.negative}
                  total={emailIntel.withSentiment}
                  color="var(--color-danger)"
                />
              </div>
              <div className="pt-3" style={{ borderTop: "1px solid var(--color-border-default)" }}>
                <div className="grid grid-cols-2 gap-3 text-[12px]">
                  <div>
                    <span style={{ color: "var(--color-text-tertiary)" }}>Total emails</span>
                    <div className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {emailIntel.totalEmails.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <span style={{ color: "var(--color-text-tertiary)" }}>Unique threads</span>
                    <div className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {emailIntel.uniqueThreads.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Email Intent Signals */}
      <h2 className="text-[16px] font-semibold mb-3">Email Intelligence Signals</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{
          border: "1px solid var(--color-border-default)",
          background: "var(--color-bg-card)",
          boxShadow: "var(--shadow-card)",
        }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Signal</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Occurrences</th>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Distribution</th>
            </tr>
          </thead>
          <tbody>
            {emailIntel.intentSignals.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>
                  No intent signals detected yet. Email analysis will populate this as threads are processed.
                </td>
              </tr>
            ) : (
              emailIntel.intentSignals.map((signal) => {
                const maxSignal = emailIntel.intentSignals[0]?.count || 1;
                const pct = signal.count / maxSignal;
                return (
                  <tr key={signal.signal} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                    <td className="px-4 py-3 font-medium capitalize">
                      {signal.signal.replace(/_/g, " ")}
                    </td>
                    <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {signal.count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="h-1.5 rounded-full overflow-hidden w-full max-w-[200px]" style={{ background: "var(--color-bg-muted)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(pct * 100, 3)}%`,
                            background: "var(--color-accent)",
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RiskBar({ probability }: { probability: number }) {
  const pct = probability * 100;
  const color =
    probability >= 0.7
      ? "var(--color-danger)"
      : probability >= 0.5
        ? "var(--color-warning)"
        : "var(--color-text-tertiary)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="text-[11px] font-medium" style={{ color, fontVariantNumeric: "tabular-nums" }}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

function SentimentBar({
  label,
  count,
  total,
  color,
}: {
  label: string;
  count: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? count / total : 0;
  return (
    <div>
      <div className="flex justify-between text-[12px] mb-1">
        <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {count} ({total > 0 ? `${(pct * 100).toFixed(0)}%` : "0%"})
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${Math.max(pct * 100, 1)}%`, background: color }}
        />
      </div>
    </div>
  );
}
