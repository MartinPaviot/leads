import { describe, it, expect } from "vitest";
import {
  computeHealth,
  activeState,
  pause,
  shouldPause,
  resumeIfRecovered,
  rampUp,
  hardBounceAddresses,
  spamThreshold,
  DEFAULT_THRESHOLDS,
  type DeliverabilityEvent,
  type GuardState,
} from "../index";

const NOW = 1_000_000_000;
const ev = (type: DeliverabilityEvent["type"], n: number, extra: Partial<DeliverabilityEvent> = {}): DeliverabilityEvent[] =>
  Array.from({ length: n }, () => ({ type, at: NOW - 1000, ...extra }));

describe("computeHealth — AC1 rolling metrics", () => {
  it("computes bounce / spam / reply rates over the window", () => {
    const events = [...ev("send", 100), ...ev("bounce", 2), ...ev("complaint", 1), ...ev("reply", 10)];
    const h = computeHealth("mb1", "google", events, { now: NOW });
    expect(h.sends).toBe(100);
    expect(h.bounceRate).toBeCloseTo(0.02);
    expect(h.spamRate).toBeCloseTo(0.01);
    expect(h.replyRate).toBeCloseTo(0.1);
  });
  it("ignores events outside the window", () => {
    const events = [...ev("send", 50), { type: "send" as const, at: NOW - 10 * 24 * 3600 * 1000 }];
    expect(computeHealth("mb1", "google", events, { now: NOW, windowMs: 7 * 24 * 3600 * 1000 }).sends).toBe(50);
  });
  it("a healthy mailbox has no breaches", () => {
    const h = computeHealth("mb1", "google", [...ev("send", 100), ...ev("bounce", 1)], { now: NOW });
    expect(h.status).toBe("healthy");
    expect(h.breaches).toEqual([]);
  });
});

describe("breach detection — AC2", () => {
  it("pauses when bounce rate exceeds the threshold (enough sample)", () => {
    const h = computeHealth("mb1", "google", [...ev("send", 100), ...ev("bounce", 6)], { now: NOW }); // 6%
    expect(h.status).toBe("breached");
    expect(shouldPause(h)).toBe(true);
    expect(h.breaches.some((b) => b.startsWith("bounce"))).toBe(true);
  });

  it("does not pause on a tiny sample even at a high rate", () => {
    const h = computeHealth("mb1", "google", [...ev("send", 5), ...ev("bounce", 2)], { now: NOW }); // 40% but n=5
    expect(shouldPause(h)).toBe(false);
  });

  it("Microsoft spam threshold is stricter than Gmail", () => {
    expect(spamThreshold("microsoft")).toBeLessThan(spamThreshold("google"));
    // 0.2% spam: breaches Microsoft (0.1%) but not Gmail (0.3%).
    const events = [...ev("send", 1000), ...ev("complaint", 2)]; // 0.2%
    expect(shouldPause(computeHealth("mb", "microsoft", events, { now: NOW }))).toBe(true);
    expect(shouldPause(computeHealth("mb", "google", events, { now: NOW }))).toBe(false);
  });
});

describe("pause — AC2 idempotent", () => {
  it("pauses and is idempotent (keeps the first pausedAt)", () => {
    const p1 = pause(activeState("mb1"), "bounce", NOW);
    expect(p1).toMatchObject({ status: "paused", pausedAt: NOW, rampLevel: 0 });
    const p2 = pause(p1, "spam", NOW + 5000);
    expect(p2.pausedAt).toBe(NOW); // unchanged
  });
});

describe("hardBounceAddresses — AC3", () => {
  it("returns deduped, normalized hard-bounce addresses", () => {
    const events: DeliverabilityEvent[] = [
      { type: "bounce", at: NOW, hard: true, address: "X@Y.com" },
      { type: "bounce", at: NOW, hard: true, address: "x@y.com" },
      { type: "bounce", at: NOW, hard: false, address: "soft@y.com" }, // soft → not suppressed
      { type: "send", at: NOW },
    ];
    expect(hardBounceAddresses(events)).toEqual(["x@y.com"]);
  });
});

describe("resumeIfRecovered + rampUp — AC4", () => {
  const healthy = computeHealth("mb1", "google", [...ev("send", 100), ...ev("bounce", 1)], { now: NOW }); // 1% < warn

  it("does not resume before the cool-off window", () => {
    const paused = pause(activeState("mb1"), "bounce", NOW);
    const r = resumeIfRecovered(paused, healthy, NOW + 1000); // cool-off is 24h
    expect(r.status).toBe("paused");
  });

  it("does not resume if rates are still unhealthy", () => {
    const paused = pause(activeState("mb1"), "bounce", NOW);
    const stillBad = computeHealth("mb1", "google", [...ev("send", 100), ...ev("bounce", 6)], { now: NOW });
    const r = resumeIfRecovered(paused, stillBad, NOW + DEFAULT_THRESHOLDS.coolOffMs + 1);
    expect(r.status).toBe("paused");
  });

  it("resumes after cool-off + recovery at a reduced ramp level (not full)", () => {
    const paused = pause(activeState("mb1"), "bounce", NOW);
    const r = resumeIfRecovered(paused, healthy, NOW + DEFAULT_THRESHOLDS.coolOffMs + 1);
    expect(r.status).toBe("active");
    expect(r.rampLevel).toBe(DEFAULT_THRESHOLDS.resumeRampLevel);
    expect(r.rampLevel).toBeLessThan(1);
  });

  it("ramps back up toward full volume", () => {
    let s: GuardState = { scope: "mb1", status: "active", rampLevel: 0.25 };
    s = rampUp(s);
    expect(s.rampLevel).toBe(0.5);
    s = rampUp(rampUp(s));
    expect(s.rampLevel).toBe(1); // capped
  });
});

describe("AC5 — health state exposure", () => {
  it("Health carries rates, breaches, and status for the dashboard/weekly agent", () => {
    const h = computeHealth("mb1", "google", [...ev("send", 100), ...ev("bounce", 6)], { now: NOW });
    expect(h).toMatchObject({ scope: "mb1", provider: "google", status: "breached" });
    expect(typeof h.bounceRate).toBe("number");
    expect(Array.isArray(h.breaches)).toBe(true);
  });
});
