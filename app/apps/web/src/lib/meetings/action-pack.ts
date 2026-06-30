/**
 * Per-meeting action pack — the human-judgment next moves the post-call
 * pipeline did NOT auto-execute, derived from the extracted notes.
 *
 * Why this exists: `processPostCall` already auto-creates tasks from action
 * items and DRAFTS a follow-up email — but it never SENDS it, never acts on
 * the agreed next steps, never answers the objections, and never writes the
 * internal recap. Those are exactly the moves a founder forgets between
 * meetings. This pure function turns the notes into a short, leverage-ordered
 * list of proposed actions so the meeting fiche can surface them (and, later,
 * one-click launch them via the chat agent / page actions).
 *
 * Pure + deterministic + unit-tested. The caller supplies the small amount of
 * context the notes don't carry (is there a sendable draft, a resolvable
 * recipient, is this an internal meeting).
 */

/** The subset of meeting notes this derivation reads. Structurally satisfied by
 *  both the extraction schema's `MeetingNotes` and the meeting page's local
 *  interface, so either can be passed without a cast. */
export interface MeetingActionInput {
  actionItems: Array<{ owner: string; task: string; deadline: string | null }>;
  decisions: string[];
  buyingSignals: {
    objections: string[];
    nextSteps: string[];
    competitors: string[];
  };
}

export interface MeetingActionContext {
  /** A follow-up draft exists AND has not been sent yet. */
  hasFollowUpDraft: boolean;
  /** A real recipient is resolvable (a linked/matched external contact). */
  hasContact: boolean;
  /** Internal meeting (cofounder / team) — recap, not a sales follow-up. */
  isInternal: boolean;
}

export type MeetingActionKind = "send_followup" | "draft_recap" | "ask_agent";

export interface MeetingAction {
  id: string;
  label: string;
  kind: MeetingActionKind;
  /** For `draft_recap` / `ask_agent`: a ready-to-run chat prompt the founder can
   *  launch as-is. Absent for `send_followup` (the fiche already owns that button). */
  prompt?: string;
}

const MAX_ACTIONS = 6;
const MAX_LABEL = 80;

function truncate(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Derive the leverage-ordered action pack for one meeting. Returns at most
 * {@link MAX_ACTIONS} actions; an empty array when nothing actionable was
 * extracted (the fiche then renders nothing).
 */
export function deriveMeetingActions(
  notes: MeetingActionInput,
  ctx: MeetingActionContext,
): MeetingAction[] {
  const actions: MeetingAction[] = [];
  const bs = notes.buyingSignals;
  const nextSteps = bs.nextSteps.map((s) => s.trim()).filter(Boolean);
  const objections = bs.objections.map((s) => s.trim()).filter(Boolean);
  const competitors = bs.competitors.map((s) => s.trim()).filter(Boolean);
  const decisions = notes.decisions.map((s) => s.trim()).filter(Boolean);

  // 1. Send the follow-up — the single highest-value step left un-automated
  //    (post-call drafts it but never sends). Needs a real recipient and a
  //    sales (not internal) framing.
  if (ctx.hasFollowUpDraft && ctx.hasContact && !ctx.isInternal) {
    actions.push({
      id: "send-followup",
      label: "Send the follow-up email",
      kind: "send_followup",
    });
  }

  // 2. Internal recap — fold the decisions + agreed next steps into one team
  //    message. Only for an internal meeting (an external one gets the
  //    follow-up above instead).
  if (ctx.isInternal && (decisions.length > 0 || nextSteps.length > 0 || ctx.hasFollowUpDraft)) {
    const parts = [...decisions, ...nextSteps];
    actions.push({
      id: "draft-recap",
      label: "Draft a team recap",
      kind: "draft_recap",
      prompt: parts.length
        ? `Draft a short internal recap message for the team summarizing this meeting: ${parts.join("; ")}`
        : "Draft a short internal recap message for the team summarizing this meeting.",
    });
  }

  // 3. Address objections — turn each raised objection into a ready answer
  //    (sales meetings only).
  if (!ctx.isInternal && objections.length > 0) {
    actions.push({
      id: "address-objections",
      label: `Address ${objections.length} objection${objections.length > 1 ? "s" : ""}`,
      kind: "ask_agent",
      prompt: `Draft responses to the objections raised in this meeting: ${objections.join("; ")}`,
    });
  }

  // 4. Competitive positioning (sales meetings only).
  if (!ctx.isInternal && competitors.length > 0) {
    actions.push({
      id: "competitive-positioning",
      label: "Prepare competitive positioning",
      kind: "ask_agent",
      prompt: `Prepare positioning for the alternatives this account is weighing: ${competitors.join(", ")}`,
    });
  }

  // 5. Agreed next steps — one ask-the-agent action each (NOT auto-executed).
  //    For internal meetings these are folded into the recap (step 2), so only
  //    expand them individually on sales meetings.
  if (!ctx.isInternal) {
    for (const step of nextSteps) {
      if (actions.length >= MAX_ACTIONS) break;
      actions.push({
        id: `next-step-${actions.length}`,
        label: `Next step: ${truncate(step, MAX_LABEL)}`,
        kind: "ask_agent",
        prompt: `Help me act on this agreed next step from the meeting: "${step}"`,
      });
    }
  }

  return actions.slice(0, MAX_ACTIONS);
}
