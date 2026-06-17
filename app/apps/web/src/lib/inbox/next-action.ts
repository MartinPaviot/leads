/**
 * Suggested next action by deal stage + situation (INBOX-G05 core). Pure +
 * unit-tested.
 *
 * Turns the deal stage and the conversation situation into a concrete, cited
 * next action ("Send the contract", "Follow up", "Address the objection") — the
 * revenue-motion framing on the inbox. Deterministic; the deal stage + situation
 * are read from our own pipeline (the wiring is residual). Never auto-acts — it
 * suggests.
 */

export type DealSituation =
  | "new" | "no_reply" | "replied" | "objection" | "meeting_set" | "gone_quiet";

export interface NextAction {
  action: string;
  why: string;
}

export function suggestNextAction(stage: string, situation: DealSituation): NextAction {
  // Situation cues override the stage default.
  if (situation === "objection") return { action: "Address the objection", why: "prospect raised a concern" };
  if (situation === "no_reply" || situation === "gone_quiet") {
    return { action: "Follow up", why: "no reply since your last touch" };
  }
  if (situation === "meeting_set") return { action: "Prepare for the meeting", why: "a meeting is booked" };

  // Stages are the live deal_stage enum: lead · qualification · demo · trial ·
  // proposal · negotiation · won · lost ("qualified"/"new" kept as aliases).
  switch (stage.toLowerCase()) {
    case "lead":
    case "new":
      return { action: "Qualify and book an intro", why: "early-stage lead" };
    case "qualification":
    case "qualified":
      return { action: "Book a demo", why: "qualified — show the product" };
    case "demo":
      return { action: "Send a proposal", why: "demo done — make the offer" };
    case "trial":
      return { action: "Check in on the trial", why: "in trial — prove the value" };
    case "proposal":
      return { action: "Send the contract", why: "proposal is out — move to close" };
    case "negotiation":
      return { action: "Resolve the open terms", why: "in negotiation" };
    case "won":
      return { action: "Kick off onboarding", why: "deal won — start delivery" };
    case "lost":
      return { action: "Close out or revive later", why: "deal lost" };
    default:
      return { action: "Review and decide the next step", why: "no specific stage signal" };
  }
}

/**
 * Derive the conversation's situation from its own shape — an unresolved
 * objection wins, then "new" (no outbound yet), then whether we're waiting on
 * them (last message ours: no_reply, or gone_quiet past a week) or they're
 * waiting on us (last message theirs: replied). meeting_set needs a calendar
 * signal we don't have here, so it's never inferred — only honoured if passed.
 */
export function deriveSituation(
  conv: {
    messages: Array<{ direction: "inbound" | "outbound"; at: string | null }>;
    intelligence: { objections?: Array<{ status: string }> } | null;
  },
  now: number = Date.now(),
): DealSituation {
  const hasUnresolvedObjection = (conv.intelligence?.objections ?? []).some(
    (o) => o.status === "unresolved",
  );
  if (hasUnresolvedObjection) return "objection";

  const hasOutbound = conv.messages.some((m) => m.direction === "outbound");
  if (!hasOutbound) return "new";

  const last = conv.messages[conv.messages.length - 1];
  if (last?.direction === "outbound") {
    const days = last.at ? (now - new Date(last.at).getTime()) / 86_400_000 : 0;
    return days >= 7 ? "gone_quiet" : "no_reply";
  }
  return "replied";
}
