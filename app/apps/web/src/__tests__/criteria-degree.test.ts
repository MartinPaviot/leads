import { describe, it, expect } from "vitest";
import { scoreCriterionDegree, computeDepth } from "@/lib/icp/criteria-engine";
import type { Criterion } from "@/lib/icp/criteria-engine";

function crit(p: Partial<Criterion>): Criterion {
  return {
    id: "c",
    fieldKey: "employee_count",
    operator: "between",
    value: { min: 50, max: 250 },
    weight: 1,
    isRequired: false,
    ...p,
  };
}

describe("scoreCriterionDegree (graded depth)", () => {
  const between = crit({});
  it("peaks at the range center and is 0.5 at either edge", () => {
    expect(scoreCriterionDegree(between, { employee_count: 150 })).toBeCloseTo(1.0, 5);
    expect(scoreCriterionDegree(between, { employee_count: 50 })).toBeCloseTo(0.5, 5);
    expect(scoreCriterionDegree(between, { employee_count: 250 })).toBeCloseTo(0.5, 5);
  });
  it("decays past the range to 0 one width beyond the edge", () => {
    expect(scoreCriterionDegree(between, { employee_count: 300 })).toBeCloseTo(0.25, 5);
    expect(scoreCriterionDegree(between, { employee_count: 350 })).toBeCloseTo(0, 5);
    expect(scoreCriterionDegree(between, { employee_count: 1000 })).toBe(0);
  });
  it("returns null when the field has no data", () => {
    expect(scoreCriterionDegree(between, {})).toBeNull();
  });
  it("stays binary for categorical operators", () => {
    const cat = crit({ fieldKey: "industry", operator: "eq", value: "software" });
    expect(scoreCriterionDegree(cat, { industry: "software" })).toBe(1);
    expect(scoreCriterionDegree(cat, { industry: "biotech" })).toBe(0);
  });
});

describe("computeDepth", () => {
  const size = crit({ id: "size" });
  it("separates a center-of-range company from an edge one", () => {
    const center = computeDepth([size], { employee_count: 150 });
    const edge = computeDepth([size], { employee_count: 250 });
    expect(center.depth01).toBeGreaterThan(edge.depth01);
    expect(center.depth01).toBeCloseTo(1.0, 5);
    expect(edge.depth01).toBeCloseTo(0.5, 5);
  });
  it("ignores non-identity (signal) and required criteria", () => {
    const tech = crit({ id: "tech", fieldKey: "technologies", operator: "in", value: ["x"] });
    const req = crit({ id: "req", fieldKey: "geography", operator: "in", value: ["CH"], isRequired: true });
    const r = computeDepth([size, tech, req], {
      employee_count: 150,
      technologies: ["x"],
      geography: ["CH"],
    });
    expect(r.depth01).toBeCloseTo(1.0, 5); // only `size` counts
    expect(r.coverage).toBe(1);
  });
  it("excludes a no-data identity criterion from coverage", () => {
    const geo = crit({ id: "geo", fieldKey: "geography", operator: "in", value: ["CH"] });
    const r = computeDepth([size, geo], { employee_count: 150 }); // geography absent
    expect(r.coverage).toBeCloseTo(0.5, 5);
    expect(r.depth01).toBeCloseTo(1.0, 5);
  });
});
