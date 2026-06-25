/**
 * Spec 29 — campaign rollups sourced from the live outbound_emails table.
 *
 * First slice: compute-on-read (no metric_events table / cron yet). Each outbound
 * row yields up to four idempotent MetricEvents (sent / delivered / reply|positive
 * / bounce|spam) keyed by `${id}:${type}`, fed to the pure computeRollups. The
 * campaign key is the outbound's campaignId, else its enrollment's sequenceId.
 * variant/step attribution is limited (variants aren't persisted on the outbound).
 */

import { db as defaultDb } from "@/db";
import { outboundEmails, sequenceEnrollments, contacts, metricRollupSnapshot } from "@/db/schema";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import { notExcludedAsLeadSql } from "@/lib/inbound/lead-status-sql";
import { computeRollups, type MetricEvent, type Metrics, type RollupResult } from "./rollup";

const DEFAULT_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const POSITIVE = new Set(["positive", "interested", "meeting_request"]);

export interface OutboundRollupRow {
  id: string;
  campaignId: string | null;
  sequenceId: string | null;
  stepNumber: number | null;
  sentAt: Date | string | null;
  deliveredAt: Date | string | null;
  repliedAt: Date | string | null;
  replyClassification: string | null;
  bouncedAt: Date | string | null;
  bounceType: string | null;
}

function ms(d: Date | string | null | undefined): number | null {
  if (d == null) return null;
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return Number.isFinite(t) ? t : null;
}

/** Map outbound rows to dedup-keyed MetricEvents (pure — the rollup core is tested separately). */
export function rowsToMetricEvents(rows: OutboundRollupRow[]): MetricEvent[] {
  const events: MetricEvent[] = [];
  for (const r of rows) {
    const campaignId = r.campaignId ?? r.sequenceId ?? "(none)";
    const stepId = r.stepNumber != null ? String(r.stepNumber) : undefined;
    const base = { campaignId, stepId };
    const sent = ms(r.sentAt);
    if (sent != null) events.push({ ...base, eventId: `${r.id}:sent`, type: "sent", at: sent });
    const delivered = ms(r.deliveredAt);
    if (delivered != null) events.push({ ...base, eventId: `${r.id}:delivered`, type: "delivered", at: delivered });
    const replied = ms(r.repliedAt);
    if (replied != null) {
      const positive = r.replyClassification != null && POSITIVE.has(r.replyClassification);
      events.push({ ...base, eventId: `${r.id}:reply`, type: positive ? "positive_reply" : "reply", at: replied });
    }
    const bounced = ms(r.bouncedAt);
    if (bounced != null) {
      events.push({ ...base, eventId: `${r.id}:bounce`, type: r.bounceType === "complaint" ? "spam" : "bounce", at: bounced });
    }
  }
  return events;
}

/** Compute campaign-dimension rollups for a tenant over the rolling window. */
export async function computeCampaignRollups(
  tenantId: string,
  opts: { windowMs?: number; now?: number; database?: typeof defaultDb } = {},
): Promise<RollupResult> {
  const now = opts.now ?? Date.now();
  const database = opts.database ?? defaultDb;
  const since = new Date(now - (opts.windowMs ?? DEFAULT_WINDOW_MS));

  const rows = await database
    .select({
      id: outboundEmails.id,
      campaignId: outboundEmails.campaignId,
      sequenceId: sequenceEnrollments.sequenceId,
      stepNumber: outboundEmails.stepNumber,
      sentAt: outboundEmails.sentAt,
      deliveredAt: outboundEmails.deliveredAt,
      repliedAt: outboundEmails.repliedAt,
      replyClassification: outboundEmails.replyClassification,
      bouncedAt: outboundEmails.bouncedAt,
      bounceType: outboundEmails.bounceType,
    })
    .from(outboundEmails)
    .leftJoin(sequenceEnrollments, eq(outboundEmails.enrollmentId, sequenceEnrollments.id))
    .leftJoin(contacts, eq(contacts.id, outboundEmails.contactId))
    // Campaign rollups must reflect PROSPECT outreach: drop contact-less self-
    // test/plumbing sends and contacts ruled not-a-lead, so they don't inflate
    // sent/reply/bounce rates feeding A/B significance, the weekly optimizer and
    // regression alerts. Mirrors the dashboard-summary KPI gate.
    .where(
      and(
        eq(outboundEmails.tenantId, tenantId),
        gte(outboundEmails.sentAt, since),
        isNotNull(outboundEmails.contactId),
        notExcludedAsLeadSql(contacts.properties),
      ),
    );

  const events = rowsToMetricEvents(rows as OutboundRollupRow[]);
  return computeRollups(events, { scope: { dimension: "campaign" } });
}

/**
 * Persist a day's campaign rollups as one snapshot row per campaign (upsert on
 * tenant+dimension+scope+day, so re-running the day is idempotent). Returns the
 * number of campaigns snapshotted. Written by the daily-rollup cron.
 */
export async function persistDailyRollups(
  tenantId: string,
  day: string,
  opts: { now?: number; database?: typeof defaultDb } = {},
): Promise<number> {
  const database = opts.database ?? defaultDb;
  const result = await computeCampaignRollups(tenantId, { now: opts.now, database });
  const entries = Object.entries(result.byScope);
  for (const [scopeKey, metrics] of entries) {
    await database
      .insert(metricRollupSnapshot)
      .values({ tenantId, dimension: "campaign", scopeKey, day, metrics })
      .onConflictDoUpdate({
        target: [metricRollupSnapshot.tenantId, metricRollupSnapshot.dimension, metricRollupSnapshot.scopeKey, metricRollupSnapshot.day],
        set: { metrics, createdAt: new Date() },
      });
  }
  return entries.length;
}

export interface RollupSnapshotRow {
  dimension: string;
  scopeKey: string;
  day: string;
  metrics: Metrics;
}

/** Read persisted snapshots for a tenant (optionally a dimension, since a day). */
export async function getRollupSnapshots(
  tenantId: string,
  opts: { dimension?: string; sinceDay?: string; database?: typeof defaultDb } = {},
): Promise<RollupSnapshotRow[]> {
  const database = opts.database ?? defaultDb;
  const conds = [eq(metricRollupSnapshot.tenantId, tenantId)];
  if (opts.dimension) conds.push(eq(metricRollupSnapshot.dimension, opts.dimension));
  if (opts.sinceDay) conds.push(gte(metricRollupSnapshot.day, opts.sinceDay));
  const rows = await database
    .select({ dimension: metricRollupSnapshot.dimension, scopeKey: metricRollupSnapshot.scopeKey, day: metricRollupSnapshot.day, metrics: metricRollupSnapshot.metrics })
    .from(metricRollupSnapshot)
    .where(and(...conds));
  return rows as RollupSnapshotRow[];
}
