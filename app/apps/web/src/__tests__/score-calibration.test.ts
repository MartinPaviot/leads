import { describe, it, expect } from "vitest";
import { buildCalibration, type GradeOutcomeRow } from "@/lib/scoring/calibration";

describe("buildCalibration", () => {
  it("calls a clean ladder HEALTHY (top band beats the rest, monotonic)", () => {
    const rows: GradeOutcomeRow[] = [
      { grade: "A+", n: 20, converted: 19 }, // 95%
      { grade: "A", n: 25, converted: 14 }, // 56%
      { grade: "B", n: 30, converted: 9 }, // 30%
      { grade: "C", n: 25, converted: 3 }, // 12%
    ];
    const r = buildCalibration("meeting_booked", rows);
    expect(r.verdict).toBe("healthy");
    expect(r.bands.map((b) => b.grade)).toEqual(["A+", "A", "B", "C"]); // ordered best→worst
    expect(r.bands[0].rate).toBeGreaterThan(r.bands[1].rate);
    expect(r.total).toBe(100);
  });

  it("flags an INVERTED ladder (a higher grade converts less — the A+ taules case)", () => {
    const rows: GradeOutcomeRow[] = [
      { grade: "A+", n: 20, converted: 4 }, // 20%
      { grade: "A", n: 25, converted: 18 }, // 72%
      { grade: "B", n: 30, converted: 12 }, // 40%
    ];
    const r = buildCalibration("meeting_booked", rows);
    expect(r.verdict).toBe("inverted");
    expect(r.summary).toMatch(/inverted/i);
  });

  it("calls a non-separating ladder FLAT", () => {
    const rows: GradeOutcomeRow[] = [
      { grade: "A+", n: 30, converted: 15 }, // 50%
      { grade: "A", n: 30, converted: 15 }, // 50%
      { grade: "B", n: 30, converted: 14 }, // 47%
    ];
    const r = buildCalibration("meeting_booked", rows);
    expect(r.verdict).toBe("flat");
  });

  it("refuses to conclude when UNDERPOWERED (too few outcomes)", () => {
    const rows: GradeOutcomeRow[] = [
      { grade: "A+", n: 4, converted: 3 },
      { grade: "A", n: 5, converted: 2 },
    ];
    const r = buildCalibration("meeting_booked", rows);
    expect(r.verdict).toBe("underpowered");
  });

  it("clamps converted to n and ignores empty bands", () => {
    const rows: GradeOutcomeRow[] = [
      { grade: "A+", n: 10, converted: 99 }, // clamp to 10
      { grade: "F", n: 0, converted: 0 }, // dropped
    ];
    const r = buildCalibration("won", rows);
    expect(r.bands.find((b) => b.grade === "A+")!.converted).toBe(10);
    expect(r.bands.find((b) => b.grade === "F")).toBeUndefined();
  });
});
