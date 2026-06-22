import { describe, it, expect } from "vitest";
import { toQualityScoreColumn, compositeFromColumn } from "@/lib/evals/quality-score-column";

describe("toQualityScoreColumn — P1-12 null-safe mapping", () => {
  it("null/undefined/NaN composite → null column (stays NULL, excluded from back-test)", () => {
    expect(toQualityScoreColumn(null)).toBeNull();
    expect(toQualityScoreColumn(undefined)).toBeNull();
    expect(toQualityScoreColumn(Number.NaN)).toBeNull();
    expect(toQualityScoreColumn(Infinity)).toBeNull();
  });

  it("a number → { composite }", () => {
    expect(toQualityScoreColumn(0.82)).toEqual({ composite: 0.82 });
    expect(toQualityScoreColumn(0)).toEqual({ composite: 0 });
  });

  it("attaches extras only when provided; semantic kept even when null", () => {
    expect(
      toQualityScoreColumn(0.7, { personalizationDet: 0.6, personalizationSemantic: 0.4, framework: "basho" }),
    ).toEqual({ composite: 0.7, personalizationDet: 0.6, personalizationSemantic: 0.4, framework: "basho" });

    // semantic explicitly null = judge didn't run → kept as null
    expect(toQualityScoreColumn(0.7, { personalizationSemantic: null })).toEqual({
      composite: 0.7,
      personalizationSemantic: null,
    });

    // absent extras stay absent
    expect(toQualityScoreColumn(0.7, { personalizationDet: undefined as unknown as number })).toEqual({
      composite: 0.7,
    });
  });
});

describe("compositeFromColumn — tolerant read", () => {
  it("object shape → composite", () => {
    expect(compositeFromColumn({ composite: 0.9, framework: "x" })).toBe(0.9);
  });
  it("legacy bare number → itself", () => {
    expect(compositeFromColumn(0.55)).toBe(0.55);
  });
  it("junk / missing / non-finite → null", () => {
    expect(compositeFromColumn(null)).toBeNull();
    expect(compositeFromColumn(undefined)).toBeNull();
    expect(compositeFromColumn({ nope: 1 })).toBeNull();
    expect(compositeFromColumn({ composite: "0.5" })).toBeNull();
    expect(compositeFromColumn({ composite: Infinity })).toBeNull();
    expect(compositeFromColumn("0.5")).toBeNull();
  });
});
