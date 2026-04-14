import { describe, it, expect } from "vitest";
import {
  filtersFromQuery,
  filtersToQuery,
  operatorsForType,
  validateFilters,
} from "@/lib/filters";

describe("operatorsForType", () => {
  it("returns the expected operators per type", () => {
    expect(operatorsForType("number")).toContain("gte");
    expect(operatorsForType("text")).toContain("contains");
    expect(operatorsForType("multi-select")).toContain("includes-any");
    expect(operatorsForType("date-range")).toContain("between");
    expect(operatorsForType("boolean")).toEqual(["is-true", "is-false"]);
  });
});

describe("validateFilters", () => {
  const fields = [
    { key: "score", label: "Score", type: "number" as const },
    { key: "name", label: "Name", type: "text" as const },
    { key: "industry", label: "Industry", type: "multi-select" as const, options: ["SaaS"] as const },
  ];

  it("accepts well-formed filters", () => {
    const out = validateFilters(
      [{ field: "score", operator: "gte", value: 70 }],
      fields
    );
    expect(out).toEqual({ ok: true });
  });

  it("rejects unknown fields", () => {
    const out = validateFilters(
      [{ field: "bogus", operator: "eq", value: 1 }],
      fields
    );
    expect(out.ok).toBe(false);
  });

  it("rejects mismatched operators per field type", () => {
    const out = validateFilters(
      [{ field: "name", operator: "gte", value: 5 }],
      fields
    );
    expect(out.ok).toBe(false);
  });
});

describe("filtersToQuery / filtersFromQuery round-trip", () => {
  it("serialises a scalar filter", () => {
    const qs = filtersToQuery([
      { field: "score", operator: "gte", value: 70 },
    ]).toString();
    expect(qs).toContain("filter%5Bscore%5D%5Bgte%5D=70");
  });

  it("serialises an array filter as repeated keys", () => {
    const qs = filtersToQuery([
      { field: "industry", operator: "includes-any", value: ["SaaS", "FinTech"] },
    ]);
    const entries = Array.from(qs.entries()).filter(([k]) =>
      k.startsWith("filter[industry]")
    );
    expect(entries).toHaveLength(2);
    expect(entries.map(([, v]) => v)).toEqual(["SaaS", "FinTech"]);
  });

  it("drops null-valued filters on serialisation", () => {
    const qs = filtersToQuery([
      { field: "score", operator: "gte", value: null },
    ]).toString();
    expect(qs).toBe("");
  });

  it("round-trips a mixed set of conditions", () => {
    const original = [
      { field: "score", operator: "gte" as const, value: "70" },
      { field: "industry", operator: "includes-any" as const, value: ["SaaS", "FinTech"] },
    ];
    const qs = filtersToQuery(original);
    const decoded = filtersFromQuery(qs);
    expect(decoded).toHaveLength(2);
    const score = decoded.find((f) => f.field === "score");
    const industry = decoded.find((f) => f.field === "industry");
    expect(score?.value).toBe("70");
    expect(industry?.value).toEqual(["SaaS", "FinTech"]);
  });
});
