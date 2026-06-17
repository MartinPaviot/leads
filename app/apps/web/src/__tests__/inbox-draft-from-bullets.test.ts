import { describe, it, expect } from "vitest";
import { draftFromBullets, buildDraftPrompt } from "@/lib/inbox/draft-from-bullets";

describe("draftFromBullets (INBOX-C07)", () => {
  it("builds a prompt with the bullets and optional context", () => {
    const p = buildDraftPrompt("- intro\n- pricing\n- next step", "follow-up after demo");
    expect(p).toContain("- pricing");
    expect(p).toContain("Context: follow-up after demo");
    expect(p).toMatch(/invent no new facts/i);
  });

  it("returns a trimmed subject + body from the generator", async () => {
    const gen = async () => ({ subject: "  Next steps  ", text: "  Hi — here's the plan.  " });
    const r = await draftFromBullets("- a\n- b", undefined, gen);
    expect(r.subject).toBe("Next steps");
    expect(r.text).toBe("Hi — here's the plan.");
  });

  it("fails closed on empty bullets or generator error", async () => {
    const gen = async () => ({ subject: "x", text: "y" });
    expect(await draftFromBullets("", undefined, gen)).toEqual({ subject: "", text: "" });
    const boom = async () => {
      throw new Error("model down");
    };
    expect(await draftFromBullets("- a", undefined, boom)).toEqual({ subject: "", text: "" });
  });
});
