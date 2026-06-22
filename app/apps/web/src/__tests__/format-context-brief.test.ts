import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { formatContextForPrompt, type ProspectContext, type ResearchBriefContext } from "@/lib/context/prospect-context";

function ctx(over: Partial<ProspectContext> = {}): ProspectContext {
  return {
    contact: {
      id: "c", firstName: "A", lastName: "B", fullName: "A B", email: "a@b.com",
      title: "VP Eng", seniority: "vp", departments: ["eng"], linkedinUrl: null, score: null, scoreReasons: [],
    },
    company: {
      id: "co", name: "Acme", domain: null, industry: "SaaS", size: "50", revenue: null,
      description: null, foundedYear: null, city: null, state: null, country: null,
    },
    signals: [], bestSignal: null, technologies: [], funding: { stage: null, amount: null, amountPrinted: null },
    knowledge: [], productDescription: "", aiTone: "Direct", companyName: "Us",
    previousEmails: [], recentActivities: [],
    ...over,
  };
}

const rb = (o: Partial<ResearchBriefContext>): ResearchBriefContext => ({
  bestAngle: null, painPoints: [], competitorDetected: null, publicContent: [], warmthSignals: [], ...o,
});

describe("formatContextForPrompt — RESEARCH BRIEF section", () => {
  it("includes the brief, leading with the angle, before BUYING SIGNALS", () => {
    const out = formatContextForPrompt(
      ctx({
        signals: [{ type: "hiring", title: "Hiring", description: "d", relevance: "high" }],
        researchBrief: rb({ bestAngle: "lost VP Sales", painPoints: ["ramp"], competitorDetected: "Outreach" }),
      }),
    );
    expect(out).toContain("RESEARCH BRIEF (use this angle first):");
    expect(out).toContain("Best angle: lost VP Sales");
    expect(out.indexOf("RESEARCH BRIEF")).toBeLessThan(out.indexOf("BUYING SIGNALS"));
  });

  it("truncated quote (<=200) appears for public content, max 2", () => {
    const out = formatContextForPrompt(
      ctx({ researchBrief: rb({ publicContent: [{ type: "linkedin_post", title: "t", quote: "y".repeat(200) }] }) }),
    );
    expect(out).toContain('They said publicly (linkedin_post): "');
  });

  it("without a brief, no RESEARCH BRIEF section (no regression)", () => {
    const out = formatContextForPrompt(ctx());
    expect(out).not.toContain("RESEARCH BRIEF");
  });
});
