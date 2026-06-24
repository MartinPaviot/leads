import { describe, it, expect } from "vitest";
import {
  computeCanonicalFields,
  projectScalars,
  ACCOUNT_CANONICAL_FIELDS,
  type FieldSourceRow,
} from "../canonical-fields";

const t0 = new Date("2026-01-01T00:00:00Z");
const t1 = new Date("2026-06-01T00:00:00Z");

describe("computeCanonicalFields (AC6)", () => {
  it("resolves each field to its precedence winner", () => {
    const rows: FieldSourceRow[] = [
      { field: "name", provider: "apollo", value: "Acme Inc (Apollo)", observedAt: t1 },
      { field: "name", provider: "manual", value: "Acme", observedAt: t0 },
      { field: "industry", provider: "apollo", value: "Software", observedAt: t1 },
    ];
    const c = computeCanonicalFields(rows);
    expect(c.name.value).toBe("Acme"); // manual beats apollo
    expect(c.name.provider).toBe("manual");
    expect(c.industry.value).toBe("Software"); // only source
  });

  it("ignores null/undefined-valued sources (no clobber)", () => {
    const rows: FieldSourceRow[] = [
      { field: "size", provider: "manual", value: null, observedAt: t1 },
      { field: "size", provider: "apollo", value: "50-100", observedAt: t0 },
    ];
    const c = computeCanonicalFields(rows);
    expect(c.size.value).toBe("50-100");
    expect(c.size.provider).toBe("apollo");
  });

  it("is order-independent (merge is deterministic)", () => {
    const a: FieldSourceRow[] = [
      { field: "name", provider: "manual", value: "Real", observedAt: t0 },
      { field: "name", provider: "apollo", value: "Vendor", observedAt: t1 },
    ];
    const reversed = [...a].reverse();
    expect(computeCanonicalFields(a).name.value).toBe(computeCanonicalFields(reversed).name.value);
    expect(computeCanonicalFields(a).name.value).toBe("Real");
  });
});

describe("projectScalars", () => {
  it("projects only tracked fields that have a winner", () => {
    const canonical = {
      name: { value: "Acme", provider: "manual", observedAt: t0.toISOString() },
      bogus: { value: "x", provider: "manual", observedAt: t0.toISOString() },
    };
    const patch = projectScalars(canonical, ACCOUNT_CANONICAL_FIELDS);
    expect(patch).toEqual({ name: "Acme" });
    expect("bogus" in patch).toBe(false); // untracked field never projected
  });
});
