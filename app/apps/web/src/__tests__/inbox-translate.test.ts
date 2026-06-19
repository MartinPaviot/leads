import { describe, it, expect } from "vitest";
import { translate, buildTranslatePrompt, TRANSLATE_LANGUAGES } from "@/lib/inbox/translate";

describe("translate (INBOX-C08)", () => {
  it("builds a prompt naming the target language + the body", () => {
    const p = buildTranslatePrompt("Hello Anna", "French");
    expect(p).toContain("into French");
    expect(p).toContain("Hello Anna");
    expect(p).toMatch(/Preserve the meaning/i);
  });

  it("returns the trimmed translation from the generator", async () => {
    const gen = async () => ({ text: "  Bonjour Anna  " });
    expect((await translate("Hello Anna", "French", gen)).text).toBe("Bonjour Anna");
  });

  it("fails closed on empty input or generator error", async () => {
    const gen = async () => ({ text: "x" });
    expect((await translate("", "French", gen)).text).toBe("");
    expect((await translate("body", "", gen)).text).toBe("");
    const boom = async () => {
      throw new Error("model down");
    };
    expect((await translate("body", "French", boom)).text).toBe("");
  });

  it("offers target languages", () => {
    expect(TRANSLATE_LANGUAGES.length).toBeGreaterThanOrEqual(3);
    expect(TRANSLATE_LANGUAGES.every((l) => l.code && l.label)).toBe(true);
  });
});
