import { describe, it, expect } from "vitest";
import { fixGrammar, buildGrammarPrompt, type GrammarFix } from "@/lib/inbox/grammar-fix";

describe("grammar-fix (INBOX-C12)", () => {
  it("builds a prompt that constrains to grammar/spelling only", () => {
    const p = buildGrammarPrompt("i has went their");
    expect(p).toContain("Fix only the grammar, spelling, and punctuation");
    expect(p).toContain("i has went their");
    expect(p).toContain("Do NOT change its meaning");
  });

  it("returns the corrected text and flags corrected=true when it differs", async () => {
    const gen = async (): Promise<{ text: string }> => ({ text: "I have gone there" });
    const r = await fixGrammar("i has went their", gen);
    expect(r).toEqual({ text: "I have gone there", corrected: true });
  });

  it("flags corrected=false when the text is already correct", async () => {
    const gen = async (): Promise<{ text: string }> => ({ text: "All good here." });
    const r = await fixGrammar("All good here.", gen);
    expect(r).toEqual({ text: "All good here.", corrected: false });
  });

  it("keeps the original (corrected=false) on empty input or empty model output", async () => {
    const empty = async (): Promise<{ text: string }> => ({ text: "   " });
    expect(await fixGrammar("keep me", empty)).toEqual({ text: "keep me", corrected: false });
    expect(await fixGrammar("", empty)).toEqual({ text: "", corrected: false });
  });

  it("fails closed on a generator error, returning the original", async () => {
    const boom = async (): Promise<GrammarFix> => {
      throw new Error("model down");
    };
    expect(await fixGrammar("don't lose this", boom as never)).toEqual({ text: "don't lose this", corrected: false });
  });
});
