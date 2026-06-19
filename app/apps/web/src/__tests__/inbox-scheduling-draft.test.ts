import { describe, it, expect } from "vitest";
import {
  draftSchedulingEmail,
  buildSchedulingPrompt,
  type SchedulingDraft,
} from "@/lib/inbox/scheduling-draft";

const slots = ["Tue Jun 23, 2:00pm CET", "Wed Jun 24, 10:00am CET"];

describe("scheduling-draft (INBOX-C10)", () => {
  it("builds a prompt listing exactly the given slots + context", () => {
    const p = buildSchedulingPrompt(slots, "follow-up after the demo");
    expect(p).toContain("- Tue Jun 23, 2:00pm CET");
    expect(p).toContain("- Wed Jun 24, 10:00am CET");
    expect(p).toContain("Context: follow-up after the demo.");
    expect(p).toContain("Propose ONLY these slots");
  });

  it("maps + trims a generator result", async () => {
    const gen = async (): Promise<SchedulingDraft> => ({ subject: "  Quick call?  ", text: "  Does Tue work?  " });
    const d = await draftSchedulingEmail(slots, undefined, gen);
    expect(d).toEqual({ subject: "Quick call?", text: "Does Tue work?" });
  });

  it("returns empty for no usable slots (composer unchanged)", async () => {
    const gen = async (): Promise<SchedulingDraft> => ({ subject: "x", text: "y" });
    expect(await draftSchedulingEmail([], undefined, gen)).toEqual({ subject: "", text: "" });
    expect(await draftSchedulingEmail(["  ", ""], undefined, gen)).toEqual({ subject: "", text: "" });
  });

  it("fails closed on a generator error", async () => {
    const boom = async (): Promise<SchedulingDraft> => {
      throw new Error("model down");
    };
    expect(await draftSchedulingEmail(slots, undefined, boom)).toEqual({ subject: "", text: "" });
  });
});
