import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGenerate = vi.fn();
vi.mock("@/lib/ai/traced-ai", () => ({ tracedGenerateObject: (...a: unknown[]) => mockGenerate(...a) }));
vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: () => ({}) }));
vi.mock("@/db", () => ({ db: {} }));

import { generateSequence, evaluateSequenceQuality } from "@/lib/agents/sequence-generator";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = {
  contact: { id: "c", fullName: "Jane Doe", firstName: "Jane", lastName: "Doe", seniority: "vp", title: "VP Eng", email: "j@acme.com", departments: [], linkedinUrl: null, score: null, scoreReasons: [] },
  company: { name: "Acme", industry: "SaaS", size: "50" },
  signals: [], bestSignal: null, technologies: [], funding: { stage: null, amount: null, amountPrinted: null },
  knowledge: [], productDescription: "", aiTone: "Direct", companyName: "Us",
  previousEmails: [], recentActivities: [],
};

const cleanStep = {
  stepNumber: 1, subject: "quick q",
  body: "Are you rethinking your sales ramp after the new hires? Worth a 10-min look at how peers cut ramp time?",
  delayDays: 0, purpose: "p",
};
const emptyStep = { stepNumber: 1, subject: "hi", body: "", delayDays: 0, purpose: "p" };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const seqObj = (steps: any[]) => ({ object: { sequenceName: "n", sequenceReasoning: "r", steps } });

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "test";
  mockGenerate.mockReset();
});

describe("generateSequence — quality gate (bulk + preview)", () => {
  it("bulk path (no evaluate) attaches sequenceQuality + per-step qualityScore", async () => {
    mockGenerate.mockResolvedValue(seqObj([cleanStep]));
    const out = await generateSequence(ctx, { stepCount: 1 });
    expect(out.sequenceQuality).toBeDefined();
    expect(typeof out.sequenceQuality!.composite).toBe("number");
    expect(typeof out.sequenceQuality!.passed).toBe("boolean");
    expect(out.steps[0].qualityScore?.composite).toBeTypeOf("number");
  });

  it("below-threshold output refines: 2 LLM calls, 2nd prompt carries feedback", async () => {
    mockGenerate.mockResolvedValueOnce(seqObj([emptyStep])).mockResolvedValueOnce(seqObj([cleanStep]));
    const out = await generateSequence(ctx, { stepCount: 1 });
    expect(mockGenerate).toHaveBeenCalledTimes(2);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secondPrompt = (mockGenerate.mock.calls[1][0] as any).prompt as string;
    expect(secondPrompt).toContain("PREVIOUS ATTEMPT FEEDBACK");
    expect(out.sequenceQuality!.iterations).toBeGreaterThanOrEqual(2);
  });

  it("stays below threshold -> best output returned, passed:false, no throw", async () => {
    mockGenerate.mockResolvedValue(seqObj([emptyStep]));
    const out = await generateSequence(ctx, { stepCount: 1 });
    expect(out.sequenceQuality!.passed).toBe(false);
    expect(out.steps).toHaveLength(1);
  });

  it("evaluateSequenceQuality stays exported (compat, no longer called by the loop)", () => {
    expect(evaluateSequenceQuality).toBeTypeOf("function");
  });
});
