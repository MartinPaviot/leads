import { describe, it, expect } from "vitest";
import { addBusinessDays, rollToBusinessDay } from "@/lib/business-days";

// Helpers — explicit weekday construction
const MONDAY    = new Date("2026-04-13T10:00:00Z"); // weekday 1
const TUESDAY   = new Date("2026-04-14T10:00:00Z"); // weekday 2
const WEDNESDAY = new Date("2026-04-15T10:00:00Z"); // weekday 3
const THURSDAY  = new Date("2026-04-16T10:00:00Z"); // weekday 4
const FRIDAY    = new Date("2026-04-17T10:00:00Z"); // weekday 5
const SATURDAY  = new Date("2026-04-18T10:00:00Z"); // weekday 6
const SUNDAY    = new Date("2026-04-19T10:00:00Z"); // weekday 0
const NEXT_MONDAY = new Date("2026-04-20T10:00:00Z");

describe("addBusinessDays", () => {
  it("0 days returns the same instant", () => {
    expect(addBusinessDays(WEDNESDAY, 0).getTime()).toBe(WEDNESDAY.getTime());
  });

  it("does not mutate the input date", () => {
    const original = WEDNESDAY.getTime();
    addBusinessDays(WEDNESDAY, 5);
    expect(WEDNESDAY.getTime()).toBe(original);
  });

  it("adds 1 business day across a weekday boundary", () => {
    expect(addBusinessDays(MONDAY, 1).toISOString()).toBe(TUESDAY.toISOString());
  });

  it("rolls Friday + 1 to Monday (skips weekend)", () => {
    expect(addBusinessDays(FRIDAY, 1).toISOString()).toBe(NEXT_MONDAY.toISOString());
  });

  it("rolls Friday + 3 to Wednesday", () => {
    const wed = new Date("2026-04-22T10:00:00Z");
    expect(addBusinessDays(FRIDAY, 3).toISOString()).toBe(wed.toISOString());
  });

  it("rolls Thursday + 1 to Friday (no weekend involved)", () => {
    expect(addBusinessDays(THURSDAY, 1).toISOString()).toBe(FRIDAY.toISOString());
  });

  it("preserves time-of-day", () => {
    const fridayLate = new Date("2026-04-17T23:50:00Z");
    const result = addBusinessDays(fridayLate, 1);
    expect(result.toISOString()).toBe("2026-04-20T23:50:00.000Z");
  });

  it("supports negative direction (skip weekends backwards)", () => {
    expect(addBusinessDays(NEXT_MONDAY, -1).toISOString()).toBe(FRIDAY.toISOString());
  });
});

describe("rollToBusinessDay", () => {
  it("Saturday rolls forward to Monday (+2)", () => {
    expect(rollToBusinessDay(SATURDAY).toISOString()).toBe(NEXT_MONDAY.toISOString());
  });

  it("Sunday rolls forward to Monday (+1)", () => {
    expect(rollToBusinessDay(SUNDAY).toISOString()).toBe(NEXT_MONDAY.toISOString());
  });

  it("Weekday is left untouched", () => {
    expect(rollToBusinessDay(WEDNESDAY).toISOString()).toBe(WEDNESDAY.toISOString());
  });

  it("does not mutate the input", () => {
    const t = SATURDAY.getTime();
    rollToBusinessDay(SATURDAY);
    expect(SATURDAY.getTime()).toBe(t);
  });
});
