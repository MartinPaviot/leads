/**
 * AUTOPILOT-AUTOPAUSE (P0 #1) — per-sequence outcome health + the pure
 * dead-sequence classifier. This is the metric the optimizer lacks: it grounds
 * on real OUTCOMES (meetings booked + reply rate) over a sample window, not just
 * deliverability. `classifySequence` is PURE (no IO, no clock) so the
 * circuit-breaker's decision is fully unit-testable; `loadSequenceHealth` is the
 * thin DB reader (verified on localdev).
 *
 * Why this matters: flipping DAILY_AUTOPILOT_ENABLED on without this reproduces
 * the Monaco failure (an autonomous sender pouring volume into a 0-meeting
 * channel with no stop). A flip to sequences.status='paused' is ALREADY effective
 * (inngest/sequence-cron.ts joins sequences.status='active'; daily-autopilot
 * enrolls only into 'active') — this module decides WHEN.
 */

import { and, eq, gte, sql } from "drizzle-orm";
import { db as defaultDb } from "@/db";
import { sequences, sequenceEnrollments, outboundEmails, pipelineEvents } from "@/db/schema";

export interface SequenceHealth {
  sequenceId: string;
  name: string;
  /** sends that left the building over the window: status in (sent, delivered, bounced). */
  sent: number;
  /** outbound rows with repliedAt set over the window. */
  replies: number;
  /** pipeline_events stage='meeting_booked' attributed to this sequence over the window. */
  meetingsBooked: number;
  /** replies / sent (0 when sent === 0). */
  replyRate: number;
  oldestSendAt: Date | null;
  /** set true when a human resumed an auto-paused sequence → never auto-pause again. */
  autopilotProtected: boolean;
}

export interface AutoPauseThresholds {
  /** sends over the window below which the verdict is insufficient_data (untested, not dead). */
  minSample: number;
  windowDays: number;
  /** replyRate floor; deliberately well below the ~5% reply benchmark so the breaker is conservative. */
  replyFloor: number;
}

export const DEFAULT_THRESHOLDS: AutoPauseThresholds = {
  minSample: 50,
  windowDays: 14,
  replyFloor: 0.01,
};

export type Verdict = "dead" | "insufficient_data" | "healthy" | "protected";
export interface Classification {
  verdict: Verdict;
  reason: string;
}

/**
 * PURE. Decides whether a sequence's outcomes are dead. No IO, no clock — inject
 * `thresholds` to test. Conservative by construction: never pauses an untested
 * (under-sample) or human-protected sequence; "dead" requires zero meetings AND a
 * reply rate under the floor over a full sample window.
 *
 * NOTE (v1): positive-reply sentiment is not yet a signal — `replyRate < floor`
 * (≈ zero replies at the default sample) is the conservative proxy for AC1's
 * "positiveReplies == 0". Per-channel (partial_dead) diagnosis is a follow-up;
 * v1 pauses the whole sequence only on aggregate death.
 */
export function classifySequence(
  h: SequenceHealth,
  thresholds: AutoPauseThresholds = DEFAULT_THRESHOLDS
): Classification {
  if (h.autopilotProtected) {
    return { verdict: "protected", reason: "human-resumed; auto-pause suppressed" };
  }
  if (h.sent === 0) {
    return { verdict: "insufficient_data", reason: "no sends in window (0 sends is untested, not dead)" };
  }
  if (h.sent < thresholds.minSample) {
    return {
      verdict: "insufficient_data",
      reason: `sent=${h.sent} < minSample=${thresholds.minSample}`,
    };
  }
  const dead = h.meetingsBooked === 0 && h.replyRate < thresholds.replyFloor;
  if (dead) {
    const pct = (h.replyRate * 100).toFixed(2);
    return {
      verdict: "dead",
      reason: `auto:dead_sequence sent=${h.sent} replies=${h.replies} meetings=0 replyRate=${pct}% over ${thresholds.windowDays}d`,
    };
  }
  return {
    verdict: "healthy",
    reason: `sent=${h.sent} replies=${h.replies} meetings=${h.meetingsBooked} replyRate=${(h.replyRate * 100).toFixed(2)}%`,
  };
}

type Database = typeof defaultDb;

/**
 * Per-active-sequence outcome health for a tenant over the trailing window.
 * Tenant-scoped via the sequences.tenantId join (sequence_enrollments has no
 * tenant_id). Sequences with zero sends in the window simply don't appear → the
 * classifier treats absence as insufficient_data, so they're never paused.
 */
export async function loadSequenceHealth(
  tenantId: string,
  opts: { windowDays?: number; now?: Date; db?: Database } = {}
): Promise<SequenceHealth[]> {
  const db = opts.db ?? defaultDb;
  const windowDays = opts.windowDays ?? DEFAULT_THRESHOLDS.windowDays;
  const now = opts.now ?? new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // Sends + replies per active sequence (enrollments → outbound_emails).
  const sendRows = await db
    .select({
      sequenceId: sequences.id,
      name: sequences.name,
      autopilotProtected: sequences.autopilotProtected,
      sent: sql<number>`count(*) filter (where ${outboundEmails.status} in ('sent','delivered','bounced'))`,
      replies: sql<number>`count(*) filter (where ${outboundEmails.repliedAt} is not null)`,
      oldestSendAt: sql<Date | null>`min(${outboundEmails.sentAt})`,
    })
    .from(sequences)
    .innerJoin(sequenceEnrollments, eq(sequenceEnrollments.sequenceId, sequences.id))
    .innerJoin(outboundEmails, eq(outboundEmails.enrollmentId, sequenceEnrollments.id))
    .where(
      and(
        eq(sequences.tenantId, tenantId),
        eq(sequences.status, "active"),
        gte(outboundEmails.createdAt, windowStart)
      )
    )
    .groupBy(sequences.id, sequences.name, sequences.autopilotProtected);

  // Meetings booked per sequence (pipeline_events → enrollment → sequence).
  const meetingRows = await db
    .select({
      sequenceId: sequences.id,
      meetings: sql<number>`count(*)`,
    })
    .from(pipelineEvents)
    .innerJoin(sequenceEnrollments, eq(sequenceEnrollments.id, pipelineEvents.enrollmentId))
    .innerJoin(sequences, eq(sequences.id, sequenceEnrollments.sequenceId))
    .where(
      and(
        eq(pipelineEvents.tenantId, tenantId),
        eq(pipelineEvents.stage, "meeting_booked"),
        eq(sequences.status, "active"),
        gte(pipelineEvents.createdAt, windowStart)
      )
    )
    .groupBy(sequences.id);

  const meetingsBySeq = new Map<string, number>();
  for (const r of meetingRows) meetingsBySeq.set(r.sequenceId, Number(r.meetings) || 0);

  return sendRows.map((r) => {
    const sent = Number(r.sent) || 0;
    const replies = Number(r.replies) || 0;
    return {
      sequenceId: r.sequenceId,
      name: r.name,
      sent,
      replies,
      meetingsBooked: meetingsBySeq.get(r.sequenceId) ?? 0,
      replyRate: sent > 0 ? replies / sent : 0,
      oldestSendAt: r.oldestSendAt ?? null,
      autopilotProtected: Boolean(r.autopilotProtected),
    };
  });
}
