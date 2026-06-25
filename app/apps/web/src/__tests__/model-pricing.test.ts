import { describe, it, expect } from "vitest";
import {
  computeCallCostUsd,
  hasModelPrice,
  resolveModelPrice,
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

describe("resolveModelPrice / family fallback (dashboard accuracy)", () => {
  it("prices Haiku at the Haiku tier, NOT Sonnet (old maps fell back to Sonnet = 3.75x over-count)", () => {
    const haiku = computeCallCostUsd("claude-haiku-4-5-20251001", 1_000_000, 0);
    expect(haiku).toBeCloseTo(0.8, 6); // $0.8/M input, not $3 (Sonnet)
    // An undated/aliased haiku id still resolves to a haiku tier, never Sonnet.
    const haikuAlias = computeCallCostUsd("claude-haiku-3-5", 1_000_000, 0);
    expect(haikuAlias).not.toBeNull();
    expect(haikuAlias as number).toBeLessThan(3);
  });

  it("prices Opus at the Opus tier, NOT Sonnet (old maps under-counted Opus 5x)", () => {
    const opus = computeCallCostUsd("claude-opus-4-7", 1_000_000, 0);
    expect(opus).toBeCloseTo(15, 6); // $15/M input, not $3 (Sonnet)
  });

  it("resolves dated Sonnet aliases to the Sonnet tier", () => {
    const dated = computeCallCostUsd("claude-sonnet-4-6-20250514", 1_000_000, 0);
    expect(dated).toBeCloseTo(3, 6);
  });

  it("returns null for a genuinely unknown model (no fabricated Sonnet cost)", () => {
    expect(resolveModelPrice("custom-finetune-9000")).toBeNull();
    expect(computeCallCostUsd("custom-finetune-9000", 1_000_000, 0)).toBeNull();
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
