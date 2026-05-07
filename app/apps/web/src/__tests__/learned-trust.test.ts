import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          groupBy: vi.fn(() => [
            { actionType: "email-send", totalOutcomes: 20, positiveOutcomes: 18 },
            { actionType: "deal-stage-change", totalOutcomes: 15, positiveOutcomes: 5 },
            { actionType: "task-create", totalOutcomes: 8, positiveOutcomes: 6 },
          ]),
        })),
      })),
    })),
  },
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(() => ({})),
  updateTenantSettings: vi.fn(),
}));

import { getEffectiveThreshold } from "@/lib/guardrails/learned-trust";
import { HIGH_CONFIDENCE_THRESHOLDS } from "@/lib/guardrails/approval-mode";

describe("Learned Trust Model", () => {
  it("returns base threshold when no learned data", () => {
    const threshold = getEffectiveThreshold("email-send");
    expect(threshold).toBe(HIGH_CONFIDENCE_THRESHOLDS["email-send"]);
    expect(threshold).toBe(0.85);
  });

  it("returns learned threshold when available", () => {
    const learned = { "email-send": 0.7, "deal-stage-change": 0.95 };
    expect(getEffectiveThreshold("email-send", learned)).toBe(0.7);
    expect(getEffectiveThreshold("deal-stage-change", learned)).toBe(0.95);
  });

  it("falls back to base for unlearned actions", () => {
    const learned = { "email-send": 0.7 };
    expect(getEffectiveThreshold("task-create", learned)).toBe(HIGH_CONFIDENCE_THRESHOLDS["task-create"]);
  });

  it("sequence-enrollment stays at 1.1 without learned override", () => {
    expect(getEffectiveThreshold("sequence-enrollment")).toBe(1.1);
  });
});
