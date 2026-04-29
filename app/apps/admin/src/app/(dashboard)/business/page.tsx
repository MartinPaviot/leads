import { db, companies, contacts, deals, activities, outboundEmails, sequences, connectedMailboxes } from "../../../lib/db";
import { sql, count, eq, gte, and } from "drizzle-orm";
import { StatCard } from "../../../components/stat-card";

export const dynamic = "force-dynamic";

async function getEmailMetrics(since: Date) {
  const [metrics] = await db
    .select({
      totalSent: sql<number>`count(*) filter (where ${outboundEmails.status} in ('sent', 'delivered'))`,
      totalBounced: sql<number>`count(*) filter (where ${outboundEmails.status} = 'bounced')`,
      totalOpened: sql<number>`count(*) filter (where ${outboundEmails.openedAt} is not null)`,
      totalReplied: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
      totalDraft: sql<number>`count(*) filter (where ${outboundEmails.status} = 'draft')`,
      totalQueued: sql<number>`count(*) filter (where ${outboundEmails.status} = 'queued')`,
      totalFailed: sql<number>`count(*) filter (where ${outboundEmails.status} = 'failed')`,
    })
    .from(outboundEmails)
    .where(gte(outboundEmails.createdAt, since));

  const sent = Number(metrics?.totalSent || 0);
  return {
    sent,
    bounced: Number(metrics?.totalBounced || 0),
    opened: Number(metrics?.totalOpened || 0),
    replied: Number(metrics?.totalReplied || 0),
    draft: Number(metrics?.totalDraft || 0),
    queued: Number(metrics?.totalQueued || 0),
    failed: Number(metrics?.totalFailed || 0),
    openRate: sent > 0 ? Number(metrics?.totalOpened || 0) / sent : 0,
    replyRate: sent > 0 ? Number(metrics?.totalReplied || 0) / sent : 0,
    bounceRate: sent > 0 ? Number(metrics?.totalBounced || 0) / sent : 0,
  };
}

async function getEnrichmentCoverage() {
  const [companyStats] = await db
    .select({
      total: count(),
      withIndustry: sql<number>`count(*) filter (where ${companies.industry} is not null)`,
      withSize: sql<number>`count(*) filter (where ${companies.size} is not null)`,
      withScore: sql<number>`count(*) filter (where ${companies.score} is not null)`,
      withRevenue: sql<number>`count(*) filter (where ${companies.revenue} is not null)`,
    })
    .from(companies);

  const [contactStats] = await db
    .select({
      total: count(),
      withEmail: sql<number>`count(*) filter (where ${contacts.email} is not null)`,
      withTitle: sql<number>`count(*) filter (where ${contacts.title} is not null)`,
      withScore: sql<number>`count(*) filter (where ${contacts.score} is not null)`,
    })
    .from(contacts);

  const companyTotal = Number(companyStats?.total || 0);
  const contactTotal = Number(contactStats?.total || 0);

  return {
    companies: {
      total: companyTotal,
      industryPct: companyTotal > 0 ? Number(companyStats?.withIndustry || 0) / companyTotal : 0,
      sizePct: companyTotal > 0 ? Number(companyStats?.withSize || 0) / companyTotal : 0,
      scorePct: companyTotal > 0 ? Number(companyStats?.withScore || 0) / companyTotal : 0,
      revenuePct: companyTotal > 0 ? Number(companyStats?.withRevenue || 0) / companyTotal : 0,
    },
    contacts: {
      total: contactTotal,
      emailPct: contactTotal > 0 ? Number(contactStats?.withEmail || 0) / contactTotal : 0,
      titlePct: contactTotal > 0 ? Number(contactStats?.withTitle || 0) / contactTotal : 0,
      scorePct: contactTotal > 0 ? Number(contactStats?.withScore || 0) / contactTotal : 0,
    },
  };
}

async function getTAMBreakdown() {
  const byIndustry = await db
    .select({
      industry: companies.industry,
      count: count(),
      avgScore: sql<number>`avg(${companies.score})`,
    })
    .from(companies)
    .where(sql`${companies.industry} is not null`)
    .groupBy(companies.industry)
    .orderBy(sql`count(*) desc`)
    .limit(10);

  const bySize = await db
    .select({
      size: companies.size,
      count: count(),
    })
    .from(companies)
    .where(sql`${companies.size} is not null`)
    .groupBy(companies.size)
    .orderBy(sql`count(*) desc`);

  return { byIndustry, bySize };
}

async function getCampaignMetrics() {
  const campaigns = await db
    .select({
      id: sequences.id,
      name: sequences.name,
      status: sequences.status,
    })
    .from(sequences)
    .orderBy(sql`${sequences.createdAt} desc`)
    .limit(10);

  return campaigns;
}

async function getPipelineStats() {
  const stages = await db
    .select({
      stage: deals.stage,
      count: count(),
      totalValue: sql<number>`coalesce(sum(${deals.value}), 0)`,
    })
    .from(deals)
    .groupBy(deals.stage)
    .orderBy(sql`count(*) desc`);

  return stages;
}

export default async function BusinessPage() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days
  const [email, enrichment, tam, campaigns, pipeline] = await Promise.all([
    getEmailMetrics(since),
    getEnrichmentCoverage(),
    getTAMBreakdown(),
    getCampaignMetrics(),
    getPipelineStats(),
  ]);

  return (
    <div className="max-w-6xl">
      <h1 className="text-[22px] font-semibold mb-1" style={{ letterSpacing: "-0.02em" }}>
        Business Intelligence
      </h1>
      <p className="text-[13px] mb-6" style={{ color: "var(--color-text-tertiary)" }}>
        Email, pipeline, enrichment &amp; TAM metrics &middot; Last 30 days
      </p>

      {/* Email deliverability */}
      <h2 className="text-[16px] font-semibold mb-3">Email Deliverability</h2>
      <div className="grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Emails Sent" value={email.sent} />
        <StatCard label="Open Rate" value={`${(email.openRate * 100).toFixed(1)}%`} status={email.openRate > 0.3 ? "healthy" : email.openRate > 0.15 ? "warning" : "critical"} />
        <StatCard label="Reply Rate" value={`${(email.replyRate * 100).toFixed(1)}%`} status={email.replyRate > 0.05 ? "healthy" : "warning"} />
        <StatCard label="Bounce Rate" value={`${(email.bounceRate * 100).toFixed(1)}%`} status={email.bounceRate < 0.03 ? "healthy" : email.bounceRate < 0.08 ? "warning" : "critical"} />
      </div>

      {/* Pipeline */}
      <h2 className="text-[16px] font-semibold mb-3">Pipeline</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Stage</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Deals</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Total Value</th>
            </tr>
          </thead>
          <tbody>
            {pipeline.map((s) => (
              <tr key={s.stage} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium capitalize">{s.stage}</td>
                <td className="px-4 py-3 text-right">{Number(s.count)}</td>
                <td className="px-4 py-3 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>${Number(s.totalValue).toLocaleString()}</td>
              </tr>
            ))}
            {pipeline.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No deals yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Enrichment Coverage */}
      <h2 className="text-[16px] font-semibold mb-3">Enrichment Coverage</h2>
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl p-4" style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
          <h3 className="text-[13px] font-semibold mb-3">Companies ({enrichment.companies.total})</h3>
          <CoverageBar label="Industry" pct={enrichment.companies.industryPct} />
          <CoverageBar label="Size" pct={enrichment.companies.sizePct} />
          <CoverageBar label="Score" pct={enrichment.companies.scorePct} />
          <CoverageBar label="Revenue" pct={enrichment.companies.revenuePct} />
        </div>
        <div className="rounded-xl p-4" style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}>
          <h3 className="text-[13px] font-semibold mb-3">Contacts ({enrichment.contacts.total})</h3>
          <CoverageBar label="Email" pct={enrichment.contacts.emailPct} />
          <CoverageBar label="Title" pct={enrichment.contacts.titlePct} />
          <CoverageBar label="Score" pct={enrichment.contacts.scorePct} />
        </div>
      </div>

      {/* TAM by Industry */}
      <h2 className="text-[16px] font-semibold mb-3">TAM by Industry</h2>
      <div
        className="rounded-xl overflow-hidden mb-8"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Industry</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Companies</th>
              <th className="px-4 py-3 text-right font-medium" style={{ color: "var(--color-text-tertiary)" }}>Avg Score</th>
            </tr>
          </thead>
          <tbody>
            {tam.byIndustry.map((row) => (
              <tr key={row.industry} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{row.industry || "Unknown"}</td>
                <td className="px-4 py-3 text-right">{Number(row.count)}</td>
                <td className="px-4 py-3 text-right">{row.avgScore ? Number(row.avgScore).toFixed(1) : "--"}</td>
              </tr>
            ))}
            {tam.byIndustry.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No TAM data</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Campaigns */}
      <h2 className="text-[16px] font-semibold mb-3">Recent Campaigns</h2>
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--color-border-default)", background: "var(--color-bg-card)" }}
      >
        <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--color-border-default)" }}>
              <th className="px-4 py-3 text-left font-medium" style={{ color: "var(--color-text-tertiary)" }}>Campaign</th>
              <th className="px-4 py-3 text-center font-medium" style={{ color: "var(--color-text-tertiary)" }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id} style={{ borderBottom: "1px solid var(--color-border-default)" }}>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-center">
                  <span
                    className="rounded-md px-2 py-0.5 text-[11px] font-medium"
                    style={{
                      background: c.status === "active" ? "oklch(0.95 0.03 145)" : "var(--color-bg-muted)",
                      color: c.status === "active" ? "var(--color-success)" : "var(--color-text-tertiary)",
                    }}
                  >
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr><td colSpan={2} className="px-4 py-8 text-center" style={{ color: "var(--color-text-tertiary)" }}>No campaigns</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CoverageBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-[12px] mb-1">
        <span style={{ color: "var(--color-text-secondary)" }}>{label}</span>
        <span style={{ color: "var(--color-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {(pct * 100).toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-bg-muted)" }}>
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${Math.max(pct * 100, 1)}%`,
            background: pct > 0.7 ? "var(--color-success)" : pct > 0.4 ? "var(--color-warning)" : "var(--color-danger)",
          }}
        />
      </div>
    </div>
  );
}
