import { describe, expect, it } from "vitest";
import { displayScore, formatScore } from "@/lib/util/ui-utils";

/**
 * Regression guard for the "F Cold on un-scored rows" bug: every live
 * account on the Pilae tenant carried a non-null no-data floor score
 * (0-19 → grade F / Cold) yet none were enriched, so the accounts and
 * contacts tables showed "F Cold" everywhere. displayScore() is the
 * single source of truth that suppresses the grade until a row is
 * enriched. If this rule regresses, the misleading verdict comes back.
 */
describe("displayScore", () => {
  it("returns null (=> 'Not scored') for an un-enriched row even with a score", () => {
    expect(displayScore(0, false)).toBeNull();
    expect(displayScore(12, false)).toBeNull();
    expect(displayScore(95, false)).toBeNull();
  });

  it("returns null for an enriched row that has no score yet", () => {
    expect(displayScore(null, true)).toBeNull();
    expect(displayScore(undefined, true)).toBeNull();
  });

  it("returns the real grade for an enriched, scored row", () => {
    const a = displayScore(85, true);
    expect(a).not.toBeNull();
    expect(a!.grade).toBe("A");
    expect(a!.heat).toBe("Burning");

    const f = displayScore(10, true);
    expect(f).not.toBeNull();
    // A genuine low-fit enriched account still shows F — the rule only
    // hides the grade when there's no data, not when the fit is poor.
    expect(f!.grade).toBe("F");
    expect(f!.heat).toBe("Cold");
  });

  it("matches formatScore once the enriched gate is open", () => {
    for (const score of [0, 19, 20, 39, 40, 59, 60, 79, 80, 89, 90, 100]) {
      expect(displayScore(score, true)).toEqual(formatScore(score));
    }
  });
});
