import { describe, expect, it } from "vitest";
import {
  computeIcpFit,
  evaluateCriterion,
  resolvePrimaryIcp,
  type Criterion,
} from "@/lib/icp/criteria-engine";

function crit(partial: Partial<Criterion> & Pick<Criterion, "fieldKey" | "operator">): Criterion {
  return {
    id: partial.id ?? `${partial.fieldKey}-${partial.operator}`,
    value: partial.value ?? null,
    weight: partial.weight ?? 1,
    isRequired: partial.isRequired ?? false,
    ...partial,
  };
}

describe("evaluateCriterion — ampersand & geography-token resilience", () => {
  it("matches industry across '&' vs 'and'", () => {
    // Apollo: "information technology & services"; criterion: "...and..."
    expect(
      evaluateCriterion(
        crit({
          fieldKey: "industry",
          operator: "in",
          value: ["Information Technology and Services"],
        }),
        { industry: "information technology & services" },
      ),
    ).toBe(true);
  });
  it("matches a region criterion against the company's state token", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "geography", operator: "in", value: ["Vaud", "Geneva", "Zug", "Zurich"] }),
        { geography: ["Geneva", "Genève", "Switzerland"] },
      ),
    ).toBe(true);
  });
  it("rejects geography when no token is in the allowed region set", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "geography", operator: "in", value: ["Vaud", "Geneva"] }),
        { geography: ["Zurich", "Switzerland"] },
      ),
    ).toBe(false);
  });
  it("matches geography across accents (Apollo 'Ile-de-France' vs 'Île-de-France')", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "geography", operator: "in", value: ["Île-de-France", "Neuchâtel"] }),
        { geography: ["Ile-de-France", "France"] },
      ),
    ).toBe(true);
  });
});

describe("evaluateCriterion — eq", () => {
  it("matches a scalar field case-insensitively", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "industry", operator: "eq", value: "SaaS" }), {
        industry: "saas",
      }),
    ).toBe(true);
  });
  it("matches when the field is an array containing the value", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "keywords", operator: "eq", value: "cloud" }), {
        keywords: ["Cloud", "DevOps"],
      }),
    ).toBe(true);
  });
  it("rejects a non-match", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "industry", operator: "eq", value: "fintech" }), {
        industry: "saas",
      }),
    ).toBe(false);
  });
});

describe("evaluateCriterion — in", () => {
  it("matches when company value is in the allowed set", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "latest_funding_stage", operator: "in", value: ["seed", "series_a"] }),
        { latest_funding_stage: "Series A" },
      ),
    ).toBe(true);
  });
  it("matches when company array intersects the allowed set", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "technologies", operator: "in", value: ["kubernetes", "terraform"] }),
        { technologies: ["React", "Kubernetes"] },
      ),
    ).toBe(true);
  });
  it("rejects on empty intersection", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "technologies", operator: "in", value: ["kubernetes"] }),
        { technologies: ["React", "Vue"] },
      ),
    ).toBe(false);
  });
});

describe("evaluateCriterion — numeric gt/gte/lt/lte", () => {
  it("gte matches at the boundary", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "employee_count", operator: "gte", value: 50 }), {
        employee_count: 50,
      }),
    ).toBe(true);
  });
  it("gt is strict at the boundary", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "employee_count", operator: "gt", value: 50 }), {
        employee_count: 50,
      }),
    ).toBe(false);
  });
  it("coerces numeric strings", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "revenue", operator: "gte", value: "1000000" }), {
        revenue: "2000000",
      }),
    ).toBe(true);
  });
  it("rejects when the field is missing", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "revenue", operator: "gt", value: 0 }), {}),
    ).toBe(false);
  });
});

describe("evaluateCriterion — between", () => {
  it("matches inside the range inclusive", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "employee_count", operator: "between", value: { min: 50, max: 200 } }),
        { employee_count: 120 },
      ),
    ).toBe(true);
  });
  it("rejects below min", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "employee_count", operator: "between", value: { min: 50, max: 200 } }),
        { employee_count: 10 },
      ),
    ).toBe(false);
  });
  it("supports an open-ended upper bound (min only)", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "employee_count", operator: "between", value: { min: 1000 } }),
        { employee_count: 5000 },
      ),
    ).toBe(true);
  });
  it("is vacuously false when neither bound is set (misconfig)", () => {
    expect(
      evaluateCriterion(
        crit({ fieldKey: "employee_count", operator: "between", value: {} }),
        { employee_count: 5000 },
      ),
    ).toBe(false);
  });
});

describe("evaluateCriterion — contains", () => {
  it("substring on text", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "name", operator: "contains", value: "labs" }), {
        name: "Acme Labs Inc",
      }),
    ).toBe(true);
  });
  it("array element substring", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "keywords", operator: "contains", value: "secur" }), {
        keywords: ["Cybersecurity", "Cloud"],
      }),
    ).toBe(true);
  });
});

describe("evaluateCriterion — exists", () => {
  it("exists:true matches a present non-empty field", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "investor_names", operator: "exists", value: true }), {
        investor_names: ["Sequoia"],
      }),
    ).toBe(true);
  });
  it("exists:true rejects an empty array", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "investor_names", operator: "exists", value: true }), {
        investor_names: [],
      }),
    ).toBe(false);
  });
  it("exists:false matches an absent field", () => {
    expect(
      evaluateCriterion(crit({ fieldKey: "investor_names", operator: "exists", value: false }), {}),
    ).toBe(true);
  });
});

describe("computeIcpFit — soft weighting", () => {
  it("scores the matched-weight fraction", () => {
    // two soft criteria weight 1 + 3; only the weight-3 matches → 0.75
    const result = computeIcpFit(
      [
        crit({ id: "a", fieldKey: "industry", operator: "eq", value: "fintech", weight: 1 }),
        crit({ id: "b", fieldKey: "technologies", operator: "in", value: ["kubernetes"], weight: 3 }),
      ],
      { industry: "saas", technologies: ["Kubernetes"] },
    );
    expect(result.fitScore).toBeCloseTo(0.75, 5);
    expect(result.matched).toEqual(["b"]);
    expect(result.unmatched).toEqual(["a"]);
    expect(result.excludedBy).toBeNull();
  });

  it("scores 1.0 when all soft criteria match", () => {
    const result = computeIcpFit(
      [
        crit({ id: "a", fieldKey: "industry", operator: "eq", value: "saas" }),
        crit({ id: "b", fieldKey: "employee_count", operator: "gte", value: 50 }),
      ],
      { industry: "saas", employee_count: 200 },
    );
    expect(result.fitScore).toBe(1);
  });

  it("scores 0 when no soft criteria match", () => {
    const result = computeIcpFit(
      [crit({ id: "a", fieldKey: "industry", operator: "eq", value: "fintech" })],
      { industry: "saas" },
    );
    expect(result.fitScore).toBe(0);
  });
});

describe("computeIcpFit — required (hard filter)", () => {
  it("zeroes the fit when a required criterion is unmatched", () => {
    const result = computeIcpFit(
      [
        crit({ id: "req", fieldKey: "geography", operator: "in", value: ["FR"], isRequired: true }),
        crit({ id: "soft", fieldKey: "industry", operator: "eq", value: "saas", weight: 1 }),
      ],
      { geography: "US", industry: "saas" },
    );
    expect(result.fitScore).toBe(0);
    expect(result.excludedBy).toBe("req");
  });

  it("scores the soft fraction when all required criteria match", () => {
    const result = computeIcpFit(
      [
        crit({ id: "req", fieldKey: "geography", operator: "in", value: ["FR"], isRequired: true }),
        crit({ id: "soft1", fieldKey: "industry", operator: "eq", value: "saas", weight: 1 }),
        crit({ id: "soft2", fieldKey: "employee_count", operator: "gte", value: 1000, weight: 1 }),
      ],
      { geography: "FR", industry: "saas", employee_count: 50 },
    );
    // required matched; one of two soft matched → 0.5
    expect(result.fitScore).toBe(0.5);
    expect(result.excludedBy).toBeNull();
  });

  it("scores 1.0 for required-only ICP when all required match", () => {
    const result = computeIcpFit(
      [crit({ id: "req", fieldKey: "geography", operator: "in", value: ["FR"], isRequired: true })],
      { geography: "FR" },
    );
    expect(result.fitScore).toBe(1);
  });

  it("records the FIRST unmatched required as excludedBy", () => {
    const result = computeIcpFit(
      [
        crit({ id: "r1", fieldKey: "geography", operator: "in", value: ["FR"], isRequired: true }),
        crit({ id: "r2", fieldKey: "industry", operator: "eq", value: "saas", isRequired: true }),
      ],
      { geography: "US", industry: "fintech" },
    );
    expect(result.excludedBy).toBe("r1");
  });
});

describe("computeIcpFit — degenerate", () => {
  it("empty criteria → fit 0", () => {
    expect(computeIcpFit([], { industry: "saas" }).fitScore).toBe(0);
  });
});

describe("resolvePrimaryIcp", () => {
  it("returns null when nothing clears the threshold", () => {
    expect(
      resolvePrimaryIcp([{ icpId: "a", priority: 0, fitScore: 0.3 }], 0.5),
    ).toBeNull();
  });

  it("picks the highest-priority (lowest number) eligible ICP", () => {
    const result = resolvePrimaryIcp(
      [
        { icpId: "low", priority: 100, fitScore: 0.95 },
        { icpId: "high", priority: 0, fitScore: 0.6 },
      ],
      0.5,
    );
    expect(result?.icpId).toBe("high");
  });

  it("breaks priority ties by higher fit", () => {
    const result = resolvePrimaryIcp(
      [
        { icpId: "a", priority: 10, fitScore: 0.6 },
        { icpId: "b", priority: 10, fitScore: 0.9 },
      ],
      0.5,
    );
    expect(result?.icpId).toBe("b");
  });

  it("ignores below-threshold cells even if higher priority", () => {
    const result = resolvePrimaryIcp(
      [
        { icpId: "high-but-low-fit", priority: 0, fitScore: 0.2 },
        { icpId: "low-but-fits", priority: 50, fitScore: 0.8 },
      ],
      0.5,
    );
    expect(result?.icpId).toBe("low-but-fits");
  });

  it("returns null on empty cell list", () => {
    expect(resolvePrimaryIcp([], 0.5)).toBeNull();
  });
});
