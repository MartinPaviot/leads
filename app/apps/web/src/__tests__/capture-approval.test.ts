import { describe, it, expect } from "vitest";
import { getCaptureApprovalMode } from "@/lib/capture/approval";

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
});
