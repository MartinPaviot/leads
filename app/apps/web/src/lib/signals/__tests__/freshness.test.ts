import { describe, expect, it } from "vitest";
import {
  DEFAULT_SIGNAL_TTL_DAYS,
  SIGNAL_TTL_DAYS,
  filterFreshSignals,
  isSignalFresh,
  ttlDaysFor,
} from "../freshness";

const NOW = new Date("2026-06-12T12:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

describe("ttlDaysFor", () => {
  it("matches the step-7 table for known event types", () => {
    expect(ttlDaysFor("hiring")).toBe(30);
    expect(ttlDaysFor("funding")).toBe(180);
    expect(ttlDaysFor("leadership_change")).toBe(120);
    expect(ttlDaysFor("tech_stack_change")).toBe(90);
  });
  it("normalizes case and whitespace", () => {
    expect(ttlDaysFor("  Hiring ")).toBe(30);
    expect(ttlDaysFor("FUNDING_RECENT")).toBe(180);
  });
  it("treats structural facts (shared investors) as never-expiring", () => {
    expect(ttlDaysFor("investor_overlap")).toBeNull();
  });
  it("falls back to the conservative default for unknown event types", () => {
    expect(ttlDaysFor("some_new_signal")).toBe(DEFAULT_SIGNAL_TTL_DAYS);
  });
});

describe("isSignalFresh", () => {
  it("keeps a recent event signal", () => {
    expect(isSignalFresh("hiring", daysAgo(10), NOW)).toBe(true);
  });
  it("drops a hiring signal past 30 days", () => {
    expect(isSignalFresh("hiring", daysAgo(45), NOW)).toBe(false);
  });
  it("keeps a fundraise up to 180 days, drops it after", () => {
    expect(isSignalFresh("funding", daysAgo(120), NOW)).toBe(true);
    expect(isSignalFresh("funding", daysAgo(200), NOW)).toBe(false);
  });
  it("never expires a structural signal", () => {
    expect(isSignalFresh("investor_overlap", daysAgo(2000), NOW)).toBe(true);
  });
  it("keeps a signal with no date (cannot prove staleness)", () => {
    expect(isSignalFresh("hiring", null, NOW)).toBe(true);
    expect(isSignalFresh("hiring", "", NOW)).toBe(true);
    expect(isSignalFresh("hiring", undefined, NOW)).toBe(true);
  });
  it("keeps a signal with an unparseable date rather than over-pruning", () => {
    expect(isSignalFresh("hiring", "not-a-date", NOW)).toBe(true);
  });
  it("keeps a future-dated signal", () => {
    expect(isSignalFresh("hiring", daysAgo(-5), NOW)).toBe(true);
  });
  it("accepts a Date instance as well as an ISO string", () => {
    expect(isSignalFresh("hiring", new Date(daysAgo(45)), NOW)).toBe(false);
  });
});

describe("filterFreshSignals", () => {
  it("drops stale entries and keeps fresh ones, across date field names", () => {
    const input = [
      { type: "hiring", firedAt: daysAgo(10) }, // fresh
      { type: "hiring", firedAt: daysAgo(60) }, // stale
      { type: "funding", observedAt: daysAgo(100) }, // fresh
      { type: "tech_stack_change", detectedAt: daysAgo(120) }, // stale (>90)
      { type: "investor_overlap", firedAt: daysAgo(900) }, // structural, kept
    ];
    const out = filterFreshSignals(input, NOW);
    expect(out).toHaveLength(3);
    expect(out.map((s) => s.type)).toEqual(["hiring", "funding", "investor_overlap"]);
  });
  it("is a no-op on an empty list", () => {
    expect(filterFreshSignals([], NOW)).toEqual([]);
  });
});

describe("TTL table integrity", () => {
  it("every entry is a positive number or null", () => {
    for (const [type, ttl] of Object.entries(SIGNAL_TTL_DAYS)) {
      if (ttl === null) continue;
      expect(ttl, type).toBeGreaterThan(0);
    }
  });
});
