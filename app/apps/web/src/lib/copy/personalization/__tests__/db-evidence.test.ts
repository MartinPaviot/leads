import { describe, it, expect } from "vitest";
import { prospectContextToEvidence } from "../db-evidence";
import type { ProspectContext } from "@/lib/context/prospect-context";

// The adapter only reads researchBrief.publicContent/warmthSignals, funding,
// bestSignal, technologies — a partial fixture cast is sufficient.
const ctx = (over: Partial<ProspectContext> = {}): ProspectContext =>
  ({
    funding: { stage: null, amount: null, amountPrinted: null },
    technologies: [],
    bestSignal: null,
    researchBrief: { bestAngle: null, painPoints: [], competitorDetected: null, publicContent: [], warmthSignals: [] },
    ...over,
  }) as unknown as ProspectContext;

describe("prospectContextToEvidence", () => {
  it("maps public content quotes as the highest-confidence evidence", () => {
    const ev = prospectContextToEvidence(
      ctx({ researchBrief: { bestAngle: null, painPoints: [], competitorDetected: null, warmthSignals: [], publicContent: [{ type: "linkedin_post", title: "t", quote: "We just shipped X" }] } }),
    );
    expect(ev[0]).toMatchObject({ id: "pc-0", source: "linkedin_post", confidence: 0.85 });
    expect(ev[0].fact).toBe("We just shipped X");
  });

  it("maps funding, signal, tech and warmth with descending confidence", () => {
    const ev = prospectContextToEvidence(
      ctx({
        funding: { stage: "Series A", amount: null, amountPrinted: "$12M" },
        bestSignal: { type: "hiring", detail: "Hiring 5 AEs" } as unknown as ProspectContext["bestSignal"],
        technologies: ["Salesforce", "Outreach"],
        researchBrief: { bestAngle: null, painPoints: [], competitorDetected: null, publicContent: [], warmthSignals: [{ type: "alumni", detail: "Both ex-Stripe" }] },
      }),
    );
    const byId = Object.fromEntries(ev.map((e) => [e.id, e]));
    expect(byId.funding.fact).toContain("Series A");
    expect(byId.signal.fact).toBe("Hiring 5 AEs");
    expect(byId.tech.fact).toContain("Salesforce");
    expect(byId["warmth-0"].fact).toBe("Both ex-Stripe");
    expect(byId.funding.confidence).toBeGreaterThan(byId["warmth-0"].confidence);
  });

  it("NEVER emits inferred items (pain points / bestAngle) as evidence", () => {
    const ev = prospectContextToEvidence(
      ctx({ researchBrief: { bestAngle: "cut churn", painPoints: ["scaling pains"], competitorDetected: "Foo", publicContent: [], warmthSignals: [] } }),
    );
    expect(ev).toEqual([]); // nothing groundable → no fabricated evidence
  });
});
