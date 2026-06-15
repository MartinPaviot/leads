import { describe, it, expect } from "vitest";
import { parseMonthlyGoal } from "@/lib/analytics/revenue-goal";

describe("parseMonthlyGoal", () => {
  it("treats empty/null/undefined as clearing the goal", () => {
    expect(parseMonthlyGoal(null)).toEqual({ monthly: null });
    expect(parseMonthlyGoal(undefined)).toEqual({ monthly: null });
    expect(parseMonthlyGoal("")).toEqual({ monthly: null });
  });

  it("treats 0 as clearing the goal (no goal, not a zero target)", () => {
    expect(parseMonthlyGoal(0)).toEqual({ monthly: null });
    expect(parseMonthlyGoal("0")).toEqual({ monthly: null });
  });

  it("accepts plain and comma/space-formatted numbers", () => {
    expect(parseMonthlyGoal(50000)).toEqual({ monthly: 50000 });
    expect(parseMonthlyGoal("50000")).toEqual({ monthly: 50000 });
    expect(parseMonthlyGoal("50,000")).toEqual({ monthly: 50000 });
    expect(parseMonthlyGoal("50 000")).toEqual({ monthly: 50000 });
  });

  it("rounds fractional input to a whole number", () => {
    expect(parseMonthlyGoal(50000.7)).toEqual({ monthly: 50001 });
  });

  it("rejects negatives, non-numbers, and absurd values", () => {
    expect(parseMonthlyGoal(-5)).toHaveProperty("error");
    expect(parseMonthlyGoal("abc")).toHaveProperty("error");
    expect(parseMonthlyGoal(2_000_000_000)).toHaveProperty("error");
    expect(parseMonthlyGoal(NaN)).toHaveProperty("error");
  });
});
