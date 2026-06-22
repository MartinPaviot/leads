import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { buildPersonalizationBrief } from "@/lib/agents/sequence-generator";
import type { ProspectContext, ResearchBriefContext } from "@/lib/context/prospect-context";

function ctx(over: Partial<ProspectContext> = {}): ProspectContext {
  return {
    contact: {
      id: "c", firstName: "A", lastName: "B", fullName: "A B", email: "a@b.com",
      title: "VP Eng", seniority: "vp", departments: [], linkedinUrl: null, score: null, scoreReasons: [],
    },
    company: {
      id: "co", name: "Acme", domain: null, industry: "SaaS", size: "50", revenue: null,
      description: null, foundedYear: null, city: null, state: null, country: null,
    },
    signals: [],
    bestSignal: { type: "hiring", title: "Hiring 5 AEs", description: "scaling sales", relevance: "high" },
    technologies: ["Salesforce"],
    funding: { stage: null, amount: null, amountPrinted: null },
    knowledge: [], productDescription: "", aiTone: "Direct", companyName: "Us",
    previousEmails: [], recentActivities: [],
    ...over,
  };
}

const rb = (o: Partial<ResearchBriefContext>): ResearchBriefContext => ({
  bestAngle: null, painPoints: [], competitorDetected: null, publicContent: [], warmthSignals: [], ...o,
});

describe("buildPersonalizationBrief — research leads", () => {
  it("puts the research ANGLE before the firmographic SIGNAL", () => {
    const out = buildPersonalizationBrief(
      ctx({ researchBrief: rb({ bestAngle: "They just lost their VP Sales", painPoints: ["ramp"], competitorDetected: "Outreach" }) }),
    );
    const angleAt = out.indexOf("ANGLE (from research)");
    const signalAt = out.indexOf("SIGNAL TO USE");
    expect(angleAt).toBeGreaterThanOrEqual(0);
    expect(signalAt).toBeGreaterThan(angleAt);
    expect(out).toContain("COMPETITOR DETECTED: Outreach");
  });

  it("without a brief, emits no research lines and keeps firmographic facts", () => {
    const out = buildPersonalizationBrief(ctx());
    expect(out).not.toContain("from research");
    expect(out).toContain("SIGNAL TO USE");
  });

  it("partial brief (pains only) emits only the pains line", () => {
    const out = buildPersonalizationBrief(ctx({ researchBrief: rb({ painPoints: ["slow onboarding"] }) }));
    expect(out).toContain("PAIN POINTS (from research): slow onboarding");
    expect(out).not.toContain("ANGLE (from research)");
  });
});
