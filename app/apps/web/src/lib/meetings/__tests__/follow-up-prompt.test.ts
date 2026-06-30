import { describe, it, expect } from "vitest";
import { buildFollowUpPrompt, type FollowUpPromptInput } from "../follow-up-prompt";

const base: Omit<FollowUpPromptInput, "internal"> = {
  meetingTitle: "Sync with Paul",
  date: "2026-03-15",
  contactContext: "Recipient: Sarah Chen\n",
  summary: "Discussed the roadmap",
  keyPoints: ["liked the reporting"],
  actionItems: [{ task: "ship X", owner: "Paul", deadline: "Friday" }],
  nextSteps: ["align on pricing"],
  decisions: ["ship X next week"],
};

describe("buildFollowUpPrompt", () => {
  it("sales register frames it as a follow-up after a sales meeting", () => {
    const p = buildFollowUpPrompt({ ...base, internal: false });
    expect(p).toContain("follow-up email after this sales meeting");
    expect(p).toContain("- ship X (owner: Paul) — by Friday");
    expect(p).toContain("Recipient: Sarah Chen");
    expect(p).not.toContain("INTERNAL recap");
  });

  it("internal register is a recap note, not a sales email", () => {
    const p = buildFollowUpPrompt({ ...base, internal: true });
    expect(p).toContain("INTERNAL recap note");
    expect(p).toContain("DECISIONS MADE:");
    expect(p).toContain("- ship X next week");
    expect(p).toContain("- ship X (owner: Paul) — by Friday");
    expect(p).not.toContain("sales meeting");
    expect(p).not.toContain("<example>"); // no sales-email example block
  });

  it("handles empty lists in both registers", () => {
    const empty = { ...base, keyPoints: [], actionItems: [], nextSteps: [], decisions: [] };
    expect(buildFollowUpPrompt({ ...empty, internal: true })).toContain("None recorded");
    expect(buildFollowUpPrompt({ ...empty, internal: false })).toContain("None");
  });
});
