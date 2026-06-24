import { describe, it, expect } from "vitest";
import {
  bookingsTotals,
  BOOKINGS_TARGET_CENTS,
  type BookingsStageRow,
} from "../_bookings-totals";

const row = (over: Partial<BookingsStageRow>): BookingsStageRow => ({
  stage: "negotiation",
  projectBookings: 0,
  platformArr: 0,
  totalBookings: 0,
  dealCount: 0,
  ...over,
});

describe("bookingsTotals (P1 26)", () => {
  it("is empty (hasBookings=false, total 0, 0%) for zero deals", () => {
    const t = bookingsTotals([]);
    expect(t.totalBookings).toBe(0);
    expect(t.pctOfTarget).toBe(0);
    expect(t.hasBookings).toBe(false);
    expect(t.legacyTotal).toBe(0);
  });

  it("is empty when stages exist but carry no amounts", () => {
    const t = bookingsTotals([row({ stage: "lead", dealCount: 3 })]);
    expect(t.totalBookings).toBe(0);
    expect(t.hasBookings).toBe(false);
  });

  it("sums project and platform separately without blending", () => {
    const t = bookingsTotals([
      row({ projectBookings: 30_000_000, platformArr: 20_000_000, totalBookings: 50_000_000 }),
    ]);
    expect(t.projectTotal).toBe(30_000_000);
    expect(t.platformTotal).toBe(20_000_000);
    expect(t.legacyTotal).toBe(0);
    expect(t.totalBookings).toBe(50_000_000);
    expect(t.hasBookings).toBe(true);
  });

  it("folds legacy single-bag value into total but exposes it separately", () => {
    // totalBookings carries project+platform+legacy; legacy = total - project - platform.
    const t = bookingsTotals([
      row({ projectBookings: 10_000_000, platformArr: 0, totalBookings: 25_000_000 }),
    ]);
    expect(t.legacyTotal).toBe(15_000_000);
    expect(t.totalBookings).toBe(25_000_000);
  });

  it("computes pct of the 1 M€ target and clamps at 100", () => {
    const half = bookingsTotals([row({ totalBookings: BOOKINGS_TARGET_CENTS / 2 })]);
    expect(half.pctOfTarget).toBe(50);
    const over = bookingsTotals([row({ totalBookings: BOOKINGS_TARGET_CENTS * 3 })]);
    expect(over.pctOfTarget).toBe(100);
  });

  it("aggregates across multiple stages", () => {
    const t = bookingsTotals([
      row({ stage: "won", projectBookings: 10_000_000, platformArr: 5_000_000, totalBookings: 15_000_000 }),
      row({ stage: "negotiation", projectBookings: 5_000_000, platformArr: 0, totalBookings: 5_000_000 }),
    ]);
    expect(t.projectTotal).toBe(15_000_000);
    expect(t.platformTotal).toBe(5_000_000);
    expect(t.totalBookings).toBe(20_000_000);
  });
});
