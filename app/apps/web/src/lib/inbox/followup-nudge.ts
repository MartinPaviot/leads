/**
 * P2 (inbox deal-closer roadmap) — proactive follow-up nudges. The pure
 * decision core: when a thread needs a NEW draft, when an existing pending
 * draft has gone stale, and what escalation guidance to feed the (already
 * fail-closed, no-new-facts) nudge generator. No DB, no network, no LLM, no
 * ambient clock — every function here is a straight value→value mapping, so
 * the dedupe/staleness rules are locked by tests instead of buried in the
 * cron's DB orchestration (inngest/followup-nudge-cron.ts).
 *
 * Drafting NEVER sends. Every row this module's callers create starts at
 * pending_review; only an explicit founder action (the send/dismiss API
 * routes) changes that. This file has no concept of "auto-send" at all.
 */

import type { FollowupDue } from "./followup-due";
import { isFollowupDue } from "./followup-due";

/** A drafted-or-reviewed nudge row, the fields this module needs (a narrowed
 *  view of the `inbox_followup_nudges` row — DB orchestration lives in the
 *  cron/routes, not here). */
export interface ExistingNudgeRow {
  conversationKey: string;
  stage: number;
}

/**
 * Should a NEW nudge be drafted for this conversation right now? True only
 * when (a) the conversation is genuinely due (isFollowupDue) AND (b) no row
 * already exists for this exact (conversationKey, stage) — the DB's unique
 * index enforces this too, but checking here first avoids a guaranteed-to-fail
 * insert attempt for the common case (most due conversations were already
 * drafted on a prior run).
 */
export function shouldDraftNudge(
  followup: FollowupDue | null | undefined,
  existingRowsForConversation: ExistingNudgeRow[],
): boolean {
  if (!isFollowupDue(followup)) return false;
  const stage = followup!.stage;
  return !existingRowsForConversation.some((r) => r.stage === stage);
}

/**
 * Should a PENDING (unreviewed) nudge be auto-expired? True when the live
 * thread state no longer matches what the draft was for — the prospect
 * replied (resetting the ladder), the founder already followed up some other
 * way, or the thread simply isn't due anymore. A stale "should I nudge them?"
 * card after they already replied is the exact write-only-intelligence
 * failure mode this module exists to avoid (see memory:
 * project_self-improvement-loops-map). Pure: takes the row's stage and the
 * thread's CURRENT live followup state (recomputed by the caller from the
 * conversation's current messages — followup-due.ts already handles the
 * inbound-resets-the-ladder semantics correctly, this just compares).
 */
export function isNudgeStale(rowStage: number, liveFollowup: FollowupDue | null | undefined): boolean {
  if (!isFollowupDue(liveFollowup)) return true;
  return liveFollowup!.stage !== rowStage;
}

const DEFAULT_EXPIRY_DAYS = 5;

/** When an unreviewed draft auto-expires as a hard backstop (independent of
 *  the live-staleness reconciliation, in case a cron run is ever skipped). */
export function computeNudgeExpiresAt(generatedAtMs: number, days: number = DEFAULT_EXPIRY_DAYS): Date {
  return new Date(generatedAtMs + days * 86_400_000);
}

/**
 * Escalation GUIDANCE for the prompt — not a rigid template. The existing
 * nudge generator (compose-reply.ts mode:"nudge") already forbids new facts/
 * commitments/deadlines; this only tells it how direct to be, the same way
 * `mode` already varies the task sentence. Stage 1 stays as gentle as today's
 * single template; later stages ask for more directness without inventing
 * pressure tactics. Kept as ONE tunable string per stage (not hardcoded
 * send-ready copy) so the founder can adjust tone later without a schema or
 * generator change.
 */
export function escalationGuidance(stage: number): string {
  if (stage <= 1) {
    return "This is the first follow-up since they last replied — keep it light and low-pressure, exactly as a single gentle nudge would read.";
  }
  if (stage === 2) {
    return `This is follow-up attempt ${stage} on this thread — they haven't responded to the first nudge either. Be a little more direct than a first nudge: reference that you've checked in before, but stay warm and curious, not pushy.`;
  }
  return `This is follow-up attempt ${stage} on this thread, the latest in a row with no response — be direct and give them an easy, low-effort way to close the loop (a quick yes/no, or "let me know if this isn't a priority right now"), while staying respectful. Do not guilt-trip or manufacture urgency.`;
}
