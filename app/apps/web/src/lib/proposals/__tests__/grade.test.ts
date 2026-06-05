import { describe, it, expect } from "vitest";
import { gradeSection } from "../grade";

describe("gradeSection (independent citation-support grading)", () => {
  it("rates a well-supported section high (claims overlap the cited source)", () => {
    const content = "Acme needs faster proposal turnaround and cleaner pipeline data.";
    const sources = ["the priority is faster proposal turnaround and clean pipeline data for Acme"];
    const r = gradeSection(content, sources, "high");
    expect(r.unsupported).toBe(false);
    expect(r.confidence).toBe("high");
    expect(r.supportRatio).toBeGreaterThanOrEqual(0.6);
  });

  it("downgrades a confident but unsupported section (citation hallucination)", () => {
    const content = "Our platform guarantees a 300% ROI within ninety days, certified by Gartner.";
    const sources = ["short call about scheduling a follow-up next week"];
    const r = gradeSection(content, sources, "high"); // model claimed high
    expect(r.unsupported).toBe(true);
    expect(r.confidence).toBe("low"); // independent grade overrides self-rating
  });

  it("treats a section with no citations as ungrounded", () => {
    const r = gradeSection("A bold claim with nothing behind it.", [], "high");
    expect(r).toMatchObject({ unsupported: true, confidence: "low", supportRatio: 0 });
  });

  it("never rates higher than the model's own self-rating", () => {
    const content = "Faster proposal turnaround and cleaner pipeline data.";
    const sources = ["faster proposal turnaround and cleaner pipeline data"];
    const r = gradeSection(content, sources, "medium"); // model was cautious
    expect(r.confidence).toBe("medium"); // grade would be high, capped to medium
  });

  it("empty content abstains", () => {
    expect(gradeSection("   ", ["anything"], "high")).toMatchObject({
      unsupported: true,
      confidence: "low",
    });
  });
});
