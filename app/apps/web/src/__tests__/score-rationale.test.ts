import { describe, it, expect } from "vitest";
import { buildRationale, type RationaleFactor } from "@/lib/scoring/rationale";

describe("buildRationale", () => {
  it("leads with a fresh signal, then fit, then reach; caps at maxFactors", () => {
    const factors: RationaleFactor[] = [
      { kind: "reach", label: "décideur joignable" },
      { kind: "fit", label: "secteur cœur" },
      { kind: "signal", label: "recrute un RevOps", ageDays: 12 },
      { kind: "value", label: "gros potentiel" },
    ];
    const out = buildRationale({ grade: "A+", factors });
    expect(out).toBe("A+ : recrute un RevOps (il y a 12j), secteur cœur, décideur joignable");
  });

  it("orders multiple signals freshest-first", () => {
    const factors: RationaleFactor[] = [
      { kind: "signal", label: "levée récente", ageDays: 40 },
      { kind: "signal", label: "recrute", ageDays: 5 },
    ];
    const out = buildRationale({ grade: "A", factors, maxFactors: 2 });
    expect(out).toBe("A : recrute (il y a 5j), levée récente (il y a 40j)");
  });

  it("never invents a reason — empty factors give an honest fallback", () => {
    expect(buildRationale({ grade: "A", factors: [] })).toBe("A : fit ICP, pas de signal récent");
  });

  it("omits the age suffix when ageDays is absent", () => {
    const out = buildRationale({ grade: "B", factors: [{ kind: "signal", label: "intérêt détecté" }] });
    expect(out).toBe("B : intérêt détecté");
  });
});
