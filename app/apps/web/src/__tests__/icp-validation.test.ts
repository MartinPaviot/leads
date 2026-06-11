import { describe, expect, it } from "vitest";
import { validateIcpInput, type CatalogEntry } from "@/lib/icp/validation";

const CATALOG: CatalogEntry[] = [
  { fieldKey: "industry", operators: ["in", "eq"], valueType: "multi_select" },
  { fieldKey: "employee_count", operators: ["between", "gte", "lte"], valueType: "range" },
  { fieldKey: "geography", operators: ["in"], valueType: "multi_select" },
  { fieldKey: "investor_names", operators: ["in", "contains", "exists"], valueType: "multi_select" },
];

describe("validateIcpInput — name / status / priority", () => {
  it("accepts a minimal valid ICP (name only)", () => {
    const r = validateIcpInput({ name: "SaaS scale-up" }, CATALOG);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("SaaS scale-up");
      expect(r.value.status).toBe("draft");
      expect(r.value.priority).toBe(100);
      expect(r.value.criteria).toEqual([]);
    }
  });

  it("rejects empty / whitespace name", () => {
    expect(validateIcpInput({ name: "   " }, CATALOG).ok).toBe(false);
    expect(validateIcpInput({}, CATALOG).ok).toBe(false);
  });

  it("rejects name > 120 chars", () => {
    expect(validateIcpInput({ name: "x".repeat(121) }, CATALOG).ok).toBe(false);
  });

  it("trims the name", () => {
    const r = validateIcpInput({ name: "  Fintech  " }, CATALOG);
    if (r.ok) expect(r.value.name).toBe("Fintech");
  });

  it("rejects an invalid status", () => {
    expect(validateIcpInput({ name: "X", status: "live" }, CATALOG).ok).toBe(false);
  });

  it("accepts each valid status (active needs >= 1 criterion since Phase 0)", () => {
    // R8.1 (_specs/icp-unification): an ACTIVE ICP with zero criteria is
    // rejected — it matches nothing and accumulates as an inert shell.
    const criterion = { fieldKey: "industry", operator: "in", value: ["SaaS"] };
    for (const s of ["draft", "active", "archived"]) {
      const input =
        s === "active" ? { name: "X", status: s, criteria: [criterion] } : { name: "X", status: s };
      expect(validateIcpInput(input, CATALOG).ok).toBe(true);
    }
    expect(validateIcpInput({ name: "X", status: "active" }, CATALOG).ok).toBe(false);
  });

  it("rejects negative / non-integer priority", () => {
    expect(validateIcpInput({ name: "X", priority: -1 }, CATALOG).ok).toBe(false);
    expect(validateIcpInput({ name: "X", priority: 1.5 }, CATALOG).ok).toBe(false);
  });
});

describe("validateIcpInput — criteria against catalog", () => {
  it("accepts a well-formed in criterion", () => {
    const r = validateIcpInput(
      { name: "X", criteria: [{ fieldKey: "industry", operator: "in", value: ["Computer Software"] }] },
      CATALOG,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.criteria[0]).toEqual({
        fieldKey: "industry",
        operator: "in",
        value: ["Computer Software"],
        weight: 1,
        isRequired: false,
      });
    }
  });

  it("rejects an unknown field", () => {
    const r = validateIcpInput(
      { name: "X", criteria: [{ fieldKey: "nope", operator: "in", value: ["a"] }] },
      CATALOG,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/unknown field/);
  });

  it("rejects an operator not allowed for the field", () => {
    const r = validateIcpInput(
      // geography only allows 'in', not 'gt'
      { name: "X", criteria: [{ fieldKey: "geography", operator: "gt", value: 5 }] },
      CATALOG,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not allowed for field/);
  });

  it("rejects 'in' with a non-array value", () => {
    const r = validateIcpInput(
      { name: "X", criteria: [{ fieldKey: "industry", operator: "in", value: "SaaS" }] },
      CATALOG,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/non-empty array/);
  });

  it("rejects 'in' with an empty array", () => {
    expect(
      validateIcpInput(
        { name: "X", criteria: [{ fieldKey: "industry", operator: "in", value: [] }] },
        CATALOG,
      ).ok,
    ).toBe(false);
  });

  it("accepts 'between' with {min,max}", () => {
    const r = validateIcpInput(
      { name: "X", criteria: [{ fieldKey: "employee_count", operator: "between", value: { min: 50, max: 500 } }] },
      CATALOG,
    );
    expect(r.ok).toBe(true);
  });

  it("accepts 'between' with only min (open-ended)", () => {
    expect(
      validateIcpInput(
        { name: "X", criteria: [{ fieldKey: "employee_count", operator: "between", value: { min: 1000 } }] },
        CATALOG,
      ).ok,
    ).toBe(true);
  });

  it("rejects 'between' with neither bound", () => {
    const r = validateIcpInput(
      { name: "X", criteria: [{ fieldKey: "employee_count", operator: "between", value: {} }] },
      CATALOG,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/at least one of min/);
  });

  it("rejects 'between' with a non-object value", () => {
    expect(
      validateIcpInput(
        { name: "X", criteria: [{ fieldKey: "employee_count", operator: "between", value: [50, 500] }] },
        CATALOG,
      ).ok,
    ).toBe(false);
  });

  it("accepts 'exists' with a boolean", () => {
    expect(
      validateIcpInput(
        { name: "X", criteria: [{ fieldKey: "investor_names", operator: "exists", value: true }] },
        CATALOG,
      ).ok,
    ).toBe(true);
  });

  it("rejects 'exists' with a non-boolean", () => {
    expect(
      validateIcpInput(
        { name: "X", criteria: [{ fieldKey: "investor_names", operator: "exists", value: "yes" }] },
        CATALOG,
      ).ok,
    ).toBe(false);
  });

  it("rejects negative weight", () => {
    const r = validateIcpInput(
      { name: "X", criteria: [{ fieldKey: "industry", operator: "in", value: ["a"], weight: -2 }] },
      CATALOG,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/weight/);
  });

  it("carries weight + isRequired through", () => {
    const r = validateIcpInput(
      { name: "X", criteria: [{ fieldKey: "geography", operator: "in", value: ["FR"], weight: 2, isRequired: true }] },
      CATALOG,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.criteria[0].weight).toBe(2);
      expect(r.value.criteria[0].isRequired).toBe(true);
    }
  });

  it("reports the criterion index in the error", () => {
    const r = validateIcpInput(
      {
        name: "X",
        criteria: [
          { fieldKey: "industry", operator: "in", value: ["SaaS"] },
          { fieldKey: "bogus", operator: "in", value: ["x"] },
        ],
      },
      CATALOG,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/criterion 1/);
  });

  it("rejects criteria that is not an array", () => {
    expect(validateIcpInput({ name: "X", criteria: "nope" }, CATALOG).ok).toBe(false);
  });
});
