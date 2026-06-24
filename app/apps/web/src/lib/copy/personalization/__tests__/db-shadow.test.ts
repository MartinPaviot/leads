import { describe, it, expect, afterEach, vi } from "vitest";
import type { ProspectContext } from "@/lib/context/prospect-context";

// buildProspectContext is not injectable — mock it at the module boundary so the
// happy path runs without a DB. The other IO (copyContextForTenant, persist) takes
// an injected stub database.
const ctxState = vi.hoisted(() => ({ ctx: null as unknown }));
vi.mock("@/lib/context/prospect-context", () => ({
  buildProspectContext: vi.fn(async () => ctxState.ctx),
}));

import { copyAssetBlock } from "@/db/schema";
import { buildAgentPrompt, personalizationRunAgent, generateShadowCopy } from "../db-shadow";
import type { PersonalizationAgentInput } from "../generate-message";

const ORIG = process.env.COPY_ENGINE_SHADOW;
afterEach(() => {
  if (ORIG === undefined) delete process.env.COPY_ENGINE_SHADOW;
  else process.env.COPY_ENGINE_SHADOW = ORIG;
});

const agentInput = (over: Partial<PersonalizationAgentInput> = {}): PersonalizationAgentInput => ({
  kind: "grounded-personalization",
  assets: { positioning: "We cut onboarding time.", offer: "30-day pilot" },
  voice: { banned: ["synergy"], frFormality: "vouvoiement" },
  evidence: [{ id: "pc-0", fact: "We just shipped X", source: "linkedin_post", confidence: 0.85 }],
  lang: "en",
  ...over,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { assets?: any[]; guides?: any[]; onInsert?: (v: any) => void } = {}) {
  return {
    select: () => {
      let table: any;
      const chain: any = { from: (t: any) => { table = t; return chain; }, where: async () => (table === copyAssetBlock ? (opts.assets ?? []) : (opts.guides ?? [])) };
      return chain;
    },
    insert: () => ({ values: async (v: any) => { opts.onInsert?.(v); } }),
  } as any;
}

describe("buildAgentPrompt", () => {
  it("lists evidence by id and the banned tokens", () => {
    const { system, user } = buildAgentPrompt(agentInput());
    expect(system).toMatch(/NEVER invent/);
    expect(user).toContain("[pc-0]");
    expect(user).toContain("We just shipped X");
    expect(user).toContain("synergy");
  });
});

describe("personalizationRunAgent", () => {
  it("parses a grounded JSON result", async () => {
    const res = await personalizationRunAgent(agentInput(), async () => JSON.stringify({ line: "Saw you shipped X.", citedIds: ["pc-0"] }));
    expect(res.evalPassed).toBe(true);
    expect(res.value).toMatchObject({ line: "Saw you shipped X.", citedIds: ["pc-0"] });
  });

  it("returns a non-result on no-JSON / bad shape / throw", async () => {
    expect((await personalizationRunAgent(agentInput(), async () => "no json")).evalPassed).toBe(false);
    expect((await personalizationRunAgent(agentInput(), async () => JSON.stringify({ line: 1 }))).evalPassed).toBe(false);
    expect((await personalizationRunAgent(agentInput(), async () => { throw new Error("model down"); })).evalPassed).toBe(false);
  });
});

describe("generateShadowCopy", () => {
  it("is a no-op when the flag is off", async () => {
    delete process.env.COPY_ENGINE_SHADOW;
    const res = await generateShadowCopy("c1", "t1", { database: stubDb() });
    expect(res).toEqual({ ran: false, reason: "copy_shadow_disabled" });
  });

  it("reports no_prospect_context when the context is missing", async () => {
    process.env.COPY_ENGINE_SHADOW = "1";
    ctxState.ctx = null;
    const res = await generateShadowCopy("c1", "t1", { database: stubDb() });
    expect(res).toEqual({ ran: false, reason: "no_prospect_context" });
  });

  it("generates a grounded high-personalization sample and persists it", async () => {
    process.env.COPY_ENGINE_SHADOW = "1";
    ctxState.ctx = {
      contact: { id: "c1", seniority: "vp", firstName: "Sam", lastName: "Lee", fullName: "Sam Lee", email: "s@x.com", title: "VP", departments: [], linkedinUrl: null, score: null, scoreReasons: [] },
      funding: { stage: null, amount: null, amountPrinted: null },
      technologies: [],
      bestSignal: null,
      researchBrief: { bestAngle: null, painPoints: [], competitorDetected: null, warmthSignals: [], publicContent: [{ type: "linkedin_post", title: "t", quote: "We just shipped X" }] },
    } as unknown as ProspectContext;

    let inserted: any;
    const res = await generateShadowCopy("c1", "t1", {
      database: stubDb({ assets: [{ id: "a1", tenantId: "t1", campaignId: null, lang: "en", kind: "positioning", content: "We cut onboarding time.", version: 1, isCurrent: true, createdAt: new Date() }], onInsert: (v) => (inserted = v) }),
      generate: async () => JSON.stringify({ line: "Saw you just shipped X, relevant to onboarding speed.", citedIds: ["pc-0"] }),
    });
    expect(res.ran).toBe(true);
    expect(res.message?.personalization_level).toBe("high");
    expect(res.message?.body).toContain("shipped X");
    expect(res.evidenceCount).toBe(1);
    expect(inserted).toMatchObject({ tenantId: "t1", contactId: "c1", lang: "en", personalizationLevel: "high" });
  });
});
