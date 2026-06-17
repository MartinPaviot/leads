import { describe, it, expect } from "vitest";
import { customExtra, buildCompanyContext } from "@/lib/icp/company-context";

describe("customExtra", () => {
  it("reads a top-level custom property by its source path", () => {
    const extra = customExtra(
      { is_intl_institution: true, other: 1 },
      [{ fieldKey: "is_intl_institution", sourcePath: "is_intl_institution" }],
    );
    expect(extra).toEqual({ is_intl_institution: true });
  });

  it("reads a nested property by dot path", () => {
    const extra = customExtra(
      { institutionClass: { kind: "ngo", confidence: 0.9 } },
      [{ fieldKey: "institution_kind", sourcePath: "institutionClass.kind" }],
    );
    expect(extra).toEqual({ institution_kind: "ngo" });
  });

  it("keeps a false value (false is data, not absence)", () => {
    const extra = customExtra(
      { is_intl_institution: false },
      [{ fieldKey: "is_intl_institution", sourcePath: "is_intl_institution" }],
    );
    expect(extra.is_intl_institution).toBe(false);
  });

  it("omits a key whose path is absent", () => {
    const extra = customExtra({ a: 1 }, [{ fieldKey: "flag", sourcePath: "missing.path" }]);
    expect("flag" in extra).toBe(false);
  });

  it("tolerates null/empty properties and empty defs", () => {
    expect(customExtra(null, [{ fieldKey: "x", sourcePath: "x" }])).toEqual({});
    expect(customExtra({ x: 1 }, [])).toEqual({});
  });

  it("the extra layers into the company context the engine reads (eq match path)", () => {
    const ctx = buildCompanyContext(
      { industry: "Sports", properties: { is_intl_institution: true } },
      customExtra({ is_intl_institution: true }, [
        { fieldKey: "is_intl_institution", sourcePath: "is_intl_institution" },
      ]),
    );
    // The flag is now present in the context under the criterion's fieldKey,
    // so an `eq true` criterion on it can evaluate (proving the wire).
    expect(ctx.is_intl_institution).toBe(true);
    expect(ctx.industry).toBe("Sports");
  });
});
