import { describe, expect, it } from "vitest";
import { initialsFor, STOPWORDS, SUFFIX_WORDS } from "../initials";

describe("initialsFor", () => {
  it.each([
    ["Stripe", "ST"],
    ["Forerunner Ventures", "FV"],
    ["Lordstown Motors", "LM"],
    ["TrueFan AI", "TA"],
    ["Hugging Face", "HF"],
  ])("%s → %s (multi-word / two-word base cases)", (input, expected) => {
    expect(initialsFor(input)).toBe(expected);
  });

  it.each([
    ["X", "X"],
    ["AI", "AI"],
  ])("%s → %s (short name rendered verbatim)", (input, expected) => {
    expect(initialsFor(input)).toBe(expected);
  });

  it.each([
    ["The Hershey Company", "HE"],
    ["La Poste", "PO"],
    ["Le Monde", "MO"],
    ["El Corte Ingles", "CI"],
    ["A & B Holdings", "B"],
  ])("%s → %s (stopword + suffix stripping)", (input, expected) => {
    expect(initialsFor(input)).toBe(expected);
  });

  it("strips all suffixes from long corporate names", () => {
    expect(initialsFor("Acme Corp. Holdings Ltd.")).toBe("AC");
  });

  it("falls back to original tokens when filtering removes everything", () => {
    expect(initialsFor("The The")).toBe("TT");
    expect(initialsFor("Inc Co")).toBe("IC");
  });

  it("returns ? for empty / whitespace-only input", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
  });

  it("handles null-ish gracefully", () => {
    expect(initialsFor(null as unknown as string)).toBe("?");
    expect(initialsFor(undefined as unknown as string)).toBe("?");
  });

  it("preserves non-ASCII and uppercases correctly", () => {
    expect(initialsFor("Societe Generale")).toBe("SG");
    expect(initialsFor("Renault")).toBe("RE");
  });

  it("is case-insensitive for stopword / suffix matching", () => {
    expect(initialsFor("THE Boeing COMPANY")).toBe("BO");
  });

  it("exports STOPWORDS and SUFFIX_WORDS sets", () => {
    expect(STOPWORDS.has("the")).toBe(true);
    expect(STOPWORDS.has("Stripe")).toBe(false);
    expect(SUFFIX_WORDS.has("inc")).toBe(true);
    expect(SUFFIX_WORDS.has("inc.")).toBe(true);
    expect(SUFFIX_WORDS.has("gmbh")).toBe(true);
  });
});
