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
import { judgePersonalization, type ClaimVerdict } from "./personalization-judge";
import { decideFabricationGate } from "./fabrication-gate";

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
  perStep: Array<{
    stepNumber: number;
    composite: number;
    dimensions: Record<string, number>;
    semantic?: { groundedScore: number; skipped: boolean };
  }>;
}

export interface GradeOpts {
  /** Opt-in: run the semantic personalization judge as a 2nd stage (an LLM call
   *  per step). Off in the bulk generation path; on for eval/calibration. */
  semanticJudge?: boolean;
}

/**
 * Grade a JSON-serialised GeneratedSequence. Shaped to satisfy the
 * evaluator-optimizer's evaluateFn ({ pass, score, feedback }) while also
 * carrying perStep for attaching qualityScore to the result.
 */
export async function gradeSequenceQuality(
  output: string,
  ctx: ProspectContext,
  methodology: Methodology,
  opts?: GradeOpts,
): Promise<SequenceQualityResult> {
  let seq: { steps?: Array<{ subject: string; body: string; stepNumber: number }> };
  try {
    seq = JSON.parse(output);
  } catch {
    return { pass: false, score: 0, feedback: "Invalid JSON output", perStep: [] };
  }
  if (!seq.steps || seq.steps.length === 0) {
    return { pass: false, score: 0, feedback: "Empty sequence", perStep: [] };
  }
  const steps = seq.steps;

  const graded = steps.map((s) => gradeGeneratedStep(s, ctx, methodology));

  // Per-dimension issues fed back to the regeneration prompt.
  const feedback = graded.flatMap((g) => g.issues.map((iss) => `Step ${g.stepNumber}: ${iss}`)).join("\n");

  // Prospect identity for the anti-fabrication gate's ground truth.
  const prospect = {
    name: ctx.contact?.fullName,
    title: ctx.contact?.title,
    company: ctx.company?.name,
    domain: ctx.company?.domain,
  };
  // Anti-fabrication issues across steps — any one forces a regeneration
  // (pass:false) regardless of composite, so invented specifics never ship.
  const fabricationIssues: string[] = [];

  // P1-12 — optional semantic 2nd stage: the LLM judge can only TIGHTEN the
  // substring personalization score (min), never raise it — catches fake perso.
  const perStep = await Promise.all(
    graded.map(async (g, i) => {
      const base = {
        stepNumber: g.stepNumber,
        composite: g.score,
        dimensions: Object.fromEntries(g.dimensions.map((d) => [d.name, d.score])) as Record<string, number>,
      };

      let semClaims: ClaimVerdict[] | undefined;
      let result: typeof base & { semantic?: { groundedScore: number; skipped: boolean } } = base;

      if (opts?.semanticJudge && g.score !== 0) {
        const sem = await judgePersonalization(steps[i].body, ctx.researchBrief);
        semClaims = sem.claims;
        if (sem.skipped) {
          result = { ...base, semantic: { groundedScore: sem.groundedScore, skipped: true } };
        } else {
          const detPerso = base.dimensions.personalization ?? 0;
          const tightened = Math.min(detPerso, sem.groundedScore);
          const totalW = g.dimensions.reduce((s, d) => s + d.weight, 0);
          const composite =
            g.dimensions.reduce((s, d) => s + (d.name === "personalization" ? tightened : d.score) * d.weight, 0) / totalW;
          result = {
            ...base,
            composite,
            dimensions: { ...base.dimensions, personalization: tightened },
            semantic: { groundedScore: sem.groundedScore, skipped: false },
          };
        }
      }

      // Anti-fabrication gate — deterministic always; semantic claims when judged.
      const fab = decideFabricationGate({ body: steps[i].body, brief: ctx.researchBrief, prospect, semanticClaims: semClaims });
      if (fab.blocked) {
        fabricationIssues.push(
          `Step ${g.stepNumber}: ${fab.reason}. Remove these — with no verified research behind them they read as fabricated. Keep the email credible but generic; never invent a fact about the prospect.`,
        );
      }
      return result;
    }),
  );

  const composite = perStep.reduce((a, p) => a + p.composite, 0) / perStep.length;
  const threshold = passThresholdFor(methodology);
  const fabricated = fabricationIssues.length > 0;
  const fullFeedback = [feedback, ...fabricationIssues].filter(Boolean).join("\n");
  return { pass: composite >= threshold && !fabricated, score: composite, feedback: fullFeedback, perStep };
}
