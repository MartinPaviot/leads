import { describe, it, expect } from "vitest";
import { enjeuWinRates, ENJEU_MIN_CALLS } from "@/lib/voice/script-learning";

// Helper: N rows for (sector, enjeu), `booked` of them booked.
function rows(sector: string, enjeuKey: string, calls: number, booked: number) {
  return Array.from({ length: calls }, (_, i) => ({ sector, enjeuKey, booked: i < booked }));
}

describe("enjeuWinRates (which enjeu books, per sector)", () => {
  it("ranks enjeux that cleared the floor by booking rate, names the best", () => {
    const data = [
      ...rows("fondations", "cout", 25, 10), // 0.40
      ...rows("fondations", "ia", 22, 4), //   0.18
    ];
    const [f] = enjeuWinRates(data);
    expect(f.sector).toBe("fondations");
    expect(f.total).toBe(47);
    expect(f.ranked.map((r) => r.enjeuKey)).toEqual(["cout", "ia"]);
    expect(f.best).toBe("cout");
    expect(f.ranked[0].rate).toBeCloseTo(0.4);
  });

  it("never names a winner on noise — enjeux below the floor are excluded", () => {
    const data = [
      ...rows("fondations", "cout", 25, 10),
      ...rows("fondations", "souverainete", 5, 3), // 0.60 but only 5 calls → excluded
    ];
    const [f] = enjeuWinRates(data);
    expect(f.ranked.map((r) => r.enjeuKey)).toEqual(["cout"]); // souverainete dropped
    expect(f.best).toBe("cout");
  });

  it("a sector with only sub-floor data has best = null (keep default order)", () => {
    const data = rows("sante", "ia", ENJEU_MIN_CALLS - 1, 5);
    const [s] = enjeuWinRates(data);
    expect(s.total).toBe(ENJEU_MIN_CALLS - 1);
    expect(s.ranked).toHaveLength(0);
    expect(s.best).toBeNull();
  });

  it("ignores rows with no sector or no enjeu key (can't attribute)", () => {
    const data = [
      { sector: null, enjeuKey: "cout", booked: true },
      { sector: "fondations", enjeuKey: null, booked: true },
      { sector: "", enjeuKey: "ia", booked: false },
    ];
    expect(enjeuWinRates(data)).toEqual([]);
  });

  it("returns sectors busiest-first", () => {
    const data = [
      ...rows("sante", "ia", 30, 5),
      ...rows("fondations", "cout", 50, 20),
    ];
    expect(enjeuWinRates(data).map((s) => s.sector)).toEqual(["fondations", "sante"]);
  });

  it("empty input → empty", () => {
    expect(enjeuWinRates([])).toEqual([]);
  });
});
