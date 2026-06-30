import { describe, it, expect, vi } from "vitest";

// canary-ramp imports @/db + ./prompt-canary at module load; the functions
// under test are pure, so stubs keep the import hermetic.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ agentPromptVersions: {} }));
vi.mock("../prompt-canary", () => ({
  setCanaryPercent: vi.fn(),
  promoteCanary: vi.fn(),
  rollbackCanary: vi.fn(),
}));

import { nextCanaryPercent, decideCanaryAction } from "../canary-ramp";

describe("nextCanaryPercent", () => {
  it("climbs the ladder one rung at a time and caps at 100", () => {
    expect(nextCanaryPercent(0)).toBe(10);
    expect(nextCanaryPercent(10)).toBe(25);
    expect(nextCanaryPercent(25)).toBe(50);
    expect(nextCanaryPercent(50)).toBe(100);
    expect(nextCanaryPercent(100)).toBe(100);
    // Off-ladder current values still advance to the next rung above.
    expect(nextCanaryPercent(5)).toBe(10);
    expect(nextCanaryPercent(75)).toBe(100);
  });
});

describe("decideCanaryAction", () => {
  it("holds when the canary has no eval score yet", () => {
    expect(decideCanaryAction({ canaryPercent: 10, evalScore: null }, { evalScore: 0.7 })).toEqual({
      action: "hold",
      reason: "canary has no eval score yet",
    });
  });

  it("rolls back a canary that scored below stable", () => {
    expect(decideCanaryAction({ canaryPercent: 25, evalScore: 0.5 }, { evalScore: 0.7 })).toEqual({
      action: "rollback",
    });
  });

  it("ramps one rung when the canary is holding or better and not yet full", () => {
    expect(decideCanaryAction({ canaryPercent: 10, evalScore: 0.8 }, { evalScore: 0.7 })).toEqual({
      action: "ramp",
      nextPercent: 25,
    });
  });

  it("treats an equal score as good enough to advance", () => {
    expect(decideCanaryAction({ canaryPercent: 50, evalScore: 0.7 }, { evalScore: 0.7 })).toEqual({
      action: "ramp",
      nextPercent: 100,
    });
  });

  it("promotes once the canary is holding at full traffic", () => {
    expect(decideCanaryAction({ canaryPercent: 100, evalScore: 0.8 }, { evalScore: 0.7 })).toEqual({
      action: "promote",
    });
  });

  it("treats a missing stable score as 0 (canary advances)", () => {
    expect(decideCanaryAction({ canaryPercent: 10, evalScore: 0.5 }, undefined)).toEqual({
      action: "ramp",
      nextPercent: 25,
    });
  });
});
