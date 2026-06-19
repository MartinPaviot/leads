import { describe, it, expect } from "vitest";
import {
  levenshtein,
  editDistance,
  factCoverage,
  trapFactHits,
  instructionAdherence,
  summaryCitationAccuracy,
} from "@/lib/evals/inbox-metrics";

describe("levenshtein / editDistance", () => {
  it("is 0 for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(editDistance("abc", "abc")).toBe(0);
  });
  it("counts single edits", () => {
    expect(levenshtein("cat", "car")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
  });
  it("normalizes to [0,1]", () => {
    expect(editDistance("", "")).toBe(0);
    expect(editDistance("abcd", "wxyz")).toBe(1);
    expect(editDistance("kitten", "sitting")).toBeCloseTo(3 / 7, 5);
  });
});

describe("factCoverage / trapFactHits", () => {
  it("coverage is the fraction of facts present (case-insensitive)", () => {
    expect(factCoverage("The price is 40000 in March", ["40000", "March"])).toBe(1);
    expect(factCoverage("The price is 40000", ["40000", "March"])).toBe(0.5);
    expect(factCoverage("anything", [])).toBe(1);
  });
  it("trapFactHits counts leaked forbidden facts", () => {
    expect(trapFactHits("It costs 50000", ["50000", "April"])).toBe(1);
    expect(trapFactHits("It costs 40000", ["50000", "April"])).toBe(0);
  });
});

describe("instructionAdherence", () => {
  it("shorter / longer compare lengths", () => {
    expect(instructionAdherence("a long sentence here", "short", { kind: "shorter" })).toBe(true);
    expect(instructionAdherence("short", "a long sentence here", { kind: "shorter" })).toBe(false);
    expect(instructionAdherence("short", "a long sentence here", { kind: "longer" })).toBe(true);
  });
  it("contains / excludes check substrings", () => {
    expect(instructionAdherence("x", "see cal.com/sam", { kind: "contains", value: "cal.com/sam" })).toBe(true);
    expect(instructionAdherence("x", "no link", { kind: "contains", value: "cal.com/sam" })).toBe(false);
    expect(instructionAdherence("x", "no discount here is gone", { kind: "excludes", value: "15 percent" })).toBe(true);
    expect(instructionAdherence("x", "we offer 15 percent off", { kind: "excludes", value: "15 percent" })).toBe(false);
  });
});

describe("summaryCitationAccuracy", () => {
  it("is the fraction of in-range cited indices", () => {
    expect(summaryCitationAccuracy([0, 1], 3)).toBe(1);
    expect(summaryCitationAccuracy([0, 5], 3)).toBe(0.5);
    expect(summaryCitationAccuracy([], 3)).toBe(1);
  });
});
