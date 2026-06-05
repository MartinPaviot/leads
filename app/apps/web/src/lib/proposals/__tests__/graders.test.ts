import { describe, it, expect } from "vitest";
import { gradeDetectionCoverage, gradePlaceholders, gradeCalibration } from "../eval/graders";

describe("gradeDetectionCoverage", () => {
  it("scores full coverage with fuzzy label matching", () => {
    const r = gradeDetectionCoverage(
      ["Executive Summary", "Pricing"],
      ["executive  summary", "Pricing", "About Us"],
    );
    expect(r.coverage).toBe(1);
    expect(r.missing).toEqual([]);
  });

  it("reports missing expected sections", () => {
    const r = gradeDetectionCoverage(["Executive Summary", "Timeline"], ["Executive Summary"]);
    expect(r.coverage).toBe(0.5);
    expect(r.missing).toEqual(["Timeline"]);
  });
});

describe("gradePlaceholders", () => {
  it("flags leaked placeholders / undefined / TODO", () => {
    const r = gradePlaceholders([
      { content: "Clean prose grounded in the call." },
      { content: "Pricing is {{amount}} per month." },
      { content: "Owner: undefined" },
      { content: "TODO: add scope" },
    ]);
    expect(r.clean).toBe(false);
    expect(r.offenders).toEqual([1, 2, 3]);
  });

  it("passes clean output", () => {
    expect(gradePlaceholders([{ content: "All good here." }])).toEqual({ clean: true, offenders: [] });
  });
});

describe("gradeCalibration", () => {
  it("flags high confidence without a citation and abstained-with-content", () => {
    const r = gradeCalibration([
      { confidence: "high", citations: [{ id: "A1" }], abstained: false, content: "ok" },
      { confidence: "high", citations: [], abstained: false, content: "bold claim" },
      { confidence: "low", citations: [], abstained: true, content: "should be empty" },
    ]);
    expect(r.ok).toBe(false);
    expect(r.issues).toEqual([
      { index: 1, issue: "high_without_citation" },
      { index: 2, issue: "abstained_with_content" },
    ]);
  });

  it("passes a well-calibrated set", () => {
    const r = gradeCalibration([
      { confidence: "high", citations: [{ id: "A1" }], abstained: false, content: "grounded" },
      { confidence: "low", citations: [], abstained: true, content: "" },
    ]);
    expect(r.ok).toBe(true);
  });
});
