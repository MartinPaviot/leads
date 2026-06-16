import { describe, it, expect } from "vitest";
import { buildRationale, type RationaleFactor } from "@/lib/scoring/rationale";

describe("buildRationale", () => {
  it("leads with a fresh signal, then fit, then reach; caps at maxFactors", () => {
    const factors: RationaleFactor[] = [
      { kind: "reach", label: "reachable" },
      { kind: "fit", label: "core sector" },
      { kind: "signal", label: "hiring a RevOps", ageDays: 12 },
      { kind: "value", label: "high potential" },
    ];
    const out = buildRationale({ grade: "A+", factors });
    expect(out).toBe("A+ · hiring a RevOps (12d ago), core sector, reachable");
  });

  it("orders multiple signals freshest-first", () => {
    const factors: RationaleFactor[] = [
      { kind: "signal", label: "recent funding", ageDays: 40 },
      { kind: "signal", label: "hiring", ageDays: 5 },
    ];
    const out = buildRationale({ grade: "A", factors, maxFactors: 2 });
    expect(out).toBe("A · hiring (5d ago), recent funding (40d ago)");
  });

  it("never invents a reason — empty factors give an honest fallback", () => {
    expect(buildRationale({ grade: "A", factors: [] })).toBe("A · ICP fit, no recent signal");
  });

  it("omits the age suffix when ageDays is absent", () => {
    const out = buildRationale({ grade: "B", factors: [{ kind: "signal", label: "interest detected" }] });
    expect(out).toBe("B · interest detected");
  });
});
