/**
 * Spec 29 — event rollups. Aggregates send/reply/cost events into per-scope
 * metrics with benchmark flags and (variantId, stepId) attribution. Fully
 * deterministic and idempotent: each event has a unique id, so reprocessing the
 * same or overlapping events never double-counts. Blast radius: analytics/rollups/*.
 */

import { compareMetric, DEFAULT_BENCHMARKS, type Benchmarks, type BenchmarkComparison } from "./benchmarks";

export type MetricEventType =
  | "sent"
  | "delivered"
  | "reply"
  | "positive_reply"
  | "meeting"
  | "bounce"
  | "spam";

export interface MetricEvent {
  /** Unique id — the idempotency key (AC3). */
  eventId: string;
  type: MetricEventType;
  campaignId: string;
  segmentId?: string;
  variantId?: string;
  stepId?: string;
  /** Cost in credits attributable to this event (sends, enrichment, etc.). */
  cost?: number;
  at: number;
}

export interface Metrics {
  sent: number;
  delivered: number;
  replies: number;
  positiveReplies: number;
  meetings: number;
  bounces: number;
  spam: number;
  deliveryRate: number;
  replyRate: number;
  positiveRate: number;
  bounceRate: number;
  spamRate: number;
  costTotal: number;
  costPerQualifiedAccount: number | null;
  costPerPositiveReply: number | null;
}

export interface Attribution {
  variantId: string;
  stepId: string;
  replies: number;
  positiveReplies: number;
}

export interface RollupScope {
  /** "campaign" | "segment" | "variant". */
  dimension: "campaign" | "segment" | "variant";
}

export interface RollupResult {
  /** Metrics keyed by the scope value (campaignId / segmentId / variantId). */
  byScope: Record<string, Metrics>;
  /** Benchmark comparisons per scope value. */
  benchmarks: Record<string, BenchmarkComparison[]>;
  /** AC5 — reply/positive attribution by `${variantId}::${stepId}`. */
  attribution: Record<string, Attribution>;
  /** Count of unique events processed (post-dedup). */
  processed: number;
}

function emptyMetrics(): Metrics {
  return {
    sent: 0, delivered: 0, replies: 0, positiveReplies: 0, meetings: 0, bounces: 0, spam: 0,
    deliveryRate: 0, replyRate: 0, positiveRate: 0, bounceRate: 0, spamRate: 0,
    costTotal: 0, costPerQualifiedAccount: null, costPerPositiveReply: null,
  };
}

function scopeKey(e: MetricEvent, dimension: RollupScope["dimension"]): string | undefined {
  if (dimension === "campaign") return e.campaignId;
  if (dimension === "segment") return e.segmentId;
  return e.variantId;
}

function tally(m: Metrics, e: MetricEvent): void {
  switch (e.type) {
    case "sent": m.sent++; break;
    case "delivered": m.delivered++; break;
    case "reply": m.replies++; break;
    case "positive_reply": m.positiveReplies++; m.replies++; break; // a positive reply is also a reply
    case "meeting": m.meetings++; break;
    case "bounce": m.bounces++; break;
    case "spam": m.spam++; break;
  }
  if (typeof e.cost === "number" && Number.isFinite(e.cost)) m.costTotal += e.cost;
}

function finalize(m: Metrics, qualifiedAccounts: number): void {
  const div = (a: number, b: number) => (b > 0 ? a / b : 0);
  m.deliveryRate = div(m.delivered, m.sent);
  m.replyRate = div(m.replies, m.sent);
  m.positiveRate = div(m.positiveReplies, m.sent);
  m.bounceRate = div(m.bounces, m.sent);
  m.spamRate = div(m.spam, m.sent);
  m.costPerQualifiedAccount = qualifiedAccounts > 0 ? m.costTotal / qualifiedAccounts : null;
  m.costPerPositiveReply = m.positiveReplies > 0 ? m.costTotal / m.positiveReplies : null;
}

export interface RollupOptions {
  scope: RollupScope;
  benchmarks?: Benchmarks;
  /** Qualified-account count per scope value, for cost-per-qualified-account. */
  qualifiedAccounts?: Record<string, number>;
}

/**
 * AC1/AC2/AC3/AC5 — compute rollups. Events are deduped by `eventId` (idempotent
 * reprocess), tallied per scope, finalized into rates + cost metrics, compared to
 * benchmarks, and attributed by (variantId, stepId).
 */
export function computeRollups(events: MetricEvent[], opts: RollupOptions): RollupResult {
  const benchmarks = opts.benchmarks ?? DEFAULT_BENCHMARKS;
  const qa = opts.qualifiedAccounts ?? {};

  const seen = new Set<string>();
  const byScope: Record<string, Metrics> = {};
  const attribution: Record<string, Attribution> = {};
  let processed = 0;

  for (const e of events) {
    if (seen.has(e.eventId)) continue; // AC3 — idempotent dedup
    seen.add(e.eventId);
    processed++;

    const key = scopeKey(e, opts.scope.dimension);
    if (key !== undefined) {
      (byScope[key] ??= emptyMetrics());
      tally(byScope[key], e);
    }

    // AC5 — attribute replies/positives to (variantId, stepId).
    if ((e.type === "reply" || e.type === "positive_reply") && e.variantId && e.stepId) {
      const ak = `${e.variantId}::${e.stepId}`;
      const a = (attribution[ak] ??= { variantId: e.variantId, stepId: e.stepId, replies: 0, positiveReplies: 0 });
      a.replies++;
      if (e.type === "positive_reply") a.positiveReplies++;
    }
  }

  const benchmarkOut: Record<string, BenchmarkComparison[]> = {};
  for (const [key, m] of Object.entries(byScope)) {
    finalize(m, qa[key] ?? 0);
    benchmarkOut[key] = [
      compareMetric("deliveryRate", m.deliveryRate, benchmarks),
      compareMetric("replyRate", m.replyRate, benchmarks),
      compareMetric("positiveRate", m.positiveRate, benchmarks),
      compareMetric("bounceRate", m.bounceRate, benchmarks),
      compareMetric("spamRate", m.spamRate, benchmarks),
    ];
  }

  return { byScope, benchmarks: benchmarkOut, attribution, processed };
}

// ── AC4 query API ──

/** Metrics for one scope value, or null if absent. */
export function getMetrics(result: RollupResult, scopeKeyValue: string): Metrics | null {
  return result.byScope[scopeKeyValue] ?? null;
}

/** Attribution rows for a variant (across its steps). */
export function getAttribution(result: RollupResult, variantId: string): Attribution[] {
  return Object.values(result.attribution).filter((a) => a.variantId === variantId);
}
