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

  switch (stage.toLowerCase()) {
    case "lead":
    case "new":
      return { action: "Qualify and book an intro", why: "early-stage lead" };
    case "qualified":
      return { action: "Book a demo", why: "qualified — show the product" };
    case "proposal":
      return { action: "Send the contract", why: "proposal is out — move to close" };
    case "negotiation":
      return { action: "Resolve the open terms", why: "in negotiation" };
    default:
      return { action: "Review and decide the next step", why: "no specific stage signal" };
  }
}
