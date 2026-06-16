import { describe, it, expect } from "vitest";
import { assembleScoreExplanation, criterionFactor } from "@/lib/scoring/score-factors";

describe("criterionFactor", () => {
  it("maps firmographic fields to fit and signal-ish fields to signal", () => {
    expect(criterionFactor("industry")).toEqual({ label: "core sector", kind: "fit" });
    expect(criterionFactor("num_open_jobs")).toEqual({ label: "actively hiring", kind: "signal" });
    expect(criterionFactor("person_seniorities")?.kind).toBe("fit");
  });
  it("returns null for unknown / non-labellable fields", () => {
    expect(criterionFactor("hiring_job_titles")).toBeNull();
    expect(criterionFactor("whatever")).toBeNull();
  });
});

describe("assembleScoreExplanation", () => {
  it("builds an evidence-cited rationale, fresh signal first", () => {
    const out = assembleScoreExplanation({
      grade: "A+",
      matchedFieldKeys: ["industry", "employee_count"],
      freshSignals: [{ label: "hiring a RevOps", ageDays: 12 }],
      reachability: ["reachable"],
      coverage: 1,
    });
    expect(out.grade).toBe("A+");
    expect(out.rationale.startsWith("A+ · hiring a RevOps (")).toBe(true);
    expect(out.rationale).toContain("core sector");
    expect(out.rationale).toContain("reachable");
    expect(out.confidence).toBeGreaterThan(0.9);
  });

  it("dedups a fresh signal against the equivalent matched criterion label", () => {
    const out = assembleScoreExplanation({
      grade: "A",
      matchedFieldKeys: ["industry"],
      freshSignals: [{ label: "core sector" }], // same label as the matched factor
      coverage: 0.8,
    });
    const labels = out.factors.map((f) => f.label);
    expect(labels.filter((l) => l === "core sector")).toHaveLength(1);
  });

  it("skips unlabellable matched fields and survives an empty input", () => {
    const out = assembleScoreExplanation({ grade: "B", matchedFieldKeys: ["hiring_job_titles"], coverage: 0.5 });
    expect(out.factors).toHaveLength(0);
    expect(out.rationale).toBe("B · ICP fit, no recent signal");
  });

  it("propagates low confidence from thin coverage", () => {
    const out = assembleScoreExplanation({ grade: "A", matchedFieldKeys: ["industry"], coverage: 0.3 });
    expect(out.confidence).toBeCloseTo(0.3, 5);
  });
});
