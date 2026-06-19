import { describe, it, expect } from "vitest";
import { getCaptureApprovalMode, getFieldApprovalMode } from "@/lib/capture/approval";

describe("getCaptureApprovalMode", () => {
  it("defaults to auto (non-breaking for existing tenants)", () => {
    expect(getCaptureApprovalMode(null)).toBe("auto");
    expect(getCaptureApprovalMode(undefined)).toBe("auto");
    expect(getCaptureApprovalMode({})).toBe("auto");
    expect(getCaptureApprovalMode({ captureApprovalMode: "auto" })).toBe("auto");
    expect(getCaptureApprovalMode({ captureApprovalMode: "nonsense" })).toBe("auto");
  });
  it("returns review only when explicitly opted in (case-insensitive)", () => {
    expect(getCaptureApprovalMode({ captureApprovalMode: "review" })).toBe("review");
    expect(getCaptureApprovalMode({ captureApprovalMode: "REVIEW" })).toBe("review");
  });
  it("returns hybrid when explicitly set (case-insensitive)", () => {
    expect(getCaptureApprovalMode({ captureApprovalMode: "hybrid" })).toBe("hybrid");
    expect(getCaptureApprovalMode({ captureApprovalMode: "HYBRID" })).toBe("hybrid");
  });
});

describe("getFieldApprovalMode (hybrid per-field)", () => {
  const FIELDS = ["meddic", "evidence", "callIntel", "callProfile"] as const;
  it("review mode gates every field", () => {
    for (const f of FIELDS) expect(getFieldApprovalMode({ captureApprovalMode: "review" }, f)).toBe("review");
  });
  it("auto mode (and default) gates no field", () => {
    expect(getFieldApprovalMode({ captureApprovalMode: "auto" }, "meddic")).toBe("auto");
    expect(getFieldApprovalMode(null, "meddic")).toBe("auto");
  });
  it("hybrid follows the per-field map; unlisted fields default to auto", () => {
    const s = { captureApprovalMode: "hybrid", captureFieldModes: { meddic: "review", callIntel: "auto" } };
    expect(getFieldApprovalMode(s, "meddic")).toBe("review");
    expect(getFieldApprovalMode(s, "callIntel")).toBe("auto");
    expect(getFieldApprovalMode(s, "evidence")).toBe("auto");
  });
  it("hybrid with no map defaults all fields to auto", () => {
    expect(getFieldApprovalMode({ captureApprovalMode: "hybrid" }, "meddic")).toBe("auto");
  });
});
