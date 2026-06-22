import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { deriveSourcesFromContext } from "../claims-from-context";
import type { ProspectContext } from "@/lib/context/prospect-context";

function ctx(over: Partial<ProspectContext> = {}): ProspectContext {
  return {
    contact: { id: "c", firstName: null, lastName: null, fullName: "x", email: null, title: null, seniority: null, departments: [], linkedinUrl: null, score: null, scoreReasons: [] },
    company: null,
    signals: [],
    bestSignal: null,
    technologies: [],
    funding: { stage: null, amount: null, amountPrinted: null },
    knowledge: [],
    productDescription: "",
    aiTone: "",
    companyName: "",
    previousEmails: [],
    recentActivities: [],
    ...over,
  };
}

describe("deriveSourcesFromContext", () => {
  it("funding stage -> a funding source", () => {
    const s = deriveSourcesFromContext(ctx({ funding: { stage: "Series A", amount: null, amountPrinted: "$5M" } }));
    expect(s).toContainEqual({ kind: "funding", label: "Series A $5M" });
  });

  it("signal with a URL dataSource gets an href; a non-URL one does not", () => {
    const s = deriveSourcesFromContext(
      ctx({
        signals: [
          { type: "hiring", title: "Hiring AEs", description: "d", relevance: "high", dataSource: "https://x.com/jobs" },
          { type: "news", title: "Mentioned", description: "d2", relevance: "high", dataSource: "apollo" },
        ],
      }),
    );
    expect(s.find((x) => x.label === "Hiring AEs")?.href).toBe("https://x.com/jobs");
    expect(s.find((x) => x.label === "Mentioned")?.href).toBeUndefined();
  });

  it("research-brief public content -> source with quote", () => {
    const s = deriveSourcesFromContext(
      ctx({
        researchBrief: { bestAngle: null, painPoints: [], competitorDetected: null, publicContent: [{ type: "blog_post", title: "T", quote: "Q" }], warmthSignals: [] },
      }),
    );
    expect(s).toContainEqual({ kind: "blog_post", label: "T", quote: "Q" });
  });

  it("empty context -> []", () => {
    expect(deriveSourcesFromContext(ctx())).toEqual([]);
  });
});
