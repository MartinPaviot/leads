import { describe, it, expect, vi } from "vitest";

// build-intelligence-brief transitively imports @/db + the synthesizer (which
// constructs an Anthropic client at module load). Stub both so the pure mappers
// can be imported without infra / API keys.
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/db/schema", () => ({ intelligenceBriefs: {}, companies: {}, contacts: {} }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: vi.fn() }; } }));

import { toResearchBriefContext, briefIsEmpty } from "@/lib/campaign-engine/build-intelligence-brief";
import type { IntelligenceBrief, FirmographicFacts } from "@/lib/campaign-engine/types";
import { EMPTY_FIRMOGRAPHICS } from "@/lib/campaign-engine/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function brief(over: Partial<IntelligenceBrief> = {}): IntelligenceBrief {
  return {
    id: "b", tenantId: "t", companyId: "c", contactId: null, websiteSummary: null,
    recentNews: [], jobPostings: [], techStack: [], linkedinActivity: null,
    publicContent: [], competitorDetected: null, communicationStyle: null,
    painPoints: [], bestAngle: null, warmthSignals: [], publicContentDepth: 0,
    sourcesAttempted: 0, sourcesSucceeded: 0, sourceErrors: [],
    researchedAt: "2026-01-01", expiresAt: "2026-02-01", ...over,
  } as IntelligenceBrief;
}

describe("toResearchBriefContext", () => {
  it("keeps up to 6 publicContent and trims quote to 200 chars", () => {
    const long = "x".repeat(300);
    const r = toResearchBriefContext(
      brief({
        publicContent: [
          { type: "linkedin_post", title: "a", quote: long, url: "", date: "" },
          { type: "blog_post", title: "b", quote: "short", url: "", date: "" },
          { type: "talk", title: "c", quote: "third", url: "", date: "" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ] as any,
      }),
    );
    expect(r.publicContent).toHaveLength(3);
    expect(r.publicContent[0].quote).toHaveLength(200);
  });

  it("caps publicContent at 6 and prioritises verified 'metric' facts", () => {
    const items = Array.from({ length: 7 }, (_, i) => ({
      type: i === 6 ? "metric" : "blog_post",
      title: `t${i}`,
      quote: i === 6 ? "3,848 projects across 110 countries" : `q${i}`,
      url: "",
      date: "",
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = toResearchBriefContext(brief({ publicContent: items as any }));
    expect(r.publicContent).toHaveLength(6);
    // the lone metric (last in input) is hoisted to the front so it survives the cap
    expect(r.publicContent[0]).toMatchObject({ type: "metric", quote: "3,848 projects across 110 countries" });
  });

  it("maps angle / pains / competitor / warmth", () => {
    const r = toResearchBriefContext(
      brief({
        bestAngle: "lead with X",
        painPoints: ["p1"],
        competitorDetected: "Foo",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        warmthSignals: [{ type: "alumni", detail: "same school" }] as any,
      }),
    );
    expect(r).toMatchObject({ bestAngle: "lead with X", painPoints: ["p1"], competitorDetected: "Foo" });
    expect(r.warmthSignals[0]).toEqual({ type: "alumni", detail: "same school" });
  });
});

describe("briefIsEmpty", () => {
  it("true when everything is empty/null", () => {
    expect(briefIsEmpty(toResearchBriefContext(brief()))).toBe(true);
  });
  it("false as soon as any field is present", () => {
    expect(briefIsEmpty(toResearchBriefContext(brief({ bestAngle: "x" })))).toBe(false);
    expect(briefIsEmpty(toResearchBriefContext(brief({ painPoints: ["p"] })))).toBe(false);
    expect(briefIsEmpty(toResearchBriefContext(brief({ competitorDetected: "C" })))).toBe(false);
  });
});

describe("toResearchBriefContext — P1-10 firmographics", () => {
  const facts: FirmographicFacts = {
    ...EMPTY_FIRMOGRAPHICS,
    employeeCount: 120,
    fundingStage: "Series B",
    totalFunding: 30_000_000,
  };

  it("attaches firmographics when a verifiable fact exists, with provenance", () => {
    const r = toResearchBriefContext(
      brief({
        firmographics: facts,
        firmographicProvenance: [{ field: "employeeCount", provider: "apollo", atIso: "2026-01-01" }],
      }),
    );
    expect(r.firmographics).toBeDefined();
    expect(r.firmographics!.facts.employeeCount).toBe(120);
    expect(r.firmographics!.provenance[0]).toMatchObject({ field: "employeeCount", provider: "apollo" });
  });

  it("omits firmographics when null or all-empty (so briefIsEmpty stays honest)", () => {
    expect(toResearchBriefContext(brief({ firmographics: null })).firmographics).toBeUndefined();
    expect(
      toResearchBriefContext(brief({ firmographics: { ...EMPTY_FIRMOGRAPHICS } })).firmographics,
    ).toBeUndefined();
    // a brief with ONLY firmographics is not empty
    expect(briefIsEmpty(toResearchBriefContext(brief({ firmographics: facts })))).toBe(false);
    // a brief with all-empty firmographics IS empty
    expect(briefIsEmpty(toResearchBriefContext(brief({ firmographics: { ...EMPTY_FIRMOGRAPHICS } })))).toBe(true);
  });
});
