/**
 * Pure moment-resolution helpers for sales-call-prep, kept separate from the
 * handler so they (and their tests) never pull in the AI SDK or the DB client.
 * The handler does the I/O; these decide WHICH moment and HOW to shape the prep.
 */
import { deriveMoment, normalizeMoment, MOMENT_AUTO, type Moment } from "@/lib/motion/moment";

/** Legacy callType → moment, used only as a last resort when no signal exists. */
export function callTypeToMoment(ct?: string): Moment | null {
  switch (ct) {
    case "discovery":
      return "discovery";
    case "demo":
      return "demo";
    case "negotiation":
    case "close":
      return "close";
    default:
      return null; // follow_up and unknown have no clean mapping
  }
}

/**
 * Read-precedence for the moment: explicit input > NL hint > deal override >
 * derived-from-signals > legacy callType. Mirrors the doctrine that the moment
 * is computed, never configured.
 */
export function resolveMoment(a: {
  inputMoment?: Moment;
  momentHint?: string | null;
  callType?: string;
  dealOverride?: string | null;
  hasDeal: boolean;
  dealStage?: string | null;
}): Moment {
  if (a.inputMoment) return a.inputMoment;
  const hinted = a.momentHint ? normalizeMoment(a.momentHint) : null;
  if (hinted && hinted !== MOMENT_AUTO) return hinted;
  const derived = deriveMoment({
    override: a.dealOverride ?? null,
    hasDeal: a.hasDeal,
    dealStage: a.dealStage ?? null,
  });
  if (derived.source === "no-signal") return callTypeToMoment(a.callType) ?? derived.moment;
  return derived.moment;
}

/**
 * Did discovery leave any trace on the deal? deal-autofill persists budget
 * (value), timeline (closeDate), competitors, sentiment, and the decision
 * maker — not structured pains — so we gate on those, not on a pains field
 * (which would false-refuse every demo). Pains themselves are read by the LLM
 * from the captured interactions in the prospect context.
 */
export function hasDiscoveryTraces(
  deal: {
    value?: number | null;
    expectedCloseDate?: Date | null;
    summary?: string | null;
    properties?: unknown;
  } | null,
): boolean {
  if (!deal) return false;
  if (deal.value != null) return true;
  if (deal.expectedCloseDate != null) return true;
  if (deal.summary && deal.summary.trim().length > 0) return true;
  const props = (deal.properties ?? {}) as Record<string, unknown>;
  if (Array.isArray(props.competitors) && props.competitors.length > 0) return true;
  if (props.decisionMakerContactId) return true;
  if (props.sentiment) return true;
  return false;
}

/**
 * Moment-specific shaping of this skill's fixed output fields. The Method
 * doctrine (injected separately as the rubric) carries the rules; this tells
 * the model how to express them in the prep's fields for THIS moment.
 */
export function momentInstructions(moment: Moment): string {
  switch (moment) {
    case "discovery":
      return `This is a DISCOVERY call. Diagnose, do not pitch.
- callStrategy: open by removing the pitch posture; map the current state in five layers (environment, problem, IMPACT IN NUMBERS, root cause, personal emotion); route by what the buyer already knows.
- discoveryQuestions: 11 to 14 targeted questions that QUANTIFY THE GAP (the cost of the problem in their own numbers), not a generic list; include money and competitor questions.
- closingMove: book the next meeting in-calendar with the missing stakeholder; never "I'll send some times".`;
    case "demo":
      return `This is a DEMO. No discovery, no demo: proceed only if a real pain was captured (see the context and deal facts above).
- valuePropositions: EXACTLY 3 capabilities, each mapped to a NAMED pain the prospect actually raised; each shown as orient, then proof, then the value tied to their stated problem.
- callStrategy: open on THEIR agenda (replay their stated pains), and reserve the last ten minutes for the next step.
- closingMove: offer specific presumptive-close options (a narrow paid pilot with success criteria, a technical session, or a commercial conversation), then a date.
If no pain was captured anywhere in the context, set "blocked" to "No discovery captured — run discovery first." and keep the arrays minimal.`;
    case "close":
      return `This is a CLOSE / negotiation. Indecision is the enemy, not the competitor.
- callStrategy: arm the champion (per-stakeholder one-pager points; ROI with THEIR numbers); give one recommendation, not a menu; take the risk off the table.
- objectionHandlers: the closing-stage objections (CFO not approved, went with a competitor, start smaller or free, need feature X).
- closingMove: the next concrete step on the verbal-yes to signature path, dated to their critical event.`;
    case "proposal":
      return `This is a PROPOSAL conversation. Present it live; never email it cold.
- callStrategy: the one-pager arc — their problem in their words with their cost, the future state, scope v1, the anchored price with ROI, a mutual action plan with a decision date, and proof.
- objectionHandlers: proposal-stage objections (too expensive, competitor cheaper, discount ask, "next quarter", legal/procurement). Never discount, trade; never free, a paid pilot.
- closingMove: confirm the decision date and the named deciders.`;
    case "cold_call":
      return `This is a COLD first touch. The live script lives in Call Mode (permission opener, one real reason in 20 seconds, the booking ask); keep this short and point there.
- openingHook: one permission-based opener grounded in a real, specific reason.
- closingMove: the ask for a short next meeting.`;
    case "outbound":
      return `This is OUTBOUND sequencing, not a live call yet.
- callStrategy: the multi-touch angle and the single strongest real signal to lead on.
- openingHook: the first-touch hook grounded in a specific signal (no fabrication).`;
    case "expansion":
      return `This is an EXISTING-CUSTOMER expansion conversation.
- callStrategy: tie to the value already delivered and a concrete expansion trigger (usage growth, a new use case, a new team).
- closingMove: the next step toward the expansion.`;
  }
}
