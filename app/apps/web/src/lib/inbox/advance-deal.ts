/**
 * Advance-deal-from-reply decision (INBOX-G09 core). Pure + unit-tested.
 *
 * Given the reply intent and the current pipeline stage, suggest the next stage —
 * grounded in our own deal graph. Safety rails: an objection holds the stage, a
 * not-interested suggests (but never auto-applies) lost, and the deal is NEVER
 * auto-advanced into a terminal won/lost (those are human decisions). It only
 * SUGGESTS; the user confirms.
 */

export interface AdvanceInput {
  currentStage: string;
  replyIntent: string;
  /** The pipeline order, e.g. ["lead","qualified","proposal","negotiation","won","lost"]. */
  stageOrder: string[];
}

export interface AdvanceDecision {
  suggestedStage: string | null;
  advance: boolean;
  reason: string;
}

const TERMINAL = new Set(["won", "lost"]);
const ADVANCING_INTENTS = new Set([
  "meeting_request", "demo_request", "interested", "pricing_inquiry",
  "budget_mention", "calendar_scheduling",
]);

export function suggestStageAdvance(i: AdvanceInput): AdvanceDecision {
  const order = i.stageOrder.map((s) => s.toLowerCase());
  const cur = i.currentStage.toLowerCase();
  const intent = i.replyIntent.toLowerCase();

  if (intent === "not_interested") {
    return { suggestedStage: "lost", advance: false, reason: "prospect declined — consider marking lost (manual)" };
  }
  if (intent === "objection") {
    return { suggestedStage: cur, advance: false, reason: "objection — hold the stage and address it" };
  }
  if (!ADVANCING_INTENTS.has(intent)) {
    return { suggestedStage: cur, advance: false, reason: "no buying signal — stage unchanged" };
  }

  const idx = order.indexOf(cur);
  if (idx < 0) return { suggestedStage: null, advance: false, reason: "unknown current stage" };

  const next = order[idx + 1];
  if (!next || TERMINAL.has(next)) {
    return { suggestedStage: cur, advance: false, reason: "won/lost is a human decision — not auto-advanced" };
  }
  return { suggestedStage: next, advance: true, reason: `buying signal (${intent}) — suggest advancing to ${next}` };
}
