/**
 * Eval Flywheel — Self-improving agent system.
 *
 * Implements Anthropic's flywheel pattern:
 * "Failures become test cases, test cases prevent regressions,
 *  and metrics replace guesswork."
 *
 * Four mechanisms:
 * 1. Failure → Eval Case: Production failures auto-become regression tests
 * 2. Pattern Analysis: Cluster failures to find systemic issues
 * 3. Prompt Refinement: LLM analyzes patterns and rewrites prompts
 * 4. Few-Shot Curation: Best outputs become in-context examples
 *
 * Plus the Evaluator-Optimizer loop (generate → evaluate → refine).
 */

import { db } from "@/db";
import {
  agentTraces,
  agentPromptVersions,
  agentFewShotExamples,
  agentFailurePatterns,
  evalDatasets,
  evalCases,
} from "@/db/schema";
import { eq, and, desc, gte, lte, sql, count } from "drizzle-orm";
import { generateText, generateObject } from "ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { AGENT_REGISTRY } from "../observability/observability";
import logger from "../observability/logger";
import { captureDistillationSample, type DistillationQualitySource } from "../distillation/pipeline";

// ─── 1. Failure → Eval Case ─────────────────────────────────

/**
 * Convert a failed production trace into a new eval case.
 * This is the first turn of the flywheel.
 *
 * Per Anthropic: "20-50 simple tasks drawn from real failures is a great start."
 */
export async function failureToEvalCase(
  traceId: string,
  tenantId: string,
): Promise<string | null> {
  // Get the failed trace
  const [trace] = await db.select().from(agentTraces)
    .where(eq(agentTraces.id, traceId))
    .limit(1);

  if (!trace) return null;

  // Find or create the regression dataset for this agent
  let [dataset] = await db.select().from(evalDatasets)
    .where(and(
      eq(evalDatasets.tenantId, tenantId),
      eq(evalDatasets.name, `${trace.agentId}-regression`),
    ))
    .limit(1);

  if (!dataset) {
    [dataset] = await db.insert(evalDatasets).values({
      tenantId,
      name: `${trace.agentId}-regression`,
      description: `Auto-generated regression suite from production failures for ${trace.agentId}`,
    }).returning();
  }

  // Check for duplicate (same input already in dataset)
  const existing = await db.select({ id: evalCases.id }).from(evalCases)
    .where(and(
      eq(evalCases.datasetId, dataset.id),
      eq(evalCases.input, trace.input || ""),
    ))
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  // Create the eval case
  const [newCase] = await db.insert(evalCases).values({
    datasetId: dataset.id,
    input: trace.input || "",
    expectedOutput: null, // open-ended, graded by rubric
    context: JSON.stringify({
      originalTraceId: traceId,
      errorMessage: trace.errorMessage,
      agentId: trace.agentId,
      failureDate: trace.createdAt,
    }),
    tags: ["regression", "auto-generated", trace.agentId,
      trace.errorMessage ? "error" : "low-quality"],
  }).returning();

  logger.info(`[FLYWHEEL] Created eval case from failure`, {
    caseId: newCase.id,
    agentId: trace.agentId,
    traceId,
  });

  return newCase.id;
}

/**
 * Batch: scan recent failed traces and convert them to eval cases.
 * Run hourly via Inngest cron.
 */
export async function processRecentFailures(
  tenantId: string,
  since: Date,
): Promise<{ processed: number; newCases: number }> {
  const failures = await db.select().from(agentTraces)
    .where(and(
      eq(agentTraces.tenantId, tenantId),
      gte(agentTraces.createdAt, since),
      sql`(${agentTraces.status} = 'error' OR ${agentTraces.evalScore} < 0.5)`,
    ))
    .orderBy(desc(agentTraces.createdAt))
    .limit(50); // cap to avoid explosion

  let newCases = 0;
  for (const trace of failures) {
    const caseId = await failureToEvalCase(trace.id, tenantId);
    if (caseId) newCases++;
  }

  return { processed: failures.length, newCases };
}

// ─── 2. Pattern Analysis ─────────────────────────────────────

/**
 * Analyze recent failures for an agent to find systemic patterns.
 * Uses LLM to cluster and categorize failure modes.
 *
 * Per Anthropic: "Grade what the agent produced, not the path it took."
 */
export async function analyzeFailurePatterns(
  agentId: string,
  tenantId: string,
  since: Date,
): Promise<Array<{ patternType: string; description: string; frequency: number; traceIds: string[] }>> {
  // Get recent failed traces with their inputs/outputs/errors
  const failures = await db.select({
    id: agentTraces.id,
    input: agentTraces.input,
    output: agentTraces.output,
    errorMessage: agentTraces.errorMessage,
    evalScore: agentTraces.evalScore,
    correctionApplied: agentTraces.correctionApplied,
  }).from(agentTraces)
    .where(and(
      eq(agentTraces.agentId, agentId),
      eq(agentTraces.tenantId, tenantId),
      gte(agentTraces.createdAt, since),
      sql`(${agentTraces.status} IN ('error', 'corrected') OR ${agentTraces.evalScore} < 0.6)`,
    ))
    .orderBy(desc(agentTraces.createdAt))
    .limit(30);

  if (failures.length < 3) return []; // not enough data to find patterns

  const model = getModel();
  if (!model) return [];

  const failureSummaries = failures.map((f, i) => (
    `[${i + 1}] Input: ${(f.input || "").slice(0, 200)}\nOutput: ${(f.output || "").slice(0, 200)}\nError: ${f.errorMessage || "low eval score"}\nScore: ${f.evalScore ?? "N/A"}`
  )).join("\n\n");

  const agent = AGENT_REGISTRY[agentId];

  const result = await generateObject({
    model,
    schema: z.object({
      patterns: z.array(z.object({
        patternType: z.enum(["hallucination", "wrong_tool", "incomplete", "tone", "schema_violation", "missing_data", "irrelevant", "too_verbose", "wrong_language"]),
        description: z.string().describe("Clear description of the failure pattern"),
        failureIndices: z.array(z.number()).describe("Which failures (1-indexed) exhibit this pattern"),
        suggestedFix: z.string().describe("Specific prompt change or system improvement to fix this"),
      })),
    }),
    prompt: `You are analyzing failure patterns for an AI agent.

Agent: ${agent?.name || agentId}
Purpose: ${agent?.description || "Unknown"}

Here are ${failures.length} recent failures:

${failureSummaries}

Identify recurring patterns. Group failures that share the same root cause.
For each pattern, suggest a specific fix (prompt change, guard rule, or architectural change).
Only report patterns that appear in 2+ failures.`,
  });
  const analysisResult = result.object as any;

  // Save patterns to DB
  const patterns = analysisResult.patterns.map((p: any) => ({
    patternType: p.patternType,
    description: p.description,
    frequency: p.failureIndices.length,
    traceIds: p.failureIndices.map((i: number) => failures[i - 1]?.id).filter(Boolean),
    suggestedFix: p.suggestedFix,
  }));

  for (const pattern of patterns) {
    // Upsert: update frequency if pattern already exists, else insert
    const [existing] = await db.select().from(agentFailurePatterns)
      .where(and(
        eq(agentFailurePatterns.agentId, agentId),
        eq(agentFailurePatterns.patternType, pattern.patternType),
        sql`${agentFailurePatterns.resolvedAt} IS NULL`,
      ))
      .limit(1);

    if (existing) {
      const existingTraceIds = (existing.exampleTraceIds || []) as string[];
      const mergedTraceIds = [...new Set([...existingTraceIds, ...pattern.traceIds])].slice(0, 20);
      await db.update(agentFailurePatterns)
        .set({
          frequency: existing.frequency! + pattern.frequency,
          description: pattern.description,
          exampleTraceIds: mergedTraceIds,
          updatedAt: new Date(),
        })
        .where(eq(agentFailurePatterns.id, existing.id));
    } else {
      await db.insert(agentFailurePatterns).values({
        agentId,
        patternType: pattern.patternType,
        description: pattern.description,
        frequency: pattern.frequency,
        exampleTraceIds: pattern.traceIds,
      });
    }
  }

  logger.info(`[FLYWHEEL] Found ${patterns.length} failure patterns for ${agentId}`, {
    patterns: patterns.map((p: any) => `${p.patternType}(${p.frequency}x)`),
  });

  return patterns;
}

// ─── 3. Prompt Refinement ────────────────────────────────────

/**
 * Automatically refine an agent's system prompt based on failure patterns.
 * Creates a new prompt version, evaluates it, and activates if better.
 *
 * Per Anthropic's Evaluator-Optimizer pattern:
 * "One LLM call generates a response while another provides evaluation
 *  and feedback in a loop."
 */
export async function refinePrompt(
  agentId: string,
  currentPrompt: string,
): Promise<{ newPrompt: string; versionId: string; improvement: string } | null> {
  const model = getModel();
  if (!model) return null;

  // Get unresolved failure patterns
  const patterns = await db.select().from(agentFailurePatterns)
    .where(and(
      eq(agentFailurePatterns.agentId, agentId),
      sql`${agentFailurePatterns.resolvedAt} IS NULL`,
    ))
    .orderBy(desc(agentFailurePatterns.frequency));

  if (patterns.length === 0) return null;

  // Get active few-shot examples
  const examples = await db.select().from(agentFewShotExamples)
    .where(and(
      eq(agentFewShotExamples.agentId, agentId),
      eq(agentFewShotExamples.isActive, true),
    ))
    .orderBy(desc(agentFewShotExamples.evalScore))
    .limit(5);

  const agent = AGENT_REGISTRY[agentId];
  const patternsSummary = patterns.map((p) =>
    `- ${p.patternType} (${p.frequency}x): ${p.description}`
  ).join("\n");

  const examplesSummary = examples.length > 0
    ? examples.map((e) => `Input: ${(e.input).slice(0, 150)}\nOutput: ${(e.output).slice(0, 300)}`).join("\n---\n")
    : "No examples available yet.";

  const result = await generateObject({
    model,
    schema: z.object({
      refinedPrompt: z.string().describe("The improved system prompt"),
      changesSummary: z.string().describe("What was changed and why"),
      addressedPatterns: z.array(z.string()).describe("Which failure patterns this addresses"),
    }),
    prompt: `You are an expert prompt engineer. Improve this system prompt to fix the failure patterns observed in production.

## Current System Prompt
${currentPrompt}

## Agent Purpose
${agent?.name || agentId}: ${agent?.description || ""}

## Failure Patterns to Fix
${patternsSummary}

## Best Production Outputs (use as reference for tone/style)
${examplesSummary}

## Rules
1. Keep the core purpose and persona intact
2. Add specific instructions that directly address each failure pattern
3. If examples are available, incorporate 1-2 as few-shot demonstrations
4. Do NOT make the prompt significantly longer — be surgical
5. Use XML tags for structure (Anthropic best practice)
6. Add "think step by step" for complex reasoning tasks
7. Add explicit "do NOT" constraints for hallucination patterns
8. Preserve any existing tool-use instructions exactly`,
  });
  const refinement = result.object as any;

  // Get current version number
  const [latestVersion] = await db.select({ version: agentPromptVersions.version })
    .from(agentPromptVersions)
    .where(eq(agentPromptVersions.agentId, agentId))
    .orderBy(desc(agentPromptVersions.version))
    .limit(1);

  const newVersion = (latestVersion?.version || 0) + 1;

  // Get parent version ID
  const [activeVersion] = await db.select({ id: agentPromptVersions.id })
    .from(agentPromptVersions)
    .where(and(
      eq(agentPromptVersions.agentId, agentId),
      eq(agentPromptVersions.isActive, true),
    ))
    .limit(1);

  // Save new version (not yet active — needs eval first)
  const [newPromptVersion] = await db.insert(agentPromptVersions).values({
    agentId,
    version: newVersion,
    systemPrompt: refinement.refinedPrompt,
    changeReason: refinement.changesSummary,
    parentVersionId: activeVersion?.id,
    isActive: false,
  }).returning();

  logger.info(`[FLYWHEEL] Created prompt v${newVersion} for ${agentId}`, {
    changes: refinement.changesSummary,
    patterns: refinement.addressedPatterns,
  });

  return {
    newPrompt: refinement.refinedPrompt,
    versionId: newPromptVersion.id,
    improvement: refinement.changesSummary,
  };
}

/**
 * After evaluating a new prompt version, activate it if it scores better.
 * This is the "gate" that prevents bad prompts from going live.
 */
export async function evaluateAndActivatePrompt(
  agentId: string,
  versionId: string,
  evalScore: number,
  evalPassRate: number,
): Promise<{ activated: boolean; reason: string }> {
  const agent = AGENT_REGISTRY[agentId];
  const threshold = agent?.qualityThreshold || 0.7;

  // Update the version with eval scores
  await db.update(agentPromptVersions)
    .set({ evalScore, evalPassRate })
    .where(eq(agentPromptVersions.id, versionId));

  // Get current active version's scores
  const [activeVersion] = await db.select().from(agentPromptVersions)
    .where(and(
      eq(agentPromptVersions.agentId, agentId),
      eq(agentPromptVersions.isActive, true),
    ))
    .limit(1);

  const currentScore = activeVersion?.evalScore || 0;

  // Activate only if: new score >= threshold AND new score > current score
  if (evalScore >= threshold && evalScore > currentScore) {
    // Deactivate current
    await db.update(agentPromptVersions)
      .set({ isActive: false })
      .where(and(
        eq(agentPromptVersions.agentId, agentId),
        eq(agentPromptVersions.isActive, true),
      ));

    // Activate new
    await db.update(agentPromptVersions)
      .set({ isActive: true })
      .where(eq(agentPromptVersions.id, versionId));

    // Mark addressed patterns as resolved
    const [version] = await db.select().from(agentPromptVersions)
      .where(eq(agentPromptVersions.id, versionId));

    if (version?.changeReason) {
      await db.update(agentFailurePatterns)
        .set({
          resolvedAt: new Date(),
          resolution: `Fixed by prompt v${version.version}: ${version.changeReason}`,
        })
        .where(and(
          eq(agentFailurePatterns.agentId, agentId),
          sql`${agentFailurePatterns.resolvedAt} IS NULL`,
        ));
    }

    logger.info(`[FLYWHEEL] Activated prompt v${version?.version} for ${agentId}`, {
      oldScore: currentScore,
      newScore: evalScore,
    });

    return {
      activated: true,
      reason: `Score improved from ${currentScore.toFixed(2)} to ${evalScore.toFixed(2)}`,
    };
  }

  const reason = evalScore < threshold
    ? `Score ${evalScore.toFixed(2)} below threshold ${threshold}`
    : `Score ${evalScore.toFixed(2)} not better than current ${currentScore.toFixed(2)}`;

  logger.info(`[FLYWHEEL] Rejected prompt for ${agentId}: ${reason}`);
  return { activated: false, reason };
}

// ─── 4. Few-Shot Curation ────────────────────────────────────

/**
 * Scan recent high-quality traces and curate them as few-shot examples.
 * Per Anthropic: best outputs should become in-context examples.
 *
 * Keeps max 5 active examples per agent (quality over quantity).
 */
export async function curateFewShotExamples(
  agentId: string,
  tenantId: string,
  since: Date,
): Promise<{ added: number; pruned: number; promoted: number }> {
  // Promote founder-approved candidates first. This is ungated by
  // sampling on purpose: an unedited approval (recordFlywheelCandidate)
  // is a first-class quality signal and must reach the model even for
  // agents we do not trace-sample.
  const promoted = await promoteApprovedCandidates(agentId);

  const agent = AGENT_REGISTRY[agentId];

  // Auto-curation from high-quality traces requires the agent to be
  // sampled; promotion (above) and prune (below) still run otherwise so
  // approved candidates surface and the top-5 cap is always enforced.
  const highQualityTraces =
    agent && agent.evalSampleRate > 0
      ? await db.select().from(agentTraces)
          .where(and(
            eq(agentTraces.agentId, agentId),
            eq(agentTraces.tenantId, tenantId),
            gte(agentTraces.createdAt, since),
            gte(agentTraces.evalScore, 0.85),
            eq(agentTraces.status, "ok"),
          ))
          .orderBy(desc(agentTraces.evalScore))
          .limit(10)
      : [];

  let added = 0;
  for (const trace of highQualityTraces) {
    if (!trace.input || !trace.output) continue;

    // Check for similar existing example (avoid duplicates)
    const existing = await db.select({ id: agentFewShotExamples.id })
      .from(agentFewShotExamples)
      .where(and(
        eq(agentFewShotExamples.agentId, agentId),
        eq(agentFewShotExamples.input, trace.input),
      ))
      .limit(1);

    if (existing.length > 0) continue;

    await db.insert(agentFewShotExamples).values({
      agentId,
      input: trace.input,
      output: trace.output,
      evalScore: trace.evalScore!,
      sourceTraceId: trace.id,
      // tenant tag is load-bearing: getFewShotExamples scopes reads by it, so
      // a tenant's own auto-curated example must carry it or it can never be
      // injected (and, worse, an untagged row would be readable cross-tenant).
      tags: [agentId, "auto-curated", `tenant:${tenantId}`],
    });
    added++;

    // Also capture high-scoring traces as distillation samples
    if (trace.evalScore! >= 0.85) {
      const toolNames = Array.isArray(trace.toolCalls)
        ? (trace.toolCalls as Array<{ name?: string }>).map((t) => t.name || "unknown")
        : [];

      void captureDistillationSample({
        agentId,
        systemPrompt: "", // not available in trace context
        userInput: trace.input,
        assistantOutput: trace.output,
        toolCalls: toolNames,
        qualitySource: "eval_high_score",
        qualityScore: trace.evalScore!,
        tenantId,
        traceId: trace.id,
      }).catch(() => {});
    }
  }

  // Prune: keep only top 5 examples per agent
  const allExamples = await db.select().from(agentFewShotExamples)
    .where(and(
      eq(agentFewShotExamples.agentId, agentId),
      eq(agentFewShotExamples.isActive, true),
    ))
    .orderBy(desc(agentFewShotExamples.evalScore));

  let pruned = 0;
  if (allExamples.length > 5) {
    const toDeactivate = allExamples.slice(5);
    for (const ex of toDeactivate) {
      await db.update(agentFewShotExamples)
        .set({ isActive: false })
        .where(eq(agentFewShotExamples.id, ex.id));
      pruned++;
    }
  }

  if (added > 0 || pruned > 0 || promoted > 0) {
    logger.info(`[FLYWHEEL] Few-shot curation for ${agentId}`, { added, pruned, promoted });
  }

  return { added, pruned, promoted };
}

/**
 * Promotion floor for founder-approved few-shot candidates. Matches the
 * INITIAL_CANDIDATE_SCORE that recordFlywheelCandidate stamps, so an
 * unedited approval clears the bar by default while genuinely low-scored
 * rows stay inactive.
 */
const FEW_SHOT_PROMOTION_FLOOR = 0.6;

/**
 * Promote founder-approved few-shot candidates into active examples.
 *
 * `recordFlywheelCandidate` stores an unedited founder-approved draft
 * with isActive=false and a low initial score (0.6), on the documented
 * promise that curation "will later promote" it — but no promoter ever
 * existed, so those candidates (the strongest positive signal we get)
 * sat inert forever and never reached a prompt. This closes that loop:
 * every inactive candidate at or above the promotion floor is activated,
 * then the caller's top-5 prune keeps only the best active set by score.
 * At cold start — no high-score auto-curated traces yet — these
 * approvals are exactly what fill the few-shot slots.
 *
 * Returns the number of candidates activated.
 */
export async function promoteApprovedCandidates(agentId: string): Promise<number> {
  const candidates = await db
    .select({ id: agentFewShotExamples.id })
    .from(agentFewShotExamples)
    .where(and(
      eq(agentFewShotExamples.agentId, agentId),
      eq(agentFewShotExamples.isActive, false),
      gte(agentFewShotExamples.evalScore, FEW_SHOT_PROMOTION_FLOOR),
    ));

  if (candidates.length === 0) return 0;

  await db
    .update(agentFewShotExamples)
    .set({ isActive: true })
    .where(and(
      eq(agentFewShotExamples.agentId, agentId),
      eq(agentFewShotExamples.isActive, false),
      gte(agentFewShotExamples.evalScore, FEW_SHOT_PROMOTION_FLOOR),
    ));

  logger.info(
    `[FLYWHEEL] Promoted ${candidates.length} approved few-shot candidate(s) for ${agentId}`,
  );
  return candidates.length;
}

/**
 * Get the active few-shot examples for an agent.
 * Inject these into the system prompt for better output quality.
 *
 * TENANT ISOLATION: a few-shot `output` holds an approved email body (subject +
 * body) — tenant-specific content (company, positioning, pricing, deal facts).
 * Stripping emails/phones at write time is NOT enough to share these across
 * tenants, so reads are scoped to the tenant whose `tenant:<id>` tag the row
 * carries. A row with NO tenant tag (e.g. a legacy auto-curated example written
 * before this scoping) is EXCLUDED — fail closed, never leak one tenant's copy
 * into another's prompt. Pass tenantId at every live-injection call; omit it
 * only for background eval callers that don't feed a customer draft.
 */
export async function getFewShotExamples(
  agentId: string,
  tenantId?: string,
): Promise<Array<{ input: string; output: string }>> {
  const conditions = [
    eq(agentFewShotExamples.agentId, agentId),
    eq(agentFewShotExamples.isActive, true),
  ];
  if (tenantId) {
    conditions.push(
      sql`${agentFewShotExamples.tags} @> ${JSON.stringify([`tenant:${tenantId}`])}::jsonb`,
    );
  }
  const examples = await db.select({
    input: agentFewShotExamples.input,
    output: agentFewShotExamples.output,
  }).from(agentFewShotExamples)
    .where(and(...conditions))
    .orderBy(desc(agentFewShotExamples.evalScore))
    .limit(3); // inject max 3 to keep context short

  return examples;
}

/**
 * Get the active system prompt for an agent.
 * Returns the versioned prompt if one exists, otherwise null (use default).
 */
export async function getActivePrompt(agentId: string, tenantId?: string): Promise<{
  prompt: string;
  version: number;
  fewShotExamples: Array<{ input: string; output: string }>;
} | null> {
  const [activeVersion] = await db.select().from(agentPromptVersions)
    .where(and(
      eq(agentPromptVersions.agentId, agentId),
      eq(agentPromptVersions.isActive, true),
    ))
    .limit(1);

  if (!activeVersion) return null;

  const examples = await getFewShotExamples(agentId, tenantId);

  return {
    prompt: activeVersion.systemPrompt,
    version: activeVersion.version,
    fewShotExamples: examples,
  };
}

// ─── 5. Evaluator-Optimizer Loop ─────────────────────────────

/**
 * The Evaluator-Optimizer pattern from Anthropic:
 * "One LLM call generates a response while another provides
 *  evaluation and feedback in a loop."
 *
 * Use this for high-stakes agent outputs (emails, deal analysis,
 * meeting prep) where quality matters more than latency.
 */
export async function evaluatorOptimizerLoop<T>(
  generateFn: (feedback?: string) => Promise<{ text: string; usage?: { promptTokens: number; completionTokens: number } }>,
  evaluateFn: (output: string) => Promise<{ pass: boolean; score: number; feedback: string }>,
  maxIterations = 3,
): Promise<{ output: string; iterations: number; finalScore: number; improved: boolean }> {
  let bestOutput = "";
  let bestScore = 0;
  let iterations = 0;

  // Initial generation
  const initial = await generateFn();
  bestOutput = initial.text;
  iterations++;

  // Evaluate
  let evaluation = await evaluateFn(bestOutput);
  bestScore = evaluation.score;

  if (evaluation.pass) {
    return { output: bestOutput, iterations, finalScore: bestScore, improved: false };
  }

  // Refinement loop
  for (let i = 0; i < maxIterations - 1; i++) {
    const refined = await generateFn(evaluation.feedback);
    iterations++;

    const newEval = await evaluateFn(refined.text);

    if (newEval.score > bestScore) {
      bestOutput = refined.text;
      bestScore = newEval.score;
    }

    if (newEval.pass) {
      return { output: bestOutput, iterations, finalScore: bestScore, improved: true };
    }

    evaluation = newEval;
  }

  return { output: bestOutput, iterations, finalScore: bestScore, improved: bestScore > evaluation.score };
}

// ─── 6. Full Flywheel Run ────────────────────────────────────

/**
 * Run the complete flywheel cycle for one agent.
 * This is the main entry point, called by the Inngest cron job.
 *
 * Steps:
 * 1. Process recent failures → new eval cases
 * 2. Analyze failure patterns
 * 3. Curate few-shot examples from best outputs
 * 4. If patterns found → refine prompt → evaluate → activate if better
 */
export async function runFlywheelCycle(
  agentId: string,
  tenantId: string,
): Promise<{
  failures: { processed: number; newCases: number };
  patterns: number;
  fewShot: { added: number; pruned: number };
  promptRefined: boolean;
  promptActivated: boolean;
}> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24h

  // Step 1: Failures → eval cases
  const failures = await processRecentFailures(tenantId, since);

  // Step 2: Pattern analysis
  const patterns = await analyzeFailurePatterns(agentId, tenantId, since);

  // Step 3: Few-shot curation
  const fewShot = await curateFewShotExamples(agentId, tenantId, since);

  // Step 4: Prompt refinement (only if patterns found)
  let promptRefined = false;
  let promptActivated = false;

  if (patterns.length > 0) {
    const activePrompt = await getActivePrompt(agentId, tenantId);
    const currentPrompt = activePrompt?.prompt || getDefaultPrompt(agentId);

    const refinement = await refinePrompt(agentId, currentPrompt);
    if (refinement) {
      promptRefined = true;

      // FIX 4: Run REAL evals against the new prompt before activating.
      // Use the evaluator-optimizer pattern: generate with new prompt → judge → decide.
      const evalScore = await evaluatePromptWithRealCases(agentId, refinement.newPrompt);

      const result = await evaluateAndActivatePrompt(
        agentId,
        refinement.versionId,
        evalScore.score,
        evalScore.passRate,
      );
      promptActivated = result.activated;
    }
  }

  logger.info(`[FLYWHEEL] Cycle complete for ${agentId}`, {
    failures,
    patterns: patterns.length,
    fewShot,
    promptRefined,
    promptActivated,
  });

  return {
    failures,
    patterns: patterns.length,
    fewShot,
    promptRefined,
    promptActivated,
  };
}

// ─── FIX 4: Real eval before prompt activation ──────────────

/**
 * Run real eval cases against a candidate prompt to get an actual score.
 * No more estimated scores — the flywheel only activates proven improvements.
 *
 * Per Anthropic: "Do not take eval scores at face value until someone digs
 * into the details of the eval and reads some transcripts."
 */
async function evaluatePromptWithRealCases(
  agentId: string,
  candidatePrompt: string,
): Promise<{ score: number; passRate: number }> {
  const { AGENT_EVAL_CONFIGS, runGrader, computeCompositeScore, runDimensionJudges, JUDGE_DIMENSIONS } = await import("./agent-evals");

  const config = AGENT_EVAL_CONFIGS.find((c) => c.agentId === agentId);
  if (!config || config.cases.length === 0) {
    return { score: 0.5, passRate: 0.5 }; // no eval cases to test against
  }

  const model = getModel();
  if (!model) return { score: 0.5, passRate: 0.5 };

  const scores: number[] = [];
  let passed = 0;

  // Run each eval case with the candidate prompt
  for (const evalCase of config.cases.slice(0, 10)) { // cap at 10 to control cost
    try {
      const result = await generateText({
        model,
        system: candidatePrompt,
        prompt: evalCase.input,
      });

      // Run deterministic graders (runGrader is async but these types resolve synchronously)
      const graderResults = await Promise.all(
        evalCase.graders
          .filter((g) => g.type !== "llm_judge" && g.type !== "faithfulness")
          .map((g) => runGrader(g, result.text, [], 0)),
      );

      // Run one dimension judge for accuracy (cheaper than full dimension suite)
      const hasLlmJudge = evalCase.graders.some((g) => g.type === "llm_judge");
      if (hasLlmJudge) {
        const agent = AGENT_REGISTRY[agentId];
        const agentCategory = agent?.category || "generation";
        const dimensions = JUDGE_DIMENSIONS[agentCategory] || JUDGE_DIMENSIONS.generation;
        // Only run accuracy dimension for cost efficiency
        const accuracyDim = dimensions.find((d) => d.dimension === "accuracy" || d.dimension === "correctness");
        if (accuracyDim) {
          const judgeResult = await runDimensionJudges(
            evalCase.input,
            result.text,
            evalCase.context || evalCase.expectedOutput || "",
            [accuracyDim],
            config.llmJudgeModel,
          );
          const llmGraders = evalCase.graders.filter((g) => g.type === "llm_judge");
          for (const g of llmGraders) {
            graderResults.push({
              type: "llm_judge",
              passed: judgeResult.composite >= config.passThreshold,
              score: judgeResult.composite,
              weight: g.weight,
              detail: `Accuracy: ${judgeResult.composite.toFixed(2)}`,
            });
          }
        }
      }

      const composite = computeCompositeScore(graderResults);
      scores.push(composite);
      if (composite >= config.passThreshold) passed++;
    } catch {
      scores.push(0);
    }
  }

  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
  const passRate = scores.length > 0 ? passed / scores.length : 0;

  logger.info(`[FLYWHEEL] Real eval for ${agentId} prompt candidate`, {
    avgScore: avgScore.toFixed(3),
    passRate: passRate.toFixed(3),
    casesRun: scores.length,
  });

  return { score: avgScore, passRate };
}

// ─── 7. Flywheel Candidate Recording ────────────────────────

/**
 * Record a user-approved AI output as a candidate few-shot example.
 *
 * Called when a user approves an AI-generated draft without editing it
 * (the strongest positive signal). The output is saved with a low
 * initial score so `curateFewShotExamples()` can later promote or
 * prune it based on the agent's quality curve.
 *
 * Tenant isolation: examples are scoped by agentId. Input/output text
 * is sanitized to strip email addresses and phone numbers before
 * storage, preventing PII from leaking into cross-tenant few-shot
 * prompts. The agentId namespace already isolates agents, but the
 * anonymization adds defense-in-depth.
 */
export async function recordFlywheelCandidate(
  agentId: string,
  input: string,
  output: string,
  tenantId: string,
  // Where this candidate came from. An unedited founder approval
  // ("user_approved") says the AI got it right; the founder's EDITED
  // final ("user_edited") is the stronger teaching signal — the same
  // insert-inactive path, tagged distinctly so its downstream value
  // can be measured separately. Defaulted so existing 4-arg callers
  // (e.g. the reply-flywheel listener) are unchanged.
  qualitySource: DistillationQualitySource = "user_approved",
): Promise<{ id: string } | null> {
  try {
    if (!input || !output) return null;

    // Strip PII patterns before storing as few-shot example.
    // Emails and phone numbers are the most common PII in sales outputs.
    const sanitize = (text: string): string =>
      text
        .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
        .replace(/\+?\d[\d\s\-().]{7,}\d/g, "[PHONE]");

    const safeInput = sanitize(input);
    const safeOutput = sanitize(output);

    // Check for similar existing example (avoid duplicates)
    const existing = await db
      .select({ id: agentFewShotExamples.id })
      .from(agentFewShotExamples)
      .where(
        and(
          eq(agentFewShotExamples.agentId, agentId),
          eq(agentFewShotExamples.input, safeInput),
        ),
      )
      .limit(1);

    if (existing.length > 0) return { id: existing[0].id };

    // Insert with a low initial score. curateFewShotExamples() will
    // promote this if the agent's eval pipeline rates it highly, or
    // prune it when higher-quality examples arrive.
    const INITIAL_CANDIDATE_SCORE = 0.6;

    const [row] = await db
      .insert(agentFewShotExamples)
      .values({
        agentId,
        input: safeInput,
        output: safeOutput,
        evalScore: INITIAL_CANDIDATE_SCORE,
        isActive: false, // not active until curateFewShotExamples promotes it
        tags: [
          agentId,
          qualitySource === "user_edited" ? "user-edited" : "user-approved",
          `tenant:${tenantId}`,
        ],
      })
      .returning({ id: agentFewShotExamples.id });

    logger.info("[FLYWHEEL] Recorded candidate few-shot example", {
      id: row.id,
      agentId,
      tenantId,
    });

    // Also capture as a distillation sample for future fine-tuning.
    // Fire-and-forget -- never block the main flow.
    void captureDistillationSample({
      agentId,
      systemPrompt: "", // system prompt not available here; captured at trace level
      userInput: input,
      assistantOutput: output,
      qualitySource,
      qualityScore: INITIAL_CANDIDATE_SCORE,
      tenantId,
    }).catch(() => {}); // swallow errors

    return { id: row.id };
  } catch (err) {
    logger.warn("[FLYWHEEL] recordFlywheelCandidate failed", {
      agentId,
      tenantId,
      err,
    });
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function getModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

export function getDefaultPrompt(agentId: string): string {
  // Default prompts for agents — used when no versioned prompt exists yet
  const defaults: Record<string, string> = {
    chat: "You are Elevay, an autonomous GTM copilot for early-stage founders.",
    "draft-email": "You write cold outreach emails for B2B SaaS sales.",
    "process-reply": "You classify email replies into: positive, negative, ooo, unsubscribe, unknown.",
    "process-transcript": "You extract structured notes from meeting transcripts.",
    "deal-analyze": "You analyze sales deals and recommend stage progression.",
    "account-summarize": "You generate concise CRM account summaries.",
    "actions-recommender": "You recommend 5 priority sales actions.",
    "suggest-reply": "You suggest 3 email replies with different tones.",
    "follow-up-email": "You write follow-up emails after sales meetings.",
    "ai-autofill": "You extract structured data from CRM conversations.",
    "send-sequence-step": "You personalize email templates for outbound sequences.",
    "meeting-prep": "You generate meeting preparation documents.",
    "generate-meeting-prep": "You generate comprehensive meeting briefing documents.",
    "icp-analysis": "You analyze company websites to infer ideal customer profile.",
    "smart-import": "You map CSV column headers to CRM field names.",
    "world-model": "You analyze sales interaction patterns.",
    "deal-extract-intel": "You extract structured deal intelligence from notes.",
  };
  return defaults[agentId] || `You are an AI agent: ${agentId}`;
}
