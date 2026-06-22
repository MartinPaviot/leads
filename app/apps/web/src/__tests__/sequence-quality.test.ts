import { describe, it, expect } from "vitest";
import {
  methodologyToFramework,
  passThresholdFor,
  gradeGeneratedStep,
  gradeSequenceQuality,
} from "@/lib/evals/sequence-quality";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const methodology = (name: string): any => ({
  name, description: "d", maxWords: 80, structure: "s", toneNotes: "t", ctaType: "q", whatNotToDo: [],
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ctx: any = {
  contact: { fullName: "Jane Doe", seniority: "vp" },
  company: { name: "Acme" },
  bestSignal: { title: "Hiring 5 AEs" },
};

const dim = (r: { dimensions: Array<{ name: string; score: number }> }, name: string) =>
  r.dimensions.find((d) => d.name === name)?.score;

describe("methodologyToFramework / passThresholdFor", () => {
  it("maps the 4 real methodology names", () => {
    expect(methodologyToFramework("BASHO")).toBe("basho");
    expect(methodologyToFramework("Problem-Solution")).toBe("problem_solution");
    expect(methodologyToFramework("Challenger")).toBe("challenger");
    expect(methodologyToFramework("Product-Led")).toBe("product_led");
  });
  it("unknown name -> undefined (no throw)", () => {
    expect(methodologyToFramework("Nope")).toBeUndefined();
  });
  it("BASHO is tier-1 (0.80), others 0.70", () => {
    expect(passThresholdFor(methodology("BASHO"))).toBe(0.8);
    expect(passThresholdFor(methodology("Challenger"))).toBe(0.7);
    expect(passThresholdFor(methodology("Nope"))).toBe(0.7);
  });
});

describe("gradeGeneratedStep", () => {
  it("empty body -> composite 0 + 'empty body' issue", () => {
    const r = gradeGeneratedStep({ subject: "hi", body: "  ", stepNumber: 1 }, ctx, methodology("BASHO"));
    expect(r.score).toBe(0);
    expect(r.issues).toContain("empty body");
  });
  it("over-length BASHO body -> word_count dimension < 0.6", () => {
    const body = "word ".repeat(200);
    const r = gradeGeneratedStep({ subject: "q", body, stepNumber: 1 }, ctx, methodology("BASHO"));
    expect(dim(r, "word_count")).toBeLessThan(0.6);
  });
  it("dead opener -> anti_patterns dimension < 1.0", () => {
    const r = gradeGeneratedStep(
      { subject: "q", body: "I hope this finds you well. Worth a quick chat?", stepNumber: 1 },
      ctx,
      methodology("Challenger"),
    );
    expect(dim(r, "anti_patterns")).toBeLessThan(1.0);
  });
  it("placeholder name + no signal -> no throw, composite in [0,1]", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tmpl: any = { contact: { fullName: "{{firstName}} {{lastName}}", seniority: null }, company: { name: "Target" }, bestSignal: null };
    const r = gradeGeneratedStep({ subject: "q", body: "Are you rethinking your ramp?", stepNumber: 1 }, tmpl, methodology("Nope"));
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});

describe("gradeSequenceQuality", () => {
  const seq = (steps: unknown[]) => JSON.stringify({ sequenceName: "n", sequenceReasoning: "r", steps });

  it("valid sequence -> perStep matches steps, score in [0,1]", async () => {
    const out = await gradeSequenceQuality(
      seq([
        { stepNumber: 1, subject: "q", body: "Are you rethinking your sales ramp?", delayDays: 0 },
        { stepNumber: 2, subject: "q2", body: "Worth a 10-min look?", delayDays: 3 },
      ]),
      ctx,
      methodology("Challenger"),
    );
    expect(out.perStep).toHaveLength(2);
    expect(out.score).toBeGreaterThanOrEqual(0);
    expect(out.score).toBeLessThanOrEqual(1);
  });
  it("invalid JSON -> pass:false score:0", async () => {
    const out = await gradeSequenceQuality("not json", ctx, methodology("BASHO"));
    expect(out).toMatchObject({ pass: false, score: 0, feedback: "Invalid JSON output" });
  });
  it("empty steps -> pass:false score:0", async () => {
    const out = await gradeSequenceQuality(seq([]), ctx, methodology("BASHO"));
    expect(out).toMatchObject({ pass: false, score: 0 });
  });
  it("feedback is per-step labelled", async () => {
    const out = await gradeSequenceQuality(seq([{ stepNumber: 1, subject: "q", body: "", delayDays: 0 }]), ctx, methodology("BASHO"));
    expect(out.feedback).toContain("Step 1:");
  });
});
