import { describe, it, expect } from "vitest";
import { deriveMeetingActions, type MeetingActionInput, type MeetingActionContext } from "../action-pack";

const emptyNotes: MeetingActionInput = {
  actionItems: [],
  decisions: [],
  buyingSignals: { objections: [], nextSteps: [], competitors: [] },
};

const salesCtx: MeetingActionContext = { hasFollowUpDraft: true, hasContact: true, isInternal: false };
const internalCtx: MeetingActionContext = { hasFollowUpDraft: true, hasContact: false, isInternal: true };

describe("deriveMeetingActions", () => {
  it("returns nothing when there is nothing actionable", () => {
    expect(deriveMeetingActions(emptyNotes, { hasFollowUpDraft: false, hasContact: false, isInternal: false })).toEqual([]);
  });

  it("surfaces send-followup first for a sales meeting with a sendable draft + recipient", () => {
    const out = deriveMeetingActions(emptyNotes, salesCtx);
    expect(out[0]).toMatchObject({ id: "send-followup", kind: "send_followup" });
    expect(out[0].prompt).toBeUndefined();
  });

  it("does NOT offer send-followup without a resolvable contact", () => {
    const out = deriveMeetingActions(emptyNotes, { hasFollowUpDraft: true, hasContact: false, isInternal: false });
    expect(out.find((a) => a.id === "send-followup")).toBeUndefined();
  });

  it("does NOT offer send-followup when the draft was already sent (hasFollowUpDraft=false)", () => {
    const out = deriveMeetingActions(emptyNotes, { hasFollowUpDraft: false, hasContact: true, isInternal: false });
    expect(out.find((a) => a.id === "send-followup")).toBeUndefined();
  });

  it("offers a team recap (not a follow-up) for an internal meeting, folding decisions + next steps", () => {
    const notes: MeetingActionInput = {
      ...emptyNotes,
      decisions: ["Ship the action-pack this week", "  "],
      buyingSignals: { objections: [], nextSteps: ["Paul writes the PRD"], competitors: [] },
    };
    const out = deriveMeetingActions(notes, internalCtx);
    const recap = out.find((a) => a.id === "draft-recap");
    expect(recap).toBeDefined();
    expect(recap!.kind).toBe("draft_recap");
    expect(recap!.prompt).toContain("Ship the action-pack this week");
    expect(recap!.prompt).toContain("Paul writes the PRD");
    expect(recap!.prompt).not.toContain(";  ;"); // blank decision trimmed out
    // internal meeting never proposes a sales send-followup
    expect(out.find((a) => a.id === "send-followup")).toBeUndefined();
  });

  it("gives an internal meeting a recap from the draft alone when no decisions/steps were captured", () => {
    const out = deriveMeetingActions(emptyNotes, internalCtx);
    const recap = out.find((a) => a.id === "draft-recap");
    expect(recap).toBeDefined();
    expect(recap!.prompt).toBe("Draft a short internal recap message for the team summarizing this meeting.");
  });

  it("does not expand individual next-steps on an internal meeting (folded into the recap)", () => {
    const notes: MeetingActionInput = {
      ...emptyNotes,
      buyingSignals: { objections: [], nextSteps: ["a", "b"], competitors: [] },
    };
    const out = deriveMeetingActions(notes, internalCtx);
    expect(out.filter((a) => a.id.startsWith("next-step-"))).toHaveLength(0);
  });

  it("turns objections and competitors into agent prompts on a sales meeting", () => {
    const notes: MeetingActionInput = {
      ...emptyNotes,
      buyingSignals: {
        objections: ["Too expensive", "No SOC2"],
        nextSteps: [],
        competitors: ["Monaco", "status quo"],
      },
    };
    const out = deriveMeetingActions(notes, { ...salesCtx, hasFollowUpDraft: false });
    const obj = out.find((a) => a.id === "address-objections");
    expect(obj).toMatchObject({ kind: "ask_agent", label: "Address 2 objections" });
    expect(obj!.prompt).toContain("Too expensive");
    expect(obj!.prompt).toContain("No SOC2");
    const comp = out.find((a) => a.id === "competitive-positioning");
    expect(comp).toBeDefined();
    expect(comp!.prompt).toContain("Monaco");
    expect(comp!.prompt).toContain("status quo");
  });

  it("singularizes the objection label for one objection", () => {
    const notes: MeetingActionInput = {
      ...emptyNotes,
      buyingSignals: { objections: ["price"], nextSteps: [], competitors: [] },
    };
    const out = deriveMeetingActions(notes, { hasFollowUpDraft: false, hasContact: true, isInternal: false });
    expect(out.find((a) => a.id === "address-objections")!.label).toBe("Address 1 objection");
  });

  it("expands sales next-steps into per-step agent prompts and truncates long labels", () => {
    const longStep = "Send the security questionnaire and the data-processing addendum to the legal team before Friday close";
    const notes: MeetingActionInput = {
      ...emptyNotes,
      buyingSignals: { objections: [], nextSteps: [longStep, "  ", "Book the technical deep-dive"], competitors: [] },
    };
    const out = deriveMeetingActions(notes, { hasFollowUpDraft: false, hasContact: true, isInternal: false });
    const steps = out.filter((a) => a.id.startsWith("next-step-"));
    expect(steps).toHaveLength(2); // blank dropped
    expect(steps[0].label.length).toBeLessThanOrEqual("Next step: ".length + 80);
    expect(steps[0].label.endsWith("…")).toBe(true);
    expect(steps[0].prompt).toContain(longStep); // full text preserved in the prompt
  });

  it("never returns more than the cap, send-followup ranked first", () => {
    const notes: MeetingActionInput = {
      ...emptyNotes,
      buyingSignals: {
        objections: ["o1"],
        competitors: ["c1"],
        nextSteps: ["s1", "s2", "s3", "s4", "s5", "s6", "s7"],
      },
    };
    const out = deriveMeetingActions(notes, salesCtx);
    expect(out.length).toBeLessThanOrEqual(6);
    expect(out[0].id).toBe("send-followup");
  });
});
