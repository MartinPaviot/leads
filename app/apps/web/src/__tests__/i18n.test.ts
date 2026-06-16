import { describe, it, expect } from "vitest";
import { translate, messages, DEFAULT_LOCALE } from "@/lib/i18n/messages";

describe("translate", () => {
  it("returns the locale string when present", () => {
    expect(translate(messages, "en", "common.networkError")).toBe("Network error");
    expect(translate(messages, "fr", "common.networkError")).toBe("Erreur réseau");
  });

  it("falls back to FR for a key missing in EN", () => {
    const dict = {
      fr: { "x.only": "valeur FR" },
      en: {} as Record<string, string>,
    };
    expect(translate(dict, "en", "x.only")).toBe("valeur FR");
  });

  it("falls back to the key itself when unknown everywhere", () => {
    expect(translate(messages, "en", "nope.missing")).toBe("nope.missing");
  });

  it("interpolates {vars}", () => {
    const dict = { fr: { greet: "Bonjour {name}" }, en: { greet: "Hello {name}" } };
    expect(translate(dict, "en", "greet", { name: "Sam" })).toBe("Hello Sam");
    expect(translate(dict, "en", "greet", { name: 7 })).toBe("Hello 7");
  });

  it("leaves an unmatched placeholder intact", () => {
    const dict = { fr: { g: "{a}-{b}" }, en: { g: "{a}-{b}" } };
    expect(translate(dict, "en", "g", { a: "x" })).toBe("x-{b}");
  });

  it("defaults to FR (the current UI)", () => {
    expect(DEFAULT_LOCALE).toBe("fr");
  });
});
