/**
 * Intention Splits (B3) — pure resolver that segments the attention lane into
 * Upstream-style intention lanes (Needs Reply / Follow Ups / Promotions / Social
 * / Other) plus user-defined per-sender splits.
 *
 * It does NOT classify anything: it COMPOSES signals each conversation already
 * carries (lane, replyWorthy, generalIntent, isBulk, awaitingOurReply,
 * awaitingTheirReply). No DB, no clock, no LLM — deterministic + unit-tested.
 *
 * Parity invariant (locked by the C1 gate): `needs_reply` requires `replyWorthy`,
 * so a thread's Split and its draft-offer (B1) can never disagree (R1.11).
 */

import type { GeneralIntent } from "@/lib/inbox/general-intent";
import { clauseMatches, type Clause, type MatchCandidate } from "@/lib/inbox/lane-match";

export type BuiltInSplit = "needs_reply" | "follow_ups" | "promotions" | "social" | "other";

export interface SplitInput {
  lane: "attention" | "handled" | "snoozed" | "done";
  replyWorthy: boolean;
  generalIntent: GeneralIntent | null;
  isBulk: boolean;
  awaitingOurReply: boolean;
  awaitingTheirReply: boolean;
}

export interface SplitResult {
  split: BuiltInSplit;
  reasons: string[];
}

/**
 * Ordered for the split-tab strip, Upstream order. The `other` id is the
 * fallthrough bucket — surfaced as "Primary" (the main mail that isn't a
 * reply/follow-up/promo/social) and shown FIRST, like Upstream's Primary tab.
 */
export const BUILT_IN_SPLITS: ReadonlyArray<{ id: BuiltInSplit; name: string }> = [
  { id: "other", name: "Primary" },
  { id: "needs_reply", name: "Needs Reply" },
  { id: "follow_ups", name: "Follow Ups" },
  { id: "promotions", name: "Promotions" },
  { id: "social", name: "Social" },
];

/**
 * Resolve a conversation's built-in Split. First-match-wins, ordered so that a
 * reply-worthy human thread awaiting our reply is `needs_reply` even when
 * bulk-flagged (branch 1 before 3/4), and a done/snoozed/handled thread is never
 * `needs_reply` (branch 1 gates on lane === "attention").
 */
export function resolveSplit(input: SplitInput): SplitResult {
  if (input.lane === "attention" && input.replyWorthy && input.awaitingOurReply) {
    return { split: "needs_reply", reasons: ["reply-worthy human mail awaiting your reply"] };
  }
  if (input.lane === "attention" && input.awaitingTheirReply) {
    return { split: "follow_ups", reasons: ["you replied; awaiting their response"] };
  }
  if (input.isBulk || input.generalIntent === "promotion_newsletter") {
    return { split: "promotions", reasons: ["bulk / promotional mail"] };
  }
  if (input.generalIntent === "social" || input.generalIntent === "notification") {
    return { split: "social", reasons: [`intent: ${input.generalIntent}`] };
  }
  return { split: "other", reasons: ["no specific split"] };
}

/* ------------------------------------------------------------------ */
/*  Custom per-sender splits (owner-scoped, user_preferences key splits) */
/* ------------------------------------------------------------------ */

export interface CustomSplit {
  id: string;
  name: string;
  /** Each entry is an address ("a@b.com" → exact) or a bare domain ("b.com"). */
  senders: string[];
  hideWhenEmpty?: boolean;
}

function senderClause(sender: string): Clause {
  const s = sender.trim();
  return s.includes("@")
    ? { field: "from", op: "is", value: s }
    : { field: "from", op: "domain", value: s };
}

/** First custom split whose any sender matches the conversation's from-address. */
export function resolveCustomSplit(fromAddress: string, splits: CustomSplit[]): CustomSplit | null {
  const candidate: MatchCandidate = { from: fromAddress };
  for (const sp of splits) {
    if ((sp.senders ?? []).some((sender) => sender.trim() && clauseMatches(candidate, senderClause(sender)))) {
      return sp;
    }
  }
  return null;
}

export interface SplitCount {
  id: string;
  name: string;
  count: number;
}

/**
 * Count built-in splits over the attention-lane inputs (each resolves to exactly
 * one, so the counts sum to the attention total).
 */
export function splitCounts(inputs: SplitInput[]): SplitCount[] {
  const tally = new Map<BuiltInSplit, number>();
  for (const b of BUILT_IN_SPLITS) tally.set(b.id, 0);
  for (const input of inputs) {
    const { split } = resolveSplit(input);
    tally.set(split, (tally.get(split) ?? 0) + 1);
  }
  return BUILT_IN_SPLITS.map((b) => ({ id: b.id, name: b.name, count: tally.get(b.id) ?? 0 }));
}
