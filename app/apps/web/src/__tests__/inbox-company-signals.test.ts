import { describe, it, expect } from "vitest";
import { selectFreshCompanySignals } from "@/lib/inbox/company-signals";

const now = new Date("2026-06-18T00:00:00Z");

describe("selectFreshCompanySignals (INBOX-G04)", () => {
  it("keeps high/medium FRESH signals and drops low-relevance + stale ones", () => {
    const props = {
      signals: [
        { type: "funding", title: "Raised $10M", description: "Series A", relevance: "high", detectedAt: "2026-05-01" }, // fresh (180d TTL)
        { type: "hiring", title: "Hiring 5 SDRs", relevance: "medium", detectedAt: "2026-01-01" }, // stale (30d TTL, ~5mo old)
        { type: "website_visit", title: "Pricing page visit", relevance: "high", detectedAt: "2026-06-17" }, // fresh (7d TTL)
        { type: "noise", title: "x", relevance: "low", detectedAt: "2026-06-17" }, // dropped (low relevance)
      ],
    };
    const types = selectFreshCompanySignals(props, now).map((s) => s.type);
    expect(types).toContain("funding");
    expect(types).toContain("website_visit");
    expect(types).not.toContain("hiring"); // past its 30-day shelf life
    expect(types).not.toContain("noise"); // low relevance
  });

  it("falls back to the type as title and caps at 5", () => {
    const props = { signals: Array.from({ length: 8 }, (_, i) => ({ type: `t${i}`, relevance: "high" })) };
    const r = selectFreshCompanySignals(props, now);
    expect(r.length).toBe(5);
    expect(r[0].title).toBe("t0"); // no title → type
  });

  it("is null-safe on missing / malformed properties", () => {
    expect(selectFreshCompanySignals(null)).toEqual([]);
    expect(selectFreshCompanySignals({})).toEqual([]);
    expect(selectFreshCompanySignals({ signals: "nope" })).toEqual([]);
  });
});
