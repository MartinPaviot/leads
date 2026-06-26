import { describe, it, expect } from "vitest";
import { openPipelineValue } from "../_pipeline-metrics";

describe("openPipelineValue", () => {
  it("sums only open deals, excluding won/lost (null value → 0)", () => {
    const deals = [
      { value: 100, stage: "lead" },
      { value: 200, stage: "demo" },
      { value: 500, stage: "won" }, // excluded
      { value: 300, stage: "lost" }, // excluded
      { value: null, stage: "negotiation" }, // open, null → 0
    ];
    expect(openPipelineValue(deals)).toBe(300);
  });

  it("returns 0 when every deal is closed", () => {
    expect(
      openPipelineValue([
        { value: 500, stage: "won" },
        { value: 300, stage: "lost" },
      ])
    ).toBe(0);
  });

  it("handles an empty list", () => {
    expect(openPipelineValue([])).toBe(0);
  });
});
