import { describe, it, expect } from "vitest";
import { scoreImportance } from "@/lib/inbox/importance";

describe("scoreImportance (INBOX-T04)", () => {
  it("ranks a demo request with an open deal at the top, citing the factors", () => {
    const r = scoreImportance({
      intentLabel: "demo_request",
      hasOpenDeal: true,
      dealStageRank: 3,
      urgencyLevel: "high",
      ageHours: 2,
    });
    expect(r.tier).toBe(1);
    expect(r.score).toBeGreaterThanOrEqual(60);
    const labels = r.factors.map((f) => f.label).join(" ");
    expect(labels).toContain("demo_request");
    expect(labels).toContain("open deal");
  });

  it("ranks a generic thanks below the demo request", () => {
    const demo = scoreImportance({ intentLabel: "demo_request", hasOpenDeal: true, dealStageRank: 3 });
    const thanks = scoreImportance({ intentLabel: "thank_you" });
    expect(thanks.score).toBeLessThan(demo.score);
  });

  it("pins automated/bulk senders to the bottom", () => {
    const r = scoreImportance({ intentLabel: "interested", hasOpenDeal: true, isAutomated: true });
    expect(r.tier).toBe(4);
    expect(r.score).toBe(0);
  });

  it("only counts a signal that is supplied (stale signals are filtered upstream)", () => {
    const withUrgency = scoreImportance({ intentLabel: "question", urgencyLevel: "high" });
    const withoutUrgency = scoreImportance({ intentLabel: "question" });
    expect(withUrgency.score).toBeGreaterThan(withoutUrgency.score);
    expect(withoutUrgency.factors.some((f) => f.label.includes("urgency"))).toBe(false);
  });

  it("never returns an opaque number — factors explain the score", () => {
    const r = scoreImportance({ intentLabel: "pricing_inquiry" });
    expect(r.factors.length).toBeGreaterThan(0);
  });
});
