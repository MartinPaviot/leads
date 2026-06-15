import { describe, expect, it } from "vitest";
import {
  detectActiveSignals,
  isFreshAt,
  SIGNAL_CATEGORY,
  SIGNAL_TTL_DAYS,
} from "@/lib/scoring/signal-detectors";

const DAY_MS = 86_400_000;
const asOf = new Date("2026-06-12T00:00:00Z");
const daysAgo = (n: number) => new Date(asOf.getTime() - n * DAY_MS);

describe("isFreshAt", () => {
  it("respects each type's TTL at the boundary", () => {
    // hiring: 30 days — exactly at the boundary is fresh, one day past is not.
    expect(isFreshAt("hiring", daysAgo(30), asOf)).toBe(true);
    expect(isFreshAt("hiring", daysAgo(31), asOf)).toBe(false);
    // funding: 180 days.
    expect(isFreshAt("funding", daysAgo(180), asOf)).toBe(true);
    expect(isFreshAt("funding", daysAgo(181), asOf)).toBe(false);
    // tech_stack_change: 90, leadership_change: 120.
    expect(isFreshAt("tech_stack_change", daysAgo(91), asOf)).toBe(false);
    expect(isFreshAt("leadership_change", daysAgo(120), asOf)).toBe(true);
  });

  it("warm-path signals never expire (investor_overlap)", () => {
    expect(isFreshAt("investor_overlap", daysAgo(900), asOf)).toBe(true);
  });

  it("fails closed on an unparsable date for TTL'd types", () => {
    expect(isFreshAt("hiring", new Date("garbage"), asOf)).toBe(false);
  });

  it("taxonomy and TTL maps cover every signal type coherently", () => {
    for (const [type, category] of Object.entries(SIGNAL_CATEGORY)) {
      const ttl = SIGNAL_TTL_DAYS[type as keyof typeof SIGNAL_TTL_DAYS];
      if (category === "warm_path") {
        expect(ttl).toBeNull(); // standing facts don't decay
      } else {
        expect(typeof ttl).toBe("number"); // moments always decay
      }
    }
  });
});

describe("detectActiveSignals freshness", () => {
  it("drops a fossil hiring signal but keeps a fresh one", () => {
    const fossil = detectActiveSignals(
      { jobPostingIntent: { signalStrength: "high", detectedAt: daysAgo(45).toISOString() } },
      asOf,
    );
    expect(fossil).toEqual([]);

    const fresh = detectActiveSignals(
      { jobPostingIntent: { signalStrength: "high", detectedAt: daysAgo(10).toISOString() } },
      asOf,
    );
    expect(fresh.map((s) => s.type)).toEqual(["hiring"]);
  });

  it("keeps an old investor_overlap (no TTL) while dropping expired intent signals", () => {
    const out = detectActiveSignals(
      {
        investorOverlap: { commonInvestors: ["Founders Fund"], scannedAt: daysAgo(400).toISOString() },
        techStackChange: { detectedAt: daysAgo(120).toISOString() }, // TTL 90 → dropped
      },
      asOf,
    );
    expect(out.map((s) => s.type)).toEqual(["investor_overlap"]);
  });

  it("attribution semantics: a signal expired at close stays credited when fresh at deal creation", () => {
    // Hiring signal fired 10 days before the deal opened; the deal
    // then ran a 90-day cycle. At close the signal is 100 days old
    // (TTL 30 → gone for live scoring) but it opened the deal — the
    // attribution call passes the deal's creation date and keeps it.
    const dealCreatedAt = daysAgo(90);
    const props = {
      jobPostingIntent: { signalStrength: "high", detectedAt: daysAgo(100).toISOString() },
    };
    expect(detectActiveSignals(props, asOf)).toEqual([]); // live: fossil
    expect(detectActiveSignals(props, dealCreatedAt).map((s) => s.type)).toEqual(["hiring"]); // attribution: credited
  });

  it("attribution semantics: a pre-deal fossil earns no credit", () => {
    // Signal died long before the deal existed.
    const dealCreatedAt = daysAgo(20);
    const props = {
      jobPostingIntent: { signalStrength: "high", detectedAt: daysAgo(120).toISOString() },
    };
    expect(detectActiveSignals(props, dealCreatedAt)).toEqual([]);
  });
});
