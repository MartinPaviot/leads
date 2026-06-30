import { describe, it, expect } from "vitest";
import { buildReplyContextBrief } from "@/lib/inbox/reply-context";
import { knowledgeSection } from "@/lib/inbox/reply-knowledge";
import { buildReplyPrompt } from "@/lib/inbox/compose-reply";
import type { EnrichedProspectContext } from "@/lib/context/enriched-prospect-context";

// buildReplyContextBrief only reads extractedSignals + graphFacts, so a partial
// cast keeps the test focused without rebuilding the whole ProspectContext shape.
function ctx(over: Partial<EnrichedProspectContext["extractedSignals"]>, graphFacts: EnrichedProspectContext["graphFacts"] = []): EnrichedProspectContext {
  return {
    extractedSignals: {
      objections: [],
      nextSteps: [],
      championSignals: [],
      budgetMentions: [],
      competitorMentions: [],
      ...over,
    },
    graphFacts,
  } as unknown as EnrichedProspectContext;
}

describe("buildReplyContextBrief", () => {
  it("returns empty when there's nothing grounded to add", () => {
    expect(buildReplyContextBrief(null)).toBe("");
    expect(buildReplyContextBrief(null, "  ")).toBe("");
    expect(buildReplyContextBrief(ctx({}))).toBe("");
  });

  it("includes the deal stage even with no enriched context", () => {
    expect(buildReplyContextBrief(null, "proposal")).toBe("Open deal stage: proposal.");
  });

  it("surfaces only OPEN objections (addressed ones are dropped)", () => {
    const brief = buildReplyContextBrief(
      ctx({ objections: [
        { text: "too expensive", date: "2026-06-01", status: "open" },
        { text: "no SSO", date: "2026-06-02", status: "addressed" },
      ] }),
    );
    expect(brief).toContain("too expensive");
    expect(brief).not.toContain("no SSO");
  });

  it("rolls up next steps, budget, champions and dedupes competitors", () => {
    const brief = buildReplyContextBrief(
      ctx({
        nextSteps: [{ text: "send security doc", owner: "us" }],
        budgetMentions: [{ text: "~50k budget" }],
        championSignals: [{ text: "VP is sponsoring", contactName: "" }],
        competitorMentions: [
          { competitor: "Clay", context: "" },
          { competitor: "Clay", context: "" },
          { competitor: "Apollo", context: "" },
        ],
      }),
    );
    expect(brief).toContain("send security doc");
    expect(brief).toContain("~50k budget");
    expect(brief).toContain("VP is sponsoring");
    // deduped to a single "Clay"
    expect(brief.match(/Clay/g)?.length).toBe(1);
    expect(brief).toContain("Apollo");
  });

  it("only keeps high-confidence graph facts (>= 0.6)", () => {
    const brief = buildReplyContextBrief(
      ctx({}, [
        { relation: "DISCUSSED", fact: "pilot starts July", date: "2026-06-10", confidence: 0.9 },
        { relation: "GUESS", fact: "maybe churned", date: "2026-06-10", confidence: 0.4 },
      ]),
    );
    expect(brief).toContain("pilot starts July");
    expect(brief).not.toContain("maybe churned");
  });
});

describe("knowledgeSection", () => {
  it("returns empty for an empty/whitespace block (so callers can append unconditionally)", () => {
    expect(knowledgeSection("")).toBe("");
    expect(knowledgeSection("   ")).toBe("");
  });

  it("wraps a non-empty block with the cite-only / no-invent guard", () => {
    const out = knowledgeSection("- Pricing: €X/seat/mo");
    expect(out).toContain("PRODUCT FACTS");
    expect(out).toContain("never invent");
    expect(out).toContain("€X/seat/mo");
  });
});

describe("reply prompt grounding seam", () => {
  it("threads the knowledge section (instructions) and the account brief (context) into the prompt", () => {
    const prompt = buildReplyPrompt(
      [{ direction: "inbound", from: "sarah@x.com", body: "pricing for 8 seats?", at: "2026-06-20" }],
      { instructions: knowledgeSection("- Pricing: €120/seat/mo"), context: "Open deal stage: proposal." },
    );
    expect(prompt).toContain("PRODUCT FACTS");
    expect(prompt).toContain("€120/seat/mo");
    // the account brief lands in the "What you know about them" slot
    expect(prompt).toContain("What you know about them: Open deal stage: proposal.");
  });
});
