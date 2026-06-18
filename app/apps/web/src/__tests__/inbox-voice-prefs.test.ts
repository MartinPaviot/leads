import { describe, it, expect } from "vitest";
import { buildVoicePrompt, normalizeTone, clampVoice, type VoicePrefs } from "@/lib/inbox/voice-prefs";

describe("voice-prefs (INBOX-O03)", () => {
  it("builds a voice preamble for a tone preset", () => {
    expect(buildVoicePrompt({ tone: "direct" })).toContain("Direct and to the point");
    expect(buildVoicePrompt({ tone: "formal" })).toContain("Formal and precise");
  });

  it("returns an empty preamble for neutral with no custom guidance", () => {
    expect(buildVoicePrompt({ tone: "neutral" })).toBe("");
  });

  it("appends free-form custom guidance after the tone", () => {
    const p = buildVoicePrompt({ tone: "warm", customGuidance: "Use the prospect's first name." });
    expect(p).toContain("Warm and personable");
    expect(p).toContain("Use the prospect's first name.");
  });

  it("custom guidance alone works on a neutral tone", () => {
    expect(buildVoicePrompt({ tone: "neutral", customGuidance: "Always offer a Loom." })).toBe(
      "Write in this voice: Always offer a Loom.",
    );
  });

  it("normalizeTone falls back to neutral on bad input", () => {
    expect(normalizeTone("concise")).toBe("concise");
    expect(normalizeTone("shouty")).toBe("neutral");
    expect(normalizeTone(undefined)).toBe("neutral");
  });

  it("clampVoice normalizes tone, trims/caps custom, drops empty custom", () => {
    const a = clampVoice({ tone: "bogus" as unknown as VoicePrefs["tone"], customGuidance: "  hi  " });
    expect(a).toEqual({ tone: "neutral", customGuidance: "hi" });
    expect(clampVoice({ tone: "warm", customGuidance: "   " })).toEqual({ tone: "warm" });
    expect(clampVoice({ tone: "formal", customGuidance: "x".repeat(400) }).customGuidance?.length).toBe(300);
  });

  it("survives hostile non-string custom guidance without crashing", () => {
    expect(clampVoice({ tone: "warm", customGuidance: 123 as unknown as string })).toEqual({ tone: "warm" });
    expect(clampVoice({ tone: "warm", customGuidance: {} as unknown as string })).toEqual({ tone: "warm" });
  });
});
