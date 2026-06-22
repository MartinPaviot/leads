import { describe, it, expect } from "vitest";
import {
  decideFabricationGate,
  briefHasSourcedFacts,
  extractHardSpecifics,
} from "@/lib/evals/fabrication-gate";
import type { ResearchBriefContext } from "@/lib/context/prospect-context";

const prospect = { name: "Denis Mludek", title: "CTO", company: "Bricks.co", domain: "bricks.co" };

const emptyBrief: ResearchBriefContext = {
  bestAngle: null, painPoints: [], competitorDetected: null, publicContent: [], warmthSignals: [],
};
function briefWithFirmographics(over: Partial<NonNullable<ResearchBriefContext["firmographics"]>["facts"]>): ResearchBriefContext {
  return {
    bestAngle: null, painPoints: [], competitorDetected: null, publicContent: [], warmthSignals: [],
    firmographics: {
      facts: {
        industry: null, description: null, employeeCount: null, sizeRange: null, annualRevenue: null,
        revenueRange: null, foundedYear: null, city: null, state: null, country: null, fundingStage: null,
        totalFunding: null, investors: [], technologies: [], ...over,
      },
      provenance: [],
    },
  };
}

describe("briefHasSourcedFacts", () => {
  it("false for empty/undefined; true once any fact or firmographic signal exists", () => {
    expect(briefHasSourcedFacts(undefined)).toBe(false);
    expect(briefHasSourcedFacts(emptyBrief)).toBe(false);
    expect(briefHasSourcedFacts({ ...emptyBrief, bestAngle: "x" })).toBe(true);
    expect(briefHasSourcedFacts(briefWithFirmographics({ employeeCount: 180 }))).toBe(true);
    // all-empty firmographics is NOT a fact
    expect(briefHasSourcedFacts(briefWithFirmographics({}))).toBe(false);
  });
});

describe("extractHardSpecifics", () => {
  it("pulls counts >=100, count-noun numbers, tech tokens, ALLCAPS+year events", () => {
    const s = extractHardSpecifics("We run n8n and Keycloak across 3,848 projects in 81 nations before WTC2027.");
    expect(s.techTokens).toEqual(expect.arrayContaining(["n8n", "keycloak"]));
    expect(s.numbers.map((n) => n.replace(/\D/g, ""))).toEqual(expect.arrayContaining(["3848", "81"]));
    expect(s.events).toEqual(expect.arrayContaining(["WTC2027"]));
  });
  it("does not flag small operational numbers like '15 min' / '24/7'", () => {
    const s = extractHardSpecifics("Worth 15 min? We offer 24/7 support.");
    // 15 and 7 are < 100 and not count-nouns -> not captured
    expect(s.numbers).toEqual([]);
  });
});

describe("decideFabricationGate — empty brief (the Bricks.co case)", () => {
  it("BLOCKS an invented tech stack when there are no sourced facts", () => {
    const v = decideFabricationGate({
      body: "Founder-CTOs building on open source hit the same wall: n8n, Supabase, Keycloak — each needs patching at 2am.",
      brief: emptyBrief,
      prospect,
    });
    expect(v.blocked).toBe(true);
    expect(v.briefHasFacts).toBe(false);
    expect(v.ungrounded.map((u) => u.toLowerCase())).toEqual(expect.arrayContaining(["n8n", "supabase", "keycloak"]));
  });

  it("BLOCKS invented prospect-specific counts when the brief is empty", () => {
    const v = decideFabricationGate({
      body: "You manage 3,848 projects across 110 countries.",
      brief: undefined,
      prospect,
    });
    expect(v.blocked).toBe(true);
    expect(v.ungrounded.map((u) => u.replace(/\D/g, ""))).toEqual(expect.arrayContaining(["3848", "110"]));
  });

  it("ALLOWS a generic role/industry email with no hard specifics", () => {
    const v = decideFabricationGate({
      body: "As CTO at Bricks.co, you're likely balancing shipping speed against infra reliability. Worth a quick chat?",
      brief: emptyBrief,
      prospect,
    });
    expect(v.blocked).toBe(false);
  });
});

describe("decideFabricationGate — does not over-block when facts exist", () => {
  it("a real number grounded in firmographics is NOT flagged", () => {
    const v = decideFabricationGate({
      body: "A 180-person agency on Microsoft 365 hits real coordination limits.",
      brief: briefWithFirmographics({ employeeCount: 180, technologies: ["Microsoft 365"] }),
      prospect: { name: "Sebastien", title: "Directeur", company: "mino SA", domain: "mino.eu" },
    });
    expect(v.briefHasFacts).toBe(true);
    expect(v.blocked).toBe(false);
  });

  it("with a non-empty brief, deterministic layer does NOT second-guess numbers (no false positive on real crawled facts)", () => {
    const v = decideFabricationGate({
      body: "Gold Standard certified 621 new projects in 2024 across 3,848 total.",
      brief: { ...emptyBrief, bestAngle: "audit-trail integrity at scale", painPoints: ["double-counting risk"] },
      prospect: { name: "Justin", title: "CEO", company: "Gold Standard", domain: "goldstandard.org" },
    });
    expect(v.briefHasFacts).toBe(true);
    expect(v.blocked).toBe(false);
  });
});

describe("decideFabricationGate — semantic layer", () => {
  it("a judge claim with grounded:false is blocked regardless of the brief", () => {
    const v = decideFabricationGate({
      body: "I saw you switched to Salesforce last quarter.",
      brief: { ...emptyBrief, bestAngle: "ops scaling" },
      prospect,
      semanticClaims: [
        { text: "switched to Salesforce last quarter", grounded: false, evidence: null },
        { text: "is a CTO", grounded: true, evidence: "Title: CTO" },
      ],
    });
    expect(v.blocked).toBe(true);
    expect(v.ungrounded).toContain("switched to Salesforce last quarter");
    // the grounded claim is NOT listed
    expect(v.ungrounded).not.toContain("is a CTO");
  });
});
