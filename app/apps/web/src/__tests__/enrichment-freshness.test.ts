import { describe, it, expect } from "vitest";
import {
  isEnrichmentStale,
  DEFAULT_ENRICHMENT_TTL_DAYS,
} from "@/lib/enrichment/freshness";

describe("isEnrichmentStale", () => {
  const now = new Date("2026-06-07T12:00:00Z");
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

  it("treats never-enriched (null/undefined) as stale", () => {
    expect(isEnrichmentStale(null, 90, now)).toBe(true);
    expect(isEnrichmentStale(undefined, 90, now)).toBe(true);
  });

  it("treats recent enrichment as fresh", () => {
    expect(isEnrichmentStale(daysAgo(10), 90, now)).toBe(false);
  });

  it("treats enrichment older than the TTL as stale", () => {
    expect(isEnrichmentStale(daysAgo(100), 90, now)).toBe(true);
  });

  it("is inclusive at the TTL boundary", () => {
    expect(isEnrichmentStale(daysAgo(90), 90, now)).toBe(true);
    expect(isEnrichmentStale(daysAgo(89), 90, now)).toBe(false);
  });

  it("accepts ISO strings and treats unparseable values as stale", () => {
    expect(isEnrichmentStale(daysAgo(5).toISOString(), 90, now)).toBe(false);
    expect(isEnrichmentStale("not-a-date", 90, now)).toBe(true);
  });

  it("exposes a sane default TTL", () => {
    expect(DEFAULT_ENRICHMENT_TTL_DAYS).toBeGreaterThan(0);
  });
});
