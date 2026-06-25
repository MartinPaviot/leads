import { describe, it, expect } from "vitest";
import { classifySeatResolution, type SeatRow } from "../seat-resolver";

const connectedRow = (over: Partial<SeatRow> = {}): SeatRow => ({
  id: "seat-1",
  unipileAccountId: "acc_unipile_1",
  status: "connected",
  dailyCapConnect: 20,
  dailyCapMessage: 100,
  warmupStartedAt: null,
  ...over,
});

describe("classifySeatResolution (pure)", () => {
  it("no owner (ownerless/agent sequence) -> no-owner, never borrows a seat", () => {
    expect(classifySeatResolution(null, connectedRow())).toEqual({ ok: false, reason: "no-owner" });
    expect(classifySeatResolution(undefined, null)).toEqual({ ok: false, reason: "no-owner" });
  });

  it("owner with no seat row -> no-connected-seat (caller queues + notifies owner)", () => {
    expect(classifySeatResolution("user-1", null)).toEqual({ ok: false, reason: "no-connected-seat", ownerId: "user-1" });
  });

  it("owner whose seat is not connected -> no-connected-seat", () => {
    expect(classifySeatResolution("user-1", connectedRow({ status: "reconnect_required" }))).toMatchObject({ ok: false, reason: "no-connected-seat" });
    expect(classifySeatResolution("user-1", connectedRow({ status: "connected", unipileAccountId: null }))).toMatchObject({ ok: false, reason: "no-connected-seat" });
  });

  it("owner with a connected seat -> ok, mapping the row to a DispatchSeat", () => {
    const res = classifySeatResolution("user-1", connectedRow({ warmupStartedAt: new Date(0) }));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.ownerId).toBe("user-1");
      expect(res.seat).toEqual({
        id: "seat-1",
        unipileAccountId: "acc_unipile_1",
        status: "connected",
        dailyCapConnect: 20,
        dailyCapMessage: 100,
        warmupStartedAt: new Date(0),
      });
    }
  });
});
