import { describe, it, expect } from "vitest";
import {
  clampHydrationLimit,
  pickHydrationSeat,
  selectSeatsPerTenant,
  connectedSeatsPerTenant,
  type HydrationSeatRow,
} from "../hydration-seat";

describe("connectedSeatsPerTenant — any connected seat per tenant (not SN-gated)", () => {
  const r = (o: Partial<HydrationSeatRow> & { tenantId: string }) => ({
    status: "connected",
    unipileAccountId: "x",
    seatType: "classic",
    userId: "u",
    ...o,
  });
  it("keeps one connected seat per tenant, including classic; drops disconnected / no-id", () => {
    const rows = [
      r({ tenantId: "tA", unipileAccountId: "a1", seatType: "classic" }),
      r({ tenantId: "tA", unipileAccountId: "a2", seatType: "sales_navigator" }),
      r({ tenantId: "tB", unipileAccountId: "b1", status: "disconnected" }),
      r({ tenantId: "tC", unipileAccountId: null }),
    ];
    expect(connectedSeatsPerTenant(rows)).toEqual([["tA", "a1"]]);
  });
  it("returns empty for no connected seats", () => {
    expect(connectedSeatsPerTenant([])).toEqual([]);
    expect(connectedSeatsPerTenant([r({ tenantId: "tZ", status: "pending" })])).toEqual([]);
  });
});

describe("clampHydrationLimit — protect the profile-view quota", () => {
  it("defaults to 25 on missing/invalid/non-positive input", () => {
    expect(clampHydrationLimit(undefined)).toBe(25);
    expect(clampHydrationLimit("nope")).toBe(25);
    expect(clampHydrationLimit(0)).toBe(25);
    expect(clampHydrationLimit(-5)).toBe(25);
  });
  it("clamps to [1, 50] and floors fractionals", () => {
    expect(clampHydrationLimit(1)).toBe(1);
    expect(clampHydrationLimit(50)).toBe(50);
    expect(clampHydrationLimit(999)).toBe(50);
    expect(clampHydrationLimit(12.9)).toBe(12);
    expect(clampHydrationLimit("8")).toBe(8);
  });
});

describe("pickHydrationSeat — own SN seat first, then any SN/Recruiter, never classic", () => {
  const row = (o: Partial<HydrationSeatRow>): HydrationSeatRow => ({
    status: "connected",
    unipileAccountId: "acc",
    seatType: "sales_navigator",
    userId: "u1",
    ...o,
  });

  it("prefers the caller's own connected SN seat", () => {
    const rows = [row({ userId: "u2", unipileAccountId: "other" }), row({ userId: "u1", unipileAccountId: "mine" })];
    expect(pickHydrationSeat(rows, "u1")?.unipileAccountId).toBe("mine");
  });

  it("falls back to any eligible seat when the caller has none", () => {
    const rows = [row({ userId: "u9", unipileAccountId: "teamSeat" })];
    expect(pickHydrationSeat(rows, "u1")?.unipileAccountId).toBe("teamSeat");
  });

  it("with userId='' (cron, no caller) takes any eligible seat", () => {
    const rows = [row({ userId: "u9", unipileAccountId: "teamSeat" })];
    expect(pickHydrationSeat(rows, "")?.unipileAccountId).toBe("teamSeat");
  });

  it("excludes classic seats (insights are a premium feature)", () => {
    const rows = [row({ seatType: "classic", unipileAccountId: "classicSeat" })];
    expect(pickHydrationSeat(rows, "u1")).toBeNull();
  });

  it("excludes disconnected seats and seats with no unipile id", () => {
    const rows = [row({ status: "disconnected" }), row({ unipileAccountId: null })];
    expect(pickHydrationSeat(rows, "u1")).toBeNull();
  });

  it("accepts a recruiter seat", () => {
    const rows = [row({ seatType: "recruiter", unipileAccountId: "rec" })];
    expect(pickHydrationSeat(rows, "uX")?.unipileAccountId).toBe("rec");
  });
});

describe("selectSeatsPerTenant — one eligible seat per tenant, no cross-tenant", () => {
  const r = (o: Partial<HydrationSeatRow> & { tenantId: string }) => ({
    status: "connected",
    unipileAccountId: "x",
    seatType: "sales_navigator",
    userId: "u",
    ...o,
  });
  it("groups by tenant, keeps the first eligible seat, drops classic/disconnected-only tenants", () => {
    const rows = [
      r({ tenantId: "tA", unipileAccountId: "a1" }),
      r({ tenantId: "tA", unipileAccountId: "a2", seatType: "recruiter" }),
      r({ tenantId: "tB", unipileAccountId: "b1", seatType: "classic" }),
      r({ tenantId: "tC", unipileAccountId: "c1", status: "disconnected" }),
    ];
    expect(selectSeatsPerTenant(rows)).toEqual([["tA", "a1"]]);
  });
  it("returns empty for no rows / no eligible seats", () => {
    expect(selectSeatsPerTenant([])).toEqual([]);
    expect(selectSeatsPerTenant([r({ tenantId: "tZ", seatType: "classic" })])).toEqual([]);
  });
});
