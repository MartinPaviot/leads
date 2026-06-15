import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * End-to-end proof (deterministic, no LLM/DB) that the prep the model receives
 * is specialized to the moment: a discovery prompt carries the discovery
 * doctrine, a demo prompt the demo doctrine, and a demo with no discovery
 * trace refuses without ever calling the model. We mock only the I/O boundary
 * (db, prospect context, LLM) and assert on the assembled prompt.
 */

const h = vi.hoisted(() => ({
  deal: null as Record<string, unknown> | null,
  prompt: "",
  llmCalled: false,
  overrideWritten: false,
}));

vi.mock("@/lib/context/prospect-context", () => ({
  buildProspectContext: async () => ({
    contact: { fullName: "Jane Doe" },
    company: { name: "Acme" },
  }),
  formatContextForPrompt: () => "PROSPECT CONTEXT BLOCK",
}));

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => Promise.resolve(h.deal ? [h.deal] : []) }) }),
    update: () => ({
      set: () => ({
        where: () => {
          h.overrideWritten = true;
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: async (args: { prompt: string }) => {
    h.llmCalled = true;
    h.prompt = args.prompt;
    return {
      object: {
        executiveSummary: "x",
        personInsights: [],
        companyInsights: [],
        competitiveLandscape: "",
        callStrategy: "",
        openingHook: "",
        discoveryQuestions: [],
        valuePropositions: [],
        objectionHandlers: [],
        closingMove: "",
      },
    };
  },
}));

vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: () => "mock-model" }));
// The handler imports openai at top level; we never use it (ANTHROPIC_API_KEY is
// stubbed), but mocking it avoids loading the real package in vitest.
vi.mock("@ai-sdk/openai", () => ({ openai: () => "mock-openai-model" }));

import { salesCallPrepHandler } from "../handler";

const OPTS = { tenantId: "t1" } as never;

beforeEach(() => {
  h.deal = null;
  h.prompt = "";
  h.llmCalled = false;
  h.overrideWritten = false;
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sales-call-prep is specialized per moment (end-to-end)", () => {
  it("a qualification deal → a DISCOVERY prompt (gap-quantifying questions, not a demo)", async () => {
    h.deal = { id: "d1", tenantId: "t1", stage: "qualification", name: "Deal", value: 50000, expectedCloseDate: null, summary: "Met them", properties: {} };
    const out = await salesCallPrepHandler({ contactId: "c1", dealId: "d1", callType: "discovery" }, OPTS);
    expect(out.moment).toBe("discovery");
    expect(h.prompt).toContain("The question discipline"); // discovery doctrine
    expect(h.prompt).toContain("11 to 14"); // quantifying-question discipline
    expect(h.prompt).not.toContain("EXACTLY 3 capabilities"); // not demo instructions
  });

  it("a demo deal with discovery traces → a DEMO prompt (3 pain-mapped capabilities)", async () => {
    h.deal = { id: "d2", tenantId: "t1", stage: "demo", name: "Deal", value: 50000, expectedCloseDate: null, summary: "Demo scheduled", properties: { competitors: ["Rival"] } };
    const out = await salesCallPrepHandler({ contactId: "c1", dealId: "d2", callType: "demo" }, OPTS);
    expect(out.moment).toBe("demo");
    expect(h.llmCalled).toBe(true);
    expect(h.prompt).toContain("EXACTLY 3 capabilities"); // demo instructions
    expect(h.prompt).toContain("Open on their agenda"); // demo doctrine heading
    expect(h.prompt).not.toContain("11 to 14"); // not discovery
  });

  it("a demo deal with NO discovery trace → deterministic refuse, model never called", async () => {
    h.deal = { id: "d3", tenantId: "t1", stage: "demo", name: "Deal", value: null, expectedCloseDate: null, summary: null, properties: {} };
    const out = await salesCallPrepHandler({ contactId: "c1", dealId: "d3", moment: "demo", callType: "discovery" }, OPTS);
    expect(out.moment).toBe("demo"); // explicit moment beats the legacy callType
    expect(out.prep.blocked).toContain("No discovery captured");
    expect(h.llmCalled).toBe(false); // no LLM spend on an unmapped demo
  });

  it("a close deal → a CLOSE prompt that arms the champion", async () => {
    h.deal = { id: "d4", tenantId: "t1", stage: "negotiation", name: "Deal", value: 50000, expectedCloseDate: null, summary: "In legal", properties: {} };
    const out = await salesCallPrepHandler({ contactId: "c1", dealId: "d4", callType: "negotiation" }, OPTS);
    expect(out.moment).toBe("close");
    expect(h.prompt.toLowerCase()).toContain("champion");
  });

  it("an NL momentHint overrides the stage and persists the override", async () => {
    h.deal = { id: "d5", tenantId: "t1", stage: "qualification", name: "Deal", value: 50000, expectedCloseDate: null, summary: "Met", properties: {} };
    const out = await salesCallPrepHandler({ contactId: "c1", dealId: "d5", momentHint: "demo", callType: "discovery" }, OPTS);
    expect(out.moment).toBe("demo"); // NL hint beats the qualification stage AND the legacy callType
    expect(h.overrideWritten).toBe(true); // correction persisted as the deal override
  });
});
