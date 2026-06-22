import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/evals/personalization-judge", () => ({ judgePersonalization: vi.fn() }));

import { gradeSequenceQuality } from "@/lib/evals/sequence-quality";
import { judgePersonalization } from "@/lib/evals/personalization-judge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const methodology = (name: string): any => ({ name, description: "d", maxWords: 120, structure: "s", toneNotes: "t", ctaType: "q", whatNotToDo: [] });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = {
  contact: { fullName: "Jane Doe", seniority: "vp" },
  company: { name: "Acme" },
  bestSignal: { title: "Hiring AEs" },
  researchBrief: { bestAngle: "lost VP Sales", painPoints: ["ramp"], competitorDetected: "Outreach", publicContent: [], warmthSignals: [] },
};
const seq = (steps: unknown[]) => JSON.stringify({ sequenceName: "n", sequenceReasoning: "r", steps });
const step = {
  stepNumber: 1,
  subject: "quick q",
  body: "Jane, saw Acme is hiring AEs — are you rethinking your sales ramp? Worth a 10-min look?",
  delayDays: 0,
};

beforeEach(() => vi.clearAllMocks());

describe("gradeSequenceQuality — semantic 2nd stage (P1-12)", () => {
  it("without opts: judge NOT called, no semantic field (regression)", async () => {
    const out = await gradeSequenceQuality(seq([step]), ctx, methodology("Challenger"));
    expect(judgePersonalization).not.toHaveBeenCalled();
    expect(out.perStep[0].semantic).toBeUndefined();
  });

  it("with opts + low groundedScore: personalization tightened to <= judge score", async () => {
    vi.mocked(judgePersonalization).mockResolvedValue({ groundedScore: 0.2, claims: [], skipped: false });
    const out = await gradeSequenceQuality(seq([step]), ctx, methodology("Challenger"), { semanticJudge: true });
    expect(judgePersonalization).toHaveBeenCalledTimes(1);
    expect(out.perStep[0].dimensions.personalization).toBeLessThanOrEqual(0.2);
    expect(out.perStep[0].semantic).toEqual({ groundedScore: 0.2, skipped: false });
  });

  it("with opts + skipped judge: personalization unchanged, semantic.skipped true", async () => {
    vi.mocked(judgePersonalization).mockResolvedValue({ groundedScore: 0.5, claims: [], skipped: true });
    const out = await gradeSequenceQuality(seq([step]), ctx, methodology("Challenger"), { semanticJudge: true });
    expect(out.perStep[0].semantic).toEqual({ groundedScore: 0.5, skipped: true });
  });

  it("empty-body step (score 0): judge NOT called even with opts", async () => {
    const out = await gradeSequenceQuality(
      seq([{ stepNumber: 1, subject: "q", body: "", delayDays: 0 }]),
      ctx,
      methodology("Challenger"),
      { semanticJudge: true },
    );
    expect(judgePersonalization).not.toHaveBeenCalled();
    expect(out.perStep[0].composite).toBe(0);
  });
});
