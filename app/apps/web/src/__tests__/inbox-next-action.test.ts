import { describe, it, expect } from "vitest";
import { suggestNextAction } from "@/lib/inbox/next-action";

describe("suggestNextAction (INBOX-G05)", () => {
  it("lets the situation override the stage default", () => {
    expect(suggestNextAction("proposal", "objection").action).toBe("Address the objection");
    expect(suggestNextAction("qualified", "no_reply").action).toBe("Follow up");
    expect(suggestNextAction("lead", "meeting_set").action).toBe("Prepare for the meeting");
  });

  it("maps the stage to a concrete next action when replied", () => {
    expect(suggestNextAction("qualified", "replied").action).toBe("Book a demo");
    expect(suggestNextAction("proposal", "replied").action).toBe("Send the contract");
    expect(suggestNextAction("negotiation", "replied").action).toContain("terms");
  });

  it("always carries a cited why and falls back gracefully", () => {
    const a = suggestNextAction("unknown_stage", "replied");
    expect(a.action).toBeTruthy();
    expect(a.why).toBeTruthy();
  });
});
