import { db, pipelineEvents, companies } from "../../../lib/db";
import { sql, desc, gte, eq, count, and } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";

export const dynamic = "force-dynamic";

const STAGE_ORDER = [
  "enriched",
  "signal_detected",
  "enrolled",
  "email_generated",
  "email_queued",
  "email_sent",
  "email_delivered",
  "email_opened",
  "email_clicked",
  "email_replied",
  "email_bounced",
  "meeting_booked",
  "deal_created",
  "deal_won",
  "deal_lost",
] as const;

const STAGE_LABELS: Record<string, string> = {
  enriched: "Enriched",
  signal_detected: "Signal Detected",
  enrolled: "Enrolled",
  email_generated: "Email Generated",
  email_queued: "Email Queued",
  email_sent: "Email Sent",
  email_delivered: "Delivered",
  email_opened: "Opened",
  email_clicked: "Clicked",
  email_replied: "Replied",
  email_bounced: "Bounced",
  meeting_booked: "Meeting Booked",
  deal_created: "Deal Created",
  deal_won: "Deal Won",
  deal_lost: "Deal Lost",
};

const STAGE_COLORS: Record<string, string> = {
  enriched: "#6366f1",
  signal_detected: "#8b5cf6",
  enrolled: "#a855f7",
  email_generated: "#3b82f6",
  email_queued: "#60a5fa",
  email_sent: "#2563eb",
  email_delivered: "#16a34a",
  email_opened: "#22c55e",
  email_clicked: "#15803d",
  email_replied: "#059669",
  email_bounced: "#dc2626",
  meeting_booked: "#d97706",
  deal_created: "#ea580c",
  deal_won: "#16a34a",
  deal_lost: "#dc2626",
};

async function getFunnelData(since: Date) {
  const rows = await db
    .select({
      stage: pipelineEvents.stage,
      count: count(),
    })
    .from(pipelineEvents)
    .where(gte(pipelineEvents.createdAt, since))
    .groupBy(pipelineEvents.stage);

  const map = new Map(rows.map((r) => [r.stage, Number(r.count)]));
  return STAGE_ORDER.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    count: map.get(stage) || 0,
    color: STAGE_COLORS[stage],
  }));
}

async function getThroughputTimeline(since: Date) {
  const rows = await db
    .select({
      hour: sql<string>`to_char(date_trunc('hour', ${pipelineEvents.createdAt}), 'HH24:MI')`,
      count: count(),
    })
    .from(pipelineEvents)
    .where(gte(pipelineEvents.createdAt, since))
    .groupBy(sql`date_trunc('hour', ${pipelineEvents.createdAt})`)
    .orderBy(sql`date_trunc('hour', ${pipelineEvents.createdAt})`);

  return rows.map((r) => ({
    hour: r.hour,
    count: Number(r.count),
  }));
}

async function getStuckItems() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (COALESCE(company_id, contact_id, trace_id))
        id, trace_id, company_id, contact_id, stage, source_system,
        metadata, created_at, tenant_id
      FROM pipeline_events
      WHERE stage NOT IN ('deal_won', 'deal_lost', 'email_bounced', 'email_replied')
        AND created_at >= ${sevenDaysAgo}
      ORDER BY COALESCE(company_id, contact_id, trace_id), created_at DESC
    )
    SELECT
      l.trace_id,
      l.company_id,
      l.contact_id,
      l.stage,
      l.source_system,
      l.metadata,
      l.created_at,
      c.name as company_name,
      EXTRACT(EPOCH FROM (NOW() - l.created_at)) / 3600 as hours_stuck
    FROM latest l
    LEFT JOIN companies c ON c.id = l.company_id
    WHERE l.created_at < ${twoHoursAgo}
    ORDER BY l.created_at ASC
    LIMIT 20
  `);

  return rows as unknown as Array<{
    trace_id: string;
    company_id: string | null;
    contact_id: string | null;
    stage: string;
    source_system: string;
    metadata: Record<string, unknown>;
    created_at: Date;
    company_name: string | null;
    hours_stuck: number;
  }>;
}

async function getAttribution(since: Date) {
  const rows = await db.execute(sql`
    WITH signals AS (
      SELECT company_id, metadata->>'signalType' as signal_type
      FROM pipeline_events
      WHERE stage = 'signal_detected'
        AND company_id IS NOT NULL
        AND created_at >= ${since}
    ),
    enrolled AS (
      SELECT DISTINCT company_id, enrollment_id
      FROM pipeline_events
      WHERE stage = 'enrolled' AND company_id IS NOT NULL
    ),
    email_chain AS (
      SELECT enrollment_id, stage
      FROM pipeline_events
      WHERE enrollment_id IS NOT NULL
        AND stage IN ('email_sent', 'email_delivered', 'email_opened', 'email_replied')
    )
    SELECT
      s.signal_type,
      COUNT(DISTINCT s.company_id) as signals,
      COUNT(DISTINCT en.enrollment_id) as enrollments,
      COUNT(DISTINCT ec_sent.enrollment_id) FILTER (WHERE ec_sent.enrollment_id IS NOT NULL) as emails_sent,
      COUNT(DISTINCT ec_del.enrollment_id) FILTER (WHERE ec_del.enrollment_id IS NOT NULL) as delivered,
      COUNT(DISTINCT ec_open.enrollment_id) FILTER (WHERE ec_open.enrollment_id IS NOT NULL) as opened,
      COUNT(DISTINCT ec_reply.enrollment_id) FILTER (WHERE ec_reply.enrollment_id IS NOT NULL) as replied,
      0 as deals
    FROM signals s
    LEFT JOIN enrolled en ON en.company_id = s.company_id
    LEFT JOIN email_chain ec_sent ON ec_sent.enrollment_id = en.enrollment_id AND ec_sent.stage = 'email_sent'
    LEFT JOIN email_chain ec_del ON ec_del.enrollment_id = en.enrollment_id AND ec_del.stage = 'email_delivered'
    LEFT JOIN email_chain ec_open ON ec_open.enrollment_id = en.enrollment_id AND ec_open.stage = 'email_opened'
    LEFT JOIN email_chain ec_reply ON ec_reply.enrollment_id = en.enrollment_id AND ec_reply.stage = 'email_replied'
    GROUP BY s.signal_type
    ORDER BY signals DESC
    LIMIT 15
  `);

  return rows as unknown as Array<{
    signal_type: string;
    signals: number;
    enrollments: number;
    emails_sent: number;
    delivered: number;
    opened: number;
    replied: number;
    deals: number;
  }>;
}

async function getRecentEvents() {
  const rows = await db
    .select({
      id: pipelineEvents.id,
      traceId: pipelineEvents.traceId,
      stage: pipelineEvents.stage,
      sourceSystem: pipelineEvents.sourceSystem,
      companyId: pipelineEvents.companyId,
      contactId: pipelineEvents.contactId,
      metadata: pipelineEvents.metadata,
      createdAt: pipelineEvents.createdAt,
    })
    .from(pipelineEvents)
    .orderBy(desc(pipelineEvents.createdAt))
    .limit(30);

  return rows;
}

async function getSystemBreakdown(since: Date) {
  const rows = await db
    .select({
      sourceSystem: pipelineEvents.sourceSystem,
      count: count(),
    })
    .from(pipelineEvents)
    .where(gte(pipelineEvents.createdAt, since))
    .groupBy(pipelineEvents.sourceSystem);

  return rows.map((r) => ({
    system: r.sourceSystem,
    count: Number(r.count),
  }));
}

export default async function PipelinePage() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [funnel, timeline, stuck, attribution, recent, systems] =
    await Promise.all([
      getFunnelData(since24h),
      getThroughputTimeline(since24h),
      getStuckItems(),
      getAttribution(since30d),
      getRecentEvents(),
      getSystemBreakdown(since24h),
    ]);

  const totalEvents = funnel.reduce((s, f) => s + f.count, 0);
  const throughputAvg =
    timeline.length > 0
      ? Math.round(
          timeline.reduce((s, t) => s + t.count, 0) / timeline.length,
        )
      : 0;

  const signalCount = funnel.find((f) => f.stage === "signal_detected")?.count || 0;
  const replyCount = funnel.find((f) => f.stage === "email_replied")?.count || 0;
  const conversionRate = signalCount > 0 ? ((replyCount / signalCount) * 100).toFixed(1) : "0.0";

  const funnelMax = Math.max(...funnel.map((f) => f.count), 1);
  const timelineMax = Math.max(...timeline.map((t) => t.count), 1);

  return (
    <div>
      <h1
        className="text-[22px] font-semibold"
        style={{ color: "var(--color-text-primary)", letterSpacing: "-0.02em" }}
      >
        Pipeline Observatory
      </h1>
      <p
        className="mt-1 text-[13px]"
        style={{ color: "var(--color-text-tertiary)" }}
      >
        End-to-end attribution across Inngest + BullMQ + Webhooks
      </p>

      {/* Overview Stats */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard
          label="Events (24h)"
          value={totalEvents.toLocaleString()}
          status={totalEvents > 0 ? "healthy" : "warning"}
        />
        <StatCard
          label="Throughput"
          value={`${throughputAvg}/hr`}
          subtitle="avg events per hour"
          status={throughputAvg > 0 ? "healthy" : "warning"}
        />
        <StatCard
          label="Signal to Reply"
          value={`${conversionRate}%`}
          subtitle={`${replyCount} replies / ${signalCount} signals`}
          status={
            Number(conversionRate) > 5
              ? "healthy"
              : Number(conversionRate) > 0
                ? "warning"
                : "critical"
          }
        />
        <StatCard
          label="Stuck Items"
          value={stuck.length}
          subtitle="blocked >2h"
          status={
            stuck.length === 0
              ? "healthy"
              : stuck.length <= 3
                ? "warning"
                : "critical"
          }
        />
      </div>

      {/* Funnel */}
      <h2
        className="mt-8 text-[16px] font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Pipeline Funnel (24h)
      </h2>
      <div
        className="mt-3 rounded-xl p-4"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        {funnel.filter((f) => f.count > 0).length === 0 ? (
          <p
            className="py-8 text-center text-[13px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            No pipeline events yet. Events will appear as the pipeline processes data.
          </p>
        ) : (
          <div className="space-y-2">
            {funnel
              .filter((f) => f.count > 0)
              .map((f, i, arr) => {
                const prevCount = i > 0 ? arr[i - 1].count : null;
                const conversion =
                  prevCount && prevCount > 0
                    ? ((f.count / prevCount) * 100).toFixed(0)
                    : null;
                return (
                  <div key={f.stage} className="flex items-center gap-3">
                    <div
                      className="w-28 shrink-0 text-right text-[12px] font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {f.label}
                    </div>
                    <div className="flex-1">
                      <div
                        className="h-6 rounded"
                        style={{
                          width: `${Math.max((f.count / funnelMax) * 100, 2)}%`,
                          background: f.color,
                          transition: "width 0.3s",
                        }}
                      />
                    </div>
                    <div
                      className="w-16 shrink-0 text-right text-[13px] font-semibold tabular-nums"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {f.count.toLocaleString()}
                    </div>
                    <div
                      className="w-12 shrink-0 text-right text-[11px] tabular-nums"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {conversion ? `${conversion}%` : ""}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-2 gap-6">
        {/* Throughput Timeline */}
        <div>
          <h2
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Throughput (24h)
          </h2>
          <div
            className="mt-3 rounded-xl p-4"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {timeline.length === 0 ? (
              <p
                className="py-6 text-center text-[13px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                No data yet
              </p>
            ) : (
              <div className="flex h-32 items-end gap-1">
                {timeline.map((t) => (
                  <div
                    key={t.hour}
                    className="flex-1 rounded-t"
                    title={`${t.hour}: ${t.count} events`}
                    style={{
                      height: `${Math.max((t.count / timelineMax) * 100, 4)}%`,
                      background: "var(--color-accent)",
                      opacity: 0.8,
                      minWidth: 4,
                    }}
                  />
                ))}
              </div>
            )}
            <div
              className="mt-2 flex justify-between text-[11px]"
              style={{ color: "var(--color-text-tertiary)" }}
            >
              <span>{timeline[0]?.hour || ""}</span>
              <span>{timeline[timeline.length - 1]?.hour || ""}</span>
            </div>
          </div>
        </div>

        {/* Source Systems */}
        <div>
          <h2
            className="text-[16px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Source Systems (24h)
          </h2>
          <div
            className="mt-3 rounded-xl p-4"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            {systems.length === 0 ? (
              <p
                className="py-6 text-center text-[13px]"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                No data yet
              </p>
            ) : (
              <div className="space-y-3">
                {systems
                  .sort((a, b) => b.count - a.count)
                  .map((s) => {
                    const total = systems.reduce((sum, x) => sum + x.count, 0);
                    const pct = total > 0 ? ((s.count / total) * 100).toFixed(0) : "0";
                    const systemColors: Record<string, string> = {
                      inngest: "#6366f1",
                      bullmq: "#f59e0b",
                      webhook: "#22c55e",
                      cron: "#64748b",
                      api: "#3b82f6",
                    };
                    return (
                      <div key={s.system}>
                        <div className="mb-1 flex justify-between">
                          <span
                            className="text-[12px] font-medium"
                            style={{ color: "var(--color-text-secondary)" }}
                          >
                            {s.system}
                          </span>
                          <span
                            className="text-[12px] tabular-nums"
                            style={{ color: "var(--color-text-tertiary)" }}
                          >
                            {s.count} ({pct}%)
                          </span>
                        </div>
                        <div
                          className="h-2 rounded-full"
                          style={{ background: "var(--color-bg-muted)" }}
                        >
                          <div
                            className="h-2 rounded-full"
                            style={{
                              width: `${Number(pct)}%`,
                              background:
                                systemColors[s.system] || "var(--color-accent)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stuck Items */}
      {stuck.length > 0 && (
        <>
          <h2
            className="mt-8 text-[16px] font-semibold"
            style={{ color: "var(--color-text-primary)" }}
          >
            Stuck Items
          </h2>
          <div
            className="mt-3 overflow-hidden rounded-xl"
            style={{
              background: "var(--color-bg-card)",
              border: "1px solid var(--color-border-default)",
            }}
          >
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                  <th
                    className="px-4 py-2.5 text-left font-medium"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Entity
                  </th>
                  <th
                    className="px-4 py-2.5 text-left font-medium"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Stage
                  </th>
                  <th
                    className="px-4 py-2.5 text-left font-medium"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Source
                  </th>
                  <th
                    className="px-4 py-2.5 text-right font-medium"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Stuck
                  </th>
                  <th
                    className="px-4 py-2.5 text-right font-medium"
                    style={{ color: "var(--color-text-tertiary)" }}
                  >
                    Severity
                  </th>
                </tr>
              </thead>
              <tbody>
                {stuck.map((item) => {
                  const hours = Number(item.hours_stuck);
                  const severity: "healthy" | "warning" | "critical" =
                    hours > 6 ? "critical" : "warning";
                  const severityColors = {
                    warning: "var(--color-warning)",
                    critical: "var(--color-danger)",
                    healthy: "var(--color-success)",
                  };
                  return (
                    <tr
                      key={item.trace_id}
                      style={{
                        borderBottom: "1px solid var(--color-border-default)",
                      }}
                    >
                      <td className="px-4 py-2.5" style={{ color: "var(--color-text-primary)" }}>
                        {item.company_name || item.contact_id?.slice(0, 8) || item.trace_id.slice(0, 8)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="rounded px-2 py-0.5 text-[11px] font-medium"
                          style={{
                            background: STAGE_COLORS[item.stage] + "18",
                            color: STAGE_COLORS[item.stage],
                          }}
                        >
                          {STAGE_LABELS[item.stage] || item.stage}
                        </span>
                      </td>
                      <td
                        className="px-4 py-2.5 text-[12px]"
                        style={{ color: "var(--color-text-tertiary)" }}
                      >
                        {item.source_system}
                      </td>
                      <td
                        className="px-4 py-2.5 text-right tabular-nums"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {hours.toFixed(1)}h
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: severityColors[severity] }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Signal Attribution */}
      <h2
        className="mt-8 text-[16px] font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Signal Attribution (30d)
      </h2>
      <div
        className="mt-3 overflow-hidden rounded-xl"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        {attribution.length === 0 ? (
          <p
            className="py-8 text-center text-[13px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            No signal attribution data yet. Signals need to flow through the full
            pipeline to generate attribution.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Signal Type
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Signals
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Enrolled
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Sent
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Delivered
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Opened
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Replied
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Deals
                </th>
                <th
                  className="px-4 py-2.5 text-right font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Conv.
                </th>
              </tr>
            </thead>
            <tbody>
              {attribution.map((a) => {
                const conv =
                  Number(a.signals) > 0
                    ? ((Number(a.replied) / Number(a.signals)) * 100).toFixed(1)
                    : "0.0";
                return (
                  <tr
                    key={a.signal_type}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                  >
                    <td
                      className="px-4 py-2.5 font-medium"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {a.signal_type || "unknown"}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{ color: "var(--color-text-primary)" }}
                    >
                      {Number(a.signals)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {Number(a.enrollments)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {Number(a.emails_sent)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {Number(a.delivered)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {Number(a.opened)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{
                        color:
                          Number(a.replied) > 0
                            ? "var(--color-success)"
                            : "var(--color-text-secondary)",
                      }}
                    >
                      {Number(a.replied)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{
                        color:
                          Number(a.deals) > 0
                            ? "var(--color-success)"
                            : "var(--color-text-secondary)",
                      }}
                    >
                      {Number(a.deals)}
                    </td>
                    <td
                      className="px-4 py-2.5 text-right tabular-nums"
                      style={{
                        color:
                          Number(conv) > 5
                            ? "var(--color-success)"
                            : "var(--color-text-tertiary)",
                      }}
                    >
                      {conv}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Recent Events */}
      <h2
        className="mt-8 text-[16px] font-semibold"
        style={{ color: "var(--color-text-primary)" }}
      >
        Recent Events
      </h2>
      <div
        className="mt-3 overflow-hidden rounded-xl"
        style={{
          background: "var(--color-bg-card)",
          border: "1px solid var(--color-border-default)",
        }}
      >
        {recent.length === 0 ? (
          <p
            className="py-8 text-center text-[13px]"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            No events recorded yet. Pipeline events will appear as data flows
            through the system.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Time
                </th>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Stage
                </th>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Source
                </th>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Trace
                </th>
                <th
                  className="px-4 py-2.5 text-left font-medium"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  Details
                </th>
              </tr>
            </thead>
            <tbody>
              {recent.map((e) => {
                const meta = (e.metadata || {}) as Record<string, unknown>;
                const detail = Object.entries(meta)
                  .slice(0, 2)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ");
                const timeAgo = getTimeAgo(e.createdAt);
                return (
                  <tr
                    key={e.id}
                    style={{
                      borderBottom: "1px solid var(--color-border-default)",
                    }}
                  >
                    <td
                      className="px-4 py-2 text-[12px] tabular-nums"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {timeAgo}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="rounded px-2 py-0.5 text-[11px] font-medium"
                        style={{
                          background: (STAGE_COLORS[e.stage] || "#888") + "18",
                          color: STAGE_COLORS[e.stage] || "#888",
                        }}
                      >
                        {STAGE_LABELS[e.stage] || e.stage}
                      </span>
                    </td>
                    <td
                      className="px-4 py-2 text-[12px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {e.sourceSystem}
                    </td>
                    <td
                      className="px-4 py-2 font-mono text-[11px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {e.traceId.slice(0, 12)}
                    </td>
                    <td
                      className="max-w-48 truncate px-4 py-2 text-[12px]"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      {detail || "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
