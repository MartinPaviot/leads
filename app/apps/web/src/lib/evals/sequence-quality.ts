/**
 * P0-3 — runs the data-backed email grader (gradeEmail) over a generated
 * sequence so EVERY sequence (bulk AND preview) is scored before it becomes a
 * draft. Replaces the bespoke lint (evaluateSequenceQuality) as the
 * evaluator-optimizer's evaluateFn. Pure + deterministic (string-match), no DB.
 */

import { gradeEmail, type EmailGradeResult } from "./email-quality-grader";
import type { FRAMEWORKS } from "@/skills/outreach/knowledge/email-benchmarks";
import type { ProspectContext } from "@/lib/context/prospect-context";
import type { Methodology } from "@/lib/scoring/outbound-methodologies";

/** getMethodology only ever returns these 4 names; map them to grader frameworks. */
const METHODOLOGY_TO_FRAMEWORK: Record<string, keyof typeof FRAMEWORKS> = {
  BASHO: "basho",
  Challenger: "challenger",
  "Problem-Solution": "problem_solution",
  "Product-Led": "product_led",
  // "Mouse Trap" is never returned by getMethodology — intentionally unmapped.
};

export function methodologyToFramework(name: string): keyof typeof FRAMEWORKS | undefined {
  return METHODOLOGY_TO_FRAMEWORK[name]; // undefined -> neutral framework in gradeEmail
}

/** BASHO targets C-suite/founders — held to a higher bar than the rest. */
const TIER1_FRAMEWORKS = new Set<keyof typeof FRAMEWORKS>(["basho"]);

export function passThresholdFor(methodology: Methodology): number {
  const fw = methodologyToFramework(methodology.name);
  return fw && TIER1_FRAMEWORKS.has(fw) ? 0.8 : 0.7;
}

export function gradeGeneratedStep(
  step: { subject: string; body: string; stepNumber: number },
  ctx: ProspectContext,
  methodology: Methodology,
): EmailGradeResult & { stepNumber: number } {
  if (!step.body || step.body.trim() === "") {
    return { stepNumber: step.stepNumber, score: 0, dimensions: [], issues: ["empty body"], strengths: [] };
  }
  const result = gradeEmail({
    email: step.body,
    subjectLine: step.subject,
    framework: methodologyToFramework(methodology.name),
    prospectContext: {
      name: ctx.contact?.fullName,
      company: ctx.company?.name,
      signal: ctx.bestSignal?.title,
      seniority: ctx.contact?.seniority ?? undefined,
    },
  });
  return { ...result, stepNumber: step.stepNumber };
}

export interface SequenceQualityResult {
  pass: boolean;
  score: number;
  feedback: string;
  perStep: Array<{ stepNumber: number; composite: number; dimensions: Record<string, number> }>;
}

/**
 * Grade a JSON-serialised GeneratedSequence. Shaped to satisfy the
 * evaluator-optimizer's evaluateFn ({ pass, score, feedback }) while also
 * carrying perStep for attaching qualityScore to the result.
 */
export function gradeSequenceQuality(
  output: string,
  ctx: ProspectContext,
  methodology: Methodology,
): SequenceQualityResult {
  let seq: { steps?: Array<{ subject: string; body: string; stepNumber: number }> };
  try {
    seq = JSON.parse(output);
  } catch {
    return { pass: false, score: 0, feedback: "Invalid JSON output", perStep: [] };
  }
  if (!seq.steps || seq.steps.length === 0) {
    return { pass: false, score: 0, feedback: "Empty sequence", perStep: [] };
  }

  const graded = seq.steps.map((s) => gradeGeneratedStep(s, ctx, methodology));
  const composite = graded.reduce((a, g) => a + g.score, 0) / graded.length;

  // Per-dimension issues fed back to the regeneration prompt.
  const feedback = graded.flatMap((g) => g.issues.map((iss) => `Step ${g.stepNumber}: ${iss}`)).join("\n");

  const perStep = graded.map((g) => ({
    stepNumber: g.stepNumber,
    composite: g.score,
    dimensions: Object.fromEntries(g.dimensions.map((d) => [d.name, d.score])),
  }));

  const threshold = passThresholdFor(methodology);
  return { pass: composite >= threshold, score: composite, feedback, perStep };
}
