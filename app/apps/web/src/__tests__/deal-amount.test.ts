import { describe, expect, it } from "vitest";
import {
  formatDealAmount,
  getDealAmountDisplay,
} from "@/lib/deals/amount";

describe("getDealAmountDisplay — split deals", () => {
  it("treats projectAmount + platformArr as the source of truth when present", () => {
    expect(
      getDealAmountDisplay({
        value: null,
        projectAmount: 50_000,
        platformArr: 12_000,
      }),
    ).toEqual({
      project: 50_000,
      platform: 12_000,
      total: 62_000,
      isSplit: true,
    });
  });

  it("returns isSplit=true when only projectAmount is set (no platform yet)", () => {
    expect(
      getDealAmountDisplay({
        value: null,
        projectAmount: 30_000,
        platformArr: null,
      }),
    ).toEqual({
      project: 30_000,
      platform: 0,
      total: 30_000,
      isSplit: true,
    });
  });

  it("returns isSplit=true when only platformArr is set (recurring only)", () => {
    expect(
      getDealAmountDisplay({
        value: null,
        projectAmount: null,
        platformArr: 24_000,
      }),
    ).toEqual({
      project: 0,
      platform: 24_000,
      total: 24_000,
      isSplit: true,
    });
  });

  it("uses the split even if legacy value is also populated (split wins)", () => {
    // Mixed state — should never happen in practice, but if a founder
    // backfills the split on a legacy deal, the new fields take over
    // and the legacy field is ignored. This prevents accidental
    // double-counting in reporting.
    expect(
      getDealAmountDisplay({
        value: 999_999,
        projectAmount: 10_000,
        platformArr: 5_000,
      }),
    ).toEqual({
      project: 10_000,
      platform: 5_000,
      total: 15_000,
      isSplit: true,
    });
  });
});

describe("getDealAmountDisplay — legacy deals (no split set)", () => {
  it("uses value as total when neither split field is set", () => {
    expect(
      getDealAmountDisplay({
        value: 40_000,
        projectAmount: null,
        platformArr: null,
      }),
    ).toEqual({
      project: 0,
      platform: 0,
      total: 40_000,
      isSplit: false,
    });
  });

  it("returns total 0 when everything is null (empty deal)", () => {
    expect(
      getDealAmountDisplay({
        value: null,
        projectAmount: null,
        platformArr: null,
      }),
    ).toEqual({
      project: 0,
      platform: 0,
      total: 0,
      isSplit: false,
    });
  });
});

describe("anti-blending guarantee", () => {
  it("does NOT sum legacy value + split fields silently", () => {
    // Even if a founder populates all three, the helper must not
    // surface 999_999 + 10_000 + 5_000 = 1_014_999. Reporting that
    // blends is a guardrail violation (R8.4).
    const result = getDealAmountDisplay({
      value: 999_999,
      projectAmount: 10_000,
      platformArr: 5_000,
    });
    expect(result.total).toBe(15_000);
    expect(result.total).not.toBe(1_014_999);
  });

  it("keeps project and platform addressable separately for reports", () => {
    // The whole point of B2: a report can render project and platform
    // as two distinct bars. Total is convenient but never the only
    // figure shown.
    const result = getDealAmountDisplay({
      value: null,
      projectAmount: 75_000,
      platformArr: 18_000,
    });
    expect(result.project).toBe(75_000);
    expect(result.platform).toBe(18_000);
    expect(result.isSplit).toBe(true);
  });
});

describe("formatDealAmount", () => {
  it("formats positive amounts with $ prefix and thousands separators", () => {
    expect(formatDealAmount(50_000)).toBe("$50,000");
    expect(formatDealAmount(1_234_567)).toBe("$1,234,567");
  });

  it("renders an em-dash for zero (no fake-zero signal in UI)", () => {
    expect(formatDealAmount(0)).toBe("—");
  });
});
