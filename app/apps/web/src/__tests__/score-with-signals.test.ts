import { describe, expect, it } from "vitest";
import { scoreSignals } from "@/lib/scoring/score-with-signals";

describe("scoreSignals", () => {
  it("no active signals → zero bonus and no reasons", () => {
    const out = scoreSignals({}, { funding: 2, hiring: 1 });
    expect(out.bonus).toBe(0);
    expect(out.contributions).toEqual([]);
    expect(out.reasons).toEqual([]);
  });

  it("unknown signal type in multipliers is harmless", () => {
    const out = scoreSignals(
      { latest_funding_stage: "series_a", fundingLastCheckedAt: new Date().toISOString() },
      { unknown_signal: 9, funding: 1 },
    );
    expect(out.bonus).toBe(5);
    expect(out.contributions[0].type).toBe("funding");
  });

  it("applies neutral 1× multiplier when the signal type isn't in the map", () => {
    const out = scoreSignals(
      { latest_funding_stage: "seed", fundingLastCheckedAt: new Date().toISOString() },
      {},
    );
    expect(out.bonus).toBe(5);
    // No "× historical lift" suffix when multiplier is neutral.
    expect(out.reasons[0]).toBe("Funding signal fired");
  });

  it("scales bonus with the multiplier", () => {
    const props = {
      latest_funding_stage: "series_a",
      fundingLastCheckedAt: new Date().toISOString(),
    };
    const neutral = scoreSignals(props, { funding: 1 });
    const boosted = scoreSignals(props, { funding: 2 });
    expect(boosted.bonus).toBeGreaterThan(neutral.bonus);
    expect(boosted.reasons[0]).toContain("2.0×");
  });

  it("caps the total bonus at MAX_TOTAL_SIGNAL_BONUS so fit score still dominates", () => {
    const props = {
      latest_funding_stage: "series_a",
      fundingLastCheckedAt: new Date().toISOString(),
      jobPostingIntent: { signalStrength: "high", detectedAt: new Date().toISOString() },
      techStackChange: { detectedAt: new Date().toISOString() },
      leadershipChange: { detectedAt: new Date().toISOString() },
      investorOverlap: { commonInvestors: ["Founders Fund"], scannedAt: new Date().toISOString() },
    };
    // All five signals at max 2.5× lift = 5 × 2.5 × 5 = 62.5 raw. Must cap at 20.
    const out = scoreSignals(props, {
      funding: 2.5,
      hiring: 2.5,
      tech_stack_change: 2.5,
      leadership_change: 2.5,
      investor_overlap: 2.5,
    });
    expect(out.bonus).toBe(20);
    // But contributions still list every fired signal for the UI.
    expect(out.contributions).toHaveLength(5);
  });

  it("ignores a signal past its shelf life — an expired trigger scores nothing", () => {
    const stale = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60d
    const props = {
      jobPostingIntent: { signalStrength: "high", detectedAt: stale }, // hiring TTL 30d → expired
    };
    expect(scoreSignals(props, { hiring: 2 }).bonus).toBe(0);
    // Fresh again → it scores.
    const fresh = { jobPostingIntent: { signalStrength: "high", detectedAt: new Date().toISOString() } };
    expect(scoreSignals(fresh, { hiring: 2 }).bonus).toBeGreaterThan(0);
  });

  it("keeps a structural signal (shared investors) regardless of age", () => {
    const old = new Date(Date.now() - 900 * 24 * 60 * 60 * 1000).toISOString();
    const props = { investorOverlap: { commonInvestors: ["Founders Fund"], scannedAt: old } };
    expect(scoreSignals(props, { investor_overlap: 1 }).bonus).toBe(5);
  });

  it("floors a negative multiplier at 0 — a buggy multiplier can't take points away", () => {
    const props = {
      latest_funding_stage: "seed",
      fundingLastCheckedAt: new Date().toISOString(),
    };
    const out = scoreSignals(props, { funding: -3 });
    expect(out.bonus).toBe(0);
    expect(out.contributions[0].multiplier).toBe(0);
  });
});
