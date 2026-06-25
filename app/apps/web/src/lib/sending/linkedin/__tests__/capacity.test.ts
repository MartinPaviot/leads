import { describe, it, expect } from "vitest";
import {
  getLinkedInSendableCapacity,
  canActLinkedIn,
  effectiveDailyCap,
  isWarming,
  type LinkedInSendingAccount,
  type LinkedInAccountStatus,
} from "../index";

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

const acct = (over: Partial<LinkedInSendingAccount> = {}): LinkedInSendingAccount => ({
  id: "li-1",
  status: "connected",
  dailyCapConnect: 20,
  dailyCapMessage: 100,
  warmupStartedAt: null,
  ...over,
});

/** An account whose warmup started exactly `day` whole days before NOW. */
const warmingSince = (day: number, over: Partial<LinkedInSendingAccount> = {}) =>
  acct({ warmupStartedAt: new Date(NOW - day * DAY), ...over });

const none = { connect: 0, message: 0 };

describe("getLinkedInSendableCapacity — fail-closed on non-connected (T5)", () => {
  const notSendable: LinkedInAccountStatus[] = ["pending", "reconnect_required", "checkpoint", "disabled"];
  for (const status of notSendable) {
    it(`reports 0 capacity when status="${status}"`, () => {
      const r = getLinkedInSendableCapacity(acct({ status }), none, NOW);
      expect(r.sendable).toBe(false);
      expect(r.connect.available).toBe(0);
      expect(r.message.available).toBe(0);
    });
  }
});

describe("getLinkedInSendableCapacity — connected, no warmup", () => {
  it("available = steady cap − sentToday", () => {
    const r = getLinkedInSendableCapacity(acct(), { connect: 5, message: 40 }, NOW);
    expect(r.sendable).toBe(true);
    expect(r.warming).toBe(false);
    expect(r.connect).toMatchObject({ effectiveCap: 20, sentToday: 5, available: 15 });
    expect(r.message).toMatchObject({ effectiveCap: 100, sentToday: 40, available: 60 });
  });

  it("never goes negative when over cap", () => {
    const r = getLinkedInSendableCapacity(acct(), { connect: 50, message: 200 }, NOW);
    expect(r.connect.available).toBe(0);
    expect(r.message.available).toBe(0);
  });
});

describe("warmup ramp — connects start ≤5 and climb to the steady cap", () => {
  it("day 0: 5 connects / 20 messages", () => {
    const r = getLinkedInSendableCapacity(warmingSince(0), none, NOW);
    expect(r.warming).toBe(true);
    expect(r.connect.effectiveCap).toBe(5);
    expect(r.message.effectiveCap).toBe(20);
  });

  it("ramp is monotonic and reaches the steady cap (20) by day 13", () => {
    expect(effectiveDailyCap(warmingSince(0), "connect", NOW)).toBe(5);
    expect(effectiveDailyCap(warmingSince(5), "connect", NOW)).toBe(10);
    expect(effectiveDailyCap(warmingSince(13), "connect", NOW)).toBe(20);
  });

  it("past the ramp falls through to the steady cap and stops warming", () => {
    const a = warmingSince(40);
    expect(effectiveDailyCap(a, "connect", NOW)).toBe(20);
    expect(isWarming(a, NOW)).toBe(false);
  });

  it("clamps the ramp to a lower-than-default steady cap", () => {
    // A founder who hard-capped connects at 8 never sees the ramp exceed 8.
    expect(effectiveDailyCap(warmingSince(13, { dailyCapConnect: 8 }), "connect", NOW)).toBe(8);
  });

  it("a warmup scheduled in the future yields 0 (not started)", () => {
    const future = acct({ warmupStartedAt: new Date(NOW + 2 * DAY) });
    expect(effectiveDailyCap(future, "connect", NOW)).toBe(0);
    expect(getLinkedInSendableCapacity(future, none, NOW).connect.available).toBe(0);
  });
});

describe("canActLinkedIn", () => {
  it("true under cap, false at cap, false when not connected", () => {
    expect(canActLinkedIn(acct(), "connect", { connect: 19, message: 0 }, NOW)).toBe(true);
    expect(canActLinkedIn(acct(), "connect", { connect: 20, message: 0 }, NOW)).toBe(false);
    expect(canActLinkedIn(acct({ status: "reconnect_required" }), "connect", none, NOW)).toBe(false);
  });
});
