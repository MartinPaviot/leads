import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/campaign-engine/build-intelligence-brief", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  briefIsEmpty: (b: any) =>
    !b || (!b.bestAngle && !(b.painPoints?.length) && !b.competitorDetected && !(b.publicContent?.length) && !(b.warmthSignals?.length)),
}));
vi.mock("@/lib/ai/ai-provider", () => ({ getModelForTask: () => ({ id: "haiku" }) }));
const mockGen = vi.fn();
vi.mock("ai", () => ({ generateText: (...a: unknown[]) => mockGen(...a) }));

import { judgePersonalization, parseJudgeJson } from "@/lib/evals/personalization-judge";
import type { ResearchBriefContext } from "@/lib/context/prospect-context";

const brief = (over: Partial<ResearchBriefContext> = {}): ResearchBriefContext => ({
  bestAngle: "lost VP Sales",
  painPoints: ["ramp"],
  competitorDetected: "Outreach",
  publicContent: [],
  warmthSignals: [],
  ...over,
});

describe("parseJudgeJson", () => {
  it("extracts JSON from prose and computes groundedScore", () => {
    const r = parseJudgeJson('Sure: {"claims":[{"text":"a","grounded":true,"evidence":"x"},{"text":"b","grounded":false,"evidence":null}]} done');
    expect(r.skipped).toBe(false);
    expect(r.groundedScore).toBe(0.5);
  });
  it("no JSON -> neutral skipped", () => {
    expect(parseJudgeJson("no json here").skipped).toBe(true);
  });
  it("broken JSON -> neutral skipped", () => {
    expect(parseJudgeJson("{ broken").skipped).toBe(true);
  });
});

describe("judgePersonalization — fail-open / CI-safe", () => {
  beforeEach(() => {
    mockGen.mockReset();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("no API key -> neutral, model never called", async () => {
    const r = await judgePersonalization("body", brief());
    expect(r).toMatchObject({ groundedScore: 0.5, skipped: true });
    expect(mockGen).not.toHaveBeenCalled();
  });

  it("empty brief -> neutral, model never called", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const r = await judgePersonalization("body", brief({ bestAngle: null, painPoints: [], competitorDetected: null }));
    expect(r.skipped).toBe(true);
    expect(mockGen).not.toHaveBeenCalled();
  });

  it("undefined brief -> neutral", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    expect((await judgePersonalization("body", undefined)).skipped).toBe(true);
  });

  it("with key + verdicts -> groundedScore = grounded/total", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    mockGen.mockResolvedValue({
      text: '{"claims":[{"text":"They lost their VP Sales","grounded":true,"evidence":"angle"},{"text":"You run 50 SDRs","grounded":false,"evidence":null}]}',
    });
    const r = await judgePersonalization("They just lost their VP Sales. You run 50 SDRs.", brief());
    expect(r.skipped).toBe(false);
    expect(r.groundedScore).toBe(0.5);
  });

  it("model throws -> neutral with error (fail-open)", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    mockGen.mockRejectedValue(new Error("boom"));
    const r = await judgePersonalization("body", brief());
    expect(r.skipped).toBe(true);
    expect(r.error).toContain("boom");
  });
});
