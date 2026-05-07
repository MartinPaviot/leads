import { describe, it, expect } from "vitest";
import {
  computeCallCostUsd,
  hasModelPrice,
} from "@/lib/ai/model-pricing";

describe("computeCallCostUsd", () => {
  it("computes cost for a known model with both token types", () => {
    // gpt-4o-mini: $0.15/M input, $0.60/M output
    const cost = computeCallCostUsd("gpt-4o-mini", 1_000_000, 500_000);
    expect(cost).toBeCloseTo(0.15 + 0.30, 6);
  });

  it("computes cost for claude-sonnet-4-6 (premium tier)", () => {
    // $3 input, $15 output per M tokens
    const cost = computeCallCostUsd("claude-sonnet-4-6", 100_000, 50_000);
    expect(cost).toBeCloseTo(0.3 + 0.75, 6);
  });

  it("computes input-only cost for embedding models (output free)", () => {
    const cost = computeCallCostUsd("text-embedding-3-small", 1_000_000, 0);
    expect(cost).toBeCloseTo(0.02, 6);
  });

  it("returns null for unknown model id", () => {
    expect(computeCallCostUsd("custom-finetune-9000", 100, 50)).toBeNull();
  });

  it("returns null when both token counts are missing", () => {
    expect(computeCallCostUsd("gpt-4o-mini", null, null)).toBeNull();
  });

  it("treats one missing token count as 0", () => {
    // input present, output missing
    const cost = computeCallCostUsd("gpt-4o-mini", 1_000_000, null);
    expect(cost).toBeCloseTo(0.15, 6);
  });

  it("rounds to 6 decimal places", () => {
    // Tiny call should produce a tiny but representable number.
    const cost = computeCallCostUsd("gpt-4o-mini", 7, 3);
    expect(cost).not.toBeNull();
    if (cost !== null) {
      // Precision shouldn't exceed 6 decimals.
      const decimals = (cost.toString().split(".")[1] ?? "").length;
      expect(decimals).toBeLessThanOrEqual(6);
    }
  });
});

describe("hasModelPrice", () => {
  it("recognises known models", () => {
    expect(hasModelPrice("gpt-4o-mini")).toBe(true);
    expect(hasModelPrice("claude-sonnet-4-6")).toBe(true);
    expect(hasModelPrice("text-embedding-3-small")).toBe(true);
  });
  it("rejects unknown models", () => {
    expect(hasModelPrice("custom-finetune-9000")).toBe(false);
    expect(hasModelPrice("")).toBe(false);
  });
});
