import { describe, it, expect, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { buildGenerationPrompt } from "@/lib/agents/sequence-generator";
import type { ProspectContext } from "@/lib/context/prospect-context";

// Minimal but shaped methodology + strategies — buildGenerationPrompt only reads
// these fields. Cast to satisfy the structural types without the full libraries.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const methodology: any = {
  name: "BASHO", description: "d", maxWords: 80, structure: "s", toneNotes: "t", ctaType: "q", whatNotToDo: ["x"],
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const strategies: any[] = [
  { stepNumber: 1, name: "Hook", purpose: "p", maxWords: 80, toneNotes: "t", ctaType: "q", whatNotToDo: ["y"], delayDays: 0 },
];

const ctx: ProspectContext = {
  contact: {
    id: "c", firstName: "A", lastName: "B", fullName: "A B", email: "a@b.com",
    title: "VP Eng", seniority: "vp", departments: [], linkedinUrl: null, score: null, scoreReasons: [],
  },
  company: {
    id: "co", name: "Acme", domain: null, industry: "SaaS", size: "50", revenue: null,
    description: null, foundedYear: null, city: null, state: null, country: null,
  },
  signals: [], bestSignal: null, technologies: [], funding: { stage: null, amount: null, amountPrinted: null },
  knowledge: [], productDescription: "", aiTone: "Direct", companyName: "Us",
  previousEmails: [], recentActivities: [],
};

describe("buildGenerationPrompt — rejection counter prefix", () => {
  it("prefixes the founder-feedback block ahead of the SDR role, with the count", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = buildGenerationPrompt(ctx, methodology, null, strategies as any, undefined, undefined, {
      category: "tone",
      count: 4,
    });
    expect(out.startsWith("FOUNDER FEEDBACK — TOP PRIORITY")).toBe(true);
    expect(out).toContain("rejected 4 times for tone");
    expect(out.indexOf("FOUNDER FEEDBACK")).toBeLessThan(out.indexOf("world-class SDR"));
  });

  it("no insight -> no feedback block, prompt starts at the SDR role (regression)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = buildGenerationPrompt(ctx, methodology, null, strategies as any, undefined, undefined, null);
    expect(out).not.toContain("FOUNDER FEEDBACK");
    expect(out.startsWith("You are a world-class SDR")).toBe(true);
  });
});
