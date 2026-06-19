import { describe, it, expect } from "vitest";
import { suggestStageAdvance } from "@/lib/inbox/advance-deal";

const ORDER = ["lead", "qualified", "proposal", "negotiation", "won", "lost"];

describe("suggestStageAdvance (INBOX-G09)", () => {
  it("advances one stage on a buying signal", () => {
    const d = suggestStageAdvance({ currentStage: "qualified", replyIntent: "meeting_request", stageOrder: ORDER });
    expect(d.advance).toBe(true);
    expect(d.suggestedStage).toBe("proposal");
  });

  it("never auto-advances into a terminal won/lost", () => {
    const d = suggestStageAdvance({ currentStage: "negotiation", replyIntent: "interested", stageOrder: ORDER });
    expect(d.advance).toBe(false);
    expect(d.reason).toContain("human decision");
  });

  it("suggests (but does not apply) lost on not_interested", () => {
    const d = suggestStageAdvance({ currentStage: "proposal", replyIntent: "not_interested", stageOrder: ORDER });
    expect(d.advance).toBe(false);
    expect(d.suggestedStage).toBe("lost");
  });

  it("holds the stage on an objection", () => {
    const d = suggestStageAdvance({ currentStage: "proposal", replyIntent: "objection", stageOrder: ORDER });
    expect(d.advance).toBe(false);
    expect(d.suggestedStage).toBe("proposal");
  });

  it("leaves the stage unchanged with no buying signal", () => {
    expect(suggestStageAdvance({ currentStage: "lead", replyIntent: "thank_you", stageOrder: ORDER }).advance).toBe(false);
  });
});
