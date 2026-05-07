/**
 * Self-Improving Prompt Optimizer
 *
 * Analyzes patterns in low-scoring agent traces to identify systematic
 * weaknesses, then proposes targeted prompt modifications.
 *
 * Loop:
 * 1. Query recent traces with eval_score < 0.7
 * 2. Cluster failures by pattern (tool selection errors, hallucination,
 *    wrong tone, missing citations, verbose responses)
 * 3. For each cluster, generate a targeted prompt patch
 * 4. Score the patch against golden cases
 * 5. If the patch improves scores -> create a canary prompt version
 * 6. If the canary holds after 48h -> promote to stable
 *
 * This is NOT random prompt mutation. It's directed improvement
 * based on empirical failure analysis.
 */

import { db } from "@/db";
import { agentTraces, agentPromptVersions } from "@/db/schema";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { generateObject, generateText } from "ai";
import { z } from "zod";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { getGoldenCasesByAgent, type GoldenCase } from "@/lib/evals/golden-cases";
import { getActivePrompt, getDefaultPrompt } from "@/lib/evals/flywheel";
import { setCanaryPercent } from "@/lib/prompts/prompt-canary";
import { AGENT_REGISTRY } from "@/lib/observability/observability";
import logger from "@/lib/observability/logger";

// ── Model helpers (same pattern as flywheel.ts) ───────────────

/** Get the primary model (Sonnet) for generation tasks. */
function getChatModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-sonnet-4-6");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o");
  return null;
}

/** Get the lightweight model (Haiku) for classification tasks. */
function getLightweightModel() {
  if (process.env.ANTHROPIC_API_KEY) return anthropic("claude-haiku-4-5-20251001");
  if (process.env.OPENAI_API_KEY) return openai("gpt-4o-mini");
  return null;
}

// ── Failure Pattern Types ─────────────────────────────────────

export const FAILURE_CATEGORIES = [
  "tool_selection_error",
  "hallucination",
  "wrong_tone",
  "missing_citation",
  "verbose",
  "off_topic",
  "incomplete",
  "wrong_language",
] as const;

export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export interface FailureCluster {
  pattern: FailureCategory;
  count: number;
  examples: Array<{
    traceId: string;
    input: string;
    output: string;
    score: number;
  }>;
  suggestedFix: string;
}

export interface PromptPatch {
  targetSection: string;
  currentText: string;
  proposedText: string;
  reasoning: string;
  expectedImprovement: string;
  goldenCaseResults: { before: number; after: number };
}

export interface OptimizationCycleResult {
  clustersFound: number;
  patchesGenerated: number;
  patchesValidated: number;
  canaryCreated: boolean;
}

// ── 1. Analyze Failure Patterns ───────────────────────────────

/**
 * Query agentTraces where eval_score < 0.7 in the last N days, group
 * them by failure pattern using a Haiku classification call.
 *
 * Each failure is classified into one of 8 categories. Clusters with
 * fewer than 2 examples are dropped (noise, not signal).
 */
export async function analyzeFailurePatterns(
  agentId: string,
  lookbackDays: number,
): Promise<FailureCluster[]> {
  const since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

  // Fetch low-scoring traces
  const failures = await db
    .select({
      id: agentTraces.id,
      input: agentTraces.input,
      output: agentTraces.output,
      evalScore: agentTraces.evalScore,
    })
    .from(agentTraces)
    .where(
      and(
        eq(agentTraces.agentId, agentId),
        gte(agentTraces.createdAt, since),
        sql`(${agentTraces.evalScore} IS NOT NULL AND ${agentTraces.evalScore} < 0.7)`,
      ),
    )
    .orderBy(desc(agentTraces.createdAt))
    .limit(50);

  if (failures.length < 2) {
    logger.info("[PROMPT-OPTIMIZER] Not enough failures to analyze", {
      agentId,
      failureCount: failures.length,
    });
    return [];
  }

  // Use Haiku for fast, cheap classification of each failure
  const classifierModel = getLightweightModel();
  if (!classifierModel) {
    logger.warn("[PROMPT-OPTIMIZER] No lightweight model available for classification");
    return [];
  }

  // Classify each failure in a single batch call
  const failureSummaries = failures
    .map(
      (f, i) =>
        `[${i + 1}] Input: ${(f.input || "").slice(0, 300)}\nOutput: ${(f.output || "").slice(0, 300)}\nScore: ${f.evalScore ?? "N/A"}`,
    )
    .join("\n---\n");

  const classificationResult = await generateObject({
    model: classifierModel,
    schema: z.object({
      classifications: z.array(
        z.object({
          index: z.number().describe("1-indexed failure number"),
          category: z.enum(FAILURE_CATEGORIES),
          reason: z.string().describe("One-sentence explanation"),
        }),
      ),
    }),
    prompt: `Classify each of these AI agent failures into exactly one category.

Categories:
- tool_selection_error: Wrong tool called, or should have called a tool but didn't
- hallucination: Made up data not present in context (fake names, numbers, companies)
- wrong_tone: Too verbose, too casual, too formal, sycophantic, or robotic
- missing_citation: Claims about CRM data without entity links or source references
- verbose: Response far longer than needed for the question
- off_topic: Response doesn't address the user's actual question
- incomplete: Response is cut off, missing key data, or only partially answers
- wrong_language: Responded in the wrong language (e.g. English when asked in French)

Failures to classify:

${failureSummaries}`,
  });

  // Build clusters from classifications
  const clusterMap = new Map<FailureCategory, FailureCluster>();

  for (const cls of classificationResult.object.classifications) {
    const failure = failures[cls.index - 1];
    if (!failure) continue;

    if (!clusterMap.has(cls.category)) {
      clusterMap.set(cls.category, {
        pattern: cls.category,
        count: 0,
        examples: [],
        suggestedFix: "",
      });
    }

    const cluster = clusterMap.get(cls.category)!;
    cluster.count++;
    cluster.examples.push({
      traceId: failure.id,
      input: failure.input || "",
      output: failure.output || "",
      score: failure.evalScore ?? 0,
    });
  }

  // Filter to clusters with 2+ examples and cap examples at 5
  const clusters = [...clusterMap.values()]
    .filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count);

  for (const cluster of clusters) {
    cluster.examples = cluster.examples.slice(0, 5);
  }

  // Generate a suggested fix for each cluster using the classifier model
  for (const cluster of clusters) {
    const exampleSummary = cluster.examples
      .map(
        (e) =>
          `Input: ${e.input.slice(0, 200)}\nOutput: ${e.output.slice(0, 200)}\nScore: ${e.score}`,
      )
      .join("\n---\n");

    const fixResult = await generateText({
      model: classifierModel,
      prompt: `You are analyzing a recurring failure pattern in an AI sales agent.

Pattern: ${cluster.pattern} (${cluster.count} occurrences)

Examples:
${exampleSummary}

In one concise sentence, describe the specific prompt instruction that would prevent this failure pattern. Be surgical: target the exact behavior, not a generic fix.`,
    });

    cluster.suggestedFix = fixResult.text.trim();
  }

  logger.info("[PROMPT-OPTIMIZER] Failure analysis complete", {
    agentId,
    totalFailures: failures.length,
    clusters: clusters.map((c) => `${c.pattern}(${c.count}x)`),
  });

  return clusters;
}

// ── 2. Generate Prompt Patch ──────────────────────────────────

/**
 * Takes a failure cluster and the current system prompt, uses Sonnet
 * to propose a specific text change -- a surgical patch to one section,
 * not a full rewrite.
 */
export async function generatePromptPatch(
  cluster: FailureCluster,
  currentPrompt: string,
): Promise<PromptPatch> {
  const model = getChatModel();
  if (!model) {
    throw new Error("[PROMPT-OPTIMIZER] No chat model available for patch generation");
  }

  const exampleSummary = cluster.examples
    .slice(0, 3)
    .map(
      (e) =>
        `Input: ${e.input.slice(0, 200)}\nBad output: ${e.output.slice(0, 200)}\nScore: ${e.score}`,
    )
    .join("\n---\n");

  const result = await generateObject({
    model,
    schema: z.object({
      targetSection: z
        .string()
        .describe(
          "The XML tag name or section header in the prompt to modify (e.g. 'hallucination_safety', 'personality', 'response_format')",
        ),
      currentText: z
        .string()
        .describe(
          "The exact text from the current prompt that needs modification (copy-paste, must be findable in the prompt)",
        ),
      proposedText: z
        .string()
        .describe(
          "The replacement text. Keep it close to the original -- only add/change what is needed to fix the failure pattern",
        ),
      reasoning: z
        .string()
        .describe("Why this change fixes the failure pattern"),
      expectedImprovement: z
        .string()
        .describe("What measurable behavior change this should produce"),
    }),
    prompt: `You are a prompt engineer fixing a specific failure pattern in a production AI agent.

## Failure Pattern
Type: ${cluster.pattern}
Occurrences: ${cluster.count}
Suggested fix: ${cluster.suggestedFix}

## Example Failures
${exampleSummary}

## Current System Prompt
${currentPrompt}

## Rules
1. Identify the SPECIFIC section of the prompt that is responsible for this failure
2. Propose a MINIMAL change -- add 1-3 sentences or modify existing ones
3. Do NOT rewrite the entire prompt. This is a surgical patch.
4. The currentText field must be an exact substring found in the current prompt
5. The proposedText should be a drop-in replacement for currentText
6. If no existing section covers this failure, target the closest relevant section
7. Use XML tags consistent with the prompt's existing structure
8. Add explicit negative constraints ("do NOT...") for hallucination/citation/language issues`,
  });

  const patch: PromptPatch = {
    ...result.object,
    goldenCaseResults: { before: 0, after: 0 },
  };

  logger.info("[PROMPT-OPTIMIZER] Generated prompt patch", {
    pattern: cluster.pattern,
    targetSection: patch.targetSection,
    reasoning: patch.reasoning,
  });

  return patch;
}

// ── 3. Validate Patch Against Golden Cases ────────────────────

/**
 * Applies the patch to the prompt and re-runs the golden cases.
 * If aggregate score improves by >= 3%, the patch is validated.
 *
 * Returns the score delta so the caller can decide whether to promote.
 */
export async function validatePatch(
  patch: PromptPatch,
  goldenCases: GoldenCase[],
  currentPrompt: string,
): Promise<{ improved: boolean; scoreDelta: number }> {
  if (goldenCases.length === 0) {
    logger.warn("[PROMPT-OPTIMIZER] No golden cases to validate against");
    return { improved: false, scoreDelta: 0 };
  }

  const model = getChatModel();
  if (!model) {
    return { improved: false, scoreDelta: 0 };
  }

  // Build patched prompt
  const patchedPrompt = currentPrompt.includes(patch.currentText)
    ? currentPrompt.replace(patch.currentText, patch.proposedText)
    : currentPrompt + "\n\n" + patch.proposedText;

  // Score both prompts against golden cases using the LLM-as-judge pattern
  const scoreBefore = await scorePromptAgainstGoldenCases(model, currentPrompt, goldenCases);
  const scoreAfter = await scorePromptAgainstGoldenCases(model, patchedPrompt, goldenCases);

  patch.goldenCaseResults = { before: scoreBefore, after: scoreAfter };

  const delta = scoreAfter - scoreBefore;
  const improved = delta >= 0.03; // 3% improvement threshold

  logger.info("[PROMPT-OPTIMIZER] Patch validation result", {
    targetSection: patch.targetSection,
    scoreBefore: scoreBefore.toFixed(3),
    scoreAfter: scoreAfter.toFixed(3),
    delta: delta.toFixed(3),
    improved,
  });

  return { improved, scoreDelta: delta };
}

/**
 * Run golden cases through a prompt and compute an average quality score.
 * Uses the LLM-as-judge grader from agent-evals for scoring.
 */
async function scorePromptAgainstGoldenCases(
  model: NonNullable<ReturnType<typeof getChatModel>>,
  prompt: string,
  goldenCases: GoldenCase[],
): Promise<number> {

  // Cap at 8 cases to control cost (each requires two LLM calls: generate + judge)
  const casesToRun = goldenCases.slice(0, 8);
  const scores: number[] = [];

  for (const gc of casesToRun) {
    try {
      // Generate a response with the candidate prompt
      const response = await generateText({
        model,
        system: prompt,
        prompt: gc.input,
      });

      // Judge the response quality
      const judgeModel = getLightweightModel();
      if (!judgeModel) {
        scores.push(0.5);
        continue;
      }

      const judgeResult = await generateObject({
        model: judgeModel,
        schema: z.object({
          score: z
            .number()
            .min(0)
            .max(1)
            .describe("Quality score from 0.0 (terrible) to 1.0 (perfect)"),
          reasoning: z.string().describe("Brief explanation of the score"),
        }),
        prompt: `Rate the quality of this AI agent response on a 0.0-1.0 scale.

User input: ${gc.input}
${gc.context ? `Context: ${gc.context}` : ""}
${gc.expectedOutput ? `Expected output class: ${gc.expectedOutput}` : ""}

Agent response:
${response.text.slice(0, 1500)}

Scoring criteria:
- Does it answer the question directly without filler?
- Is it grounded in the provided context (no hallucination)?
- Is it the right length (not too verbose, not too terse)?
- Does it use the correct language (match the user's language)?
- Does it include citations/links where appropriate?

Score 0.0 = completely wrong/harmful. Score 1.0 = perfect response.`,
      });

      scores.push(judgeResult.object.score);
    } catch (err) {
      logger.warn("[PROMPT-OPTIMIZER] Golden case scoring failed", {
        caseId: gc.id,
        err: err instanceof Error ? err.message : String(err),
      });
      scores.push(0);
    }
  }

  return scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
}

// ── 4. Run Full Optimization Cycle ────────────────────────────

/**
 * Orchestrates the full evaluator-optimizer loop for a single agent:
 *
 * 1. Analyze failure patterns from the last 7 days
 * 2. For each significant cluster, generate a prompt patch
 * 3. Validate each patch against golden cases
 * 4. If a validated patch exists, create a canary prompt version
 *
 * This is the entry point called by the Inngest weekly cron.
 */
export async function runOptimizationCycle(
  agentId: string,
): Promise<OptimizationCycleResult> {
  const result: OptimizationCycleResult = {
    clustersFound: 0,
    patchesGenerated: 0,
    patchesValidated: 0,
    canaryCreated: false,
  };

  // Step 1: Find failure clusters from the last 7 days
  const clusters = await analyzeFailurePatterns(agentId, 7);
  result.clustersFound = clusters.length;

  if (clusters.length === 0) {
    logger.info("[PROMPT-OPTIMIZER] No failure clusters found, skipping", { agentId });
    return result;
  }

  // Step 2: Get the current prompt
  const activePromptData = await getActivePrompt(agentId);
  const currentPrompt = activePromptData?.prompt || getDefaultPrompt(agentId);

  // Step 3: Get golden cases for this agent
  const agentType = agentId as GoldenCase["agent"];
  const goldenCases = getGoldenCasesByAgent(agentType);

  // Step 4: Generate and validate patches for the top 3 clusters
  const topClusters = clusters.slice(0, 3);
  let bestPatch: PromptPatch | null = null;
  let bestDelta = 0;

  for (const cluster of topClusters) {
    try {
      const patch = await generatePromptPatch(cluster, currentPrompt);
      result.patchesGenerated++;

      const validation = await validatePatch(patch, goldenCases, currentPrompt);

      if (validation.improved) {
        result.patchesValidated++;

        if (validation.scoreDelta > bestDelta) {
          bestPatch = patch;
          bestDelta = validation.scoreDelta;
        }
      }

      logger.info("[PROMPT-OPTIMIZER] Patch result", {
        agentId,
        pattern: cluster.pattern,
        improved: validation.improved,
        delta: validation.scoreDelta.toFixed(3),
      });
    } catch (err) {
      logger.warn("[PROMPT-OPTIMIZER] Patch generation/validation failed", {
        agentId,
        pattern: cluster.pattern,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Step 5: If we have a validated patch, create a canary prompt version
  if (bestPatch) {
    try {
      const canaryVersion = await createCanaryFromPatch(agentId, currentPrompt, bestPatch);
      result.canaryCreated = canaryVersion !== null;

      if (canaryVersion) {
        logger.info("[PROMPT-OPTIMIZER] Canary prompt version created", {
          agentId,
          versionId: canaryVersion.id,
          version: canaryVersion.version,
          targetSection: bestPatch.targetSection,
          scoreDelta: bestDelta.toFixed(3),
        });
      }
    } catch (err) {
      logger.warn("[PROMPT-OPTIMIZER] Canary creation failed", {
        agentId,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  logger.info("[PROMPT-OPTIMIZER] Optimization cycle complete", {
    agentId,
    ...result,
  });

  return result;
}

// ── Canary Creation Helper ────────────────────────────────────

/**
 * Create a new prompt version with canary traffic routing.
 * Starts at 10% traffic so only a small fraction of tenants see it.
 * After 48h if eval scores hold, the canary is promoted to stable.
 */
async function createCanaryFromPatch(
  agentId: string,
  currentPrompt: string,
  patch: PromptPatch,
): Promise<{ id: string; version: number } | null> {
  // Apply the patch to create the new prompt
  const patchedPrompt = currentPrompt.includes(patch.currentText)
    ? currentPrompt.replace(patch.currentText, patch.proposedText)
    : currentPrompt + "\n\n" + patch.proposedText;

  // Get next version number
  const [latestVersion] = await db
    .select({ version: agentPromptVersions.version })
    .from(agentPromptVersions)
    .where(eq(agentPromptVersions.agentId, agentId))
    .orderBy(desc(agentPromptVersions.version))
    .limit(1);

  const newVersion = (latestVersion?.version || 0) + 1;

  // Get parent version ID
  const [activeVersion] = await db
    .select({ id: agentPromptVersions.id })
    .from(agentPromptVersions)
    .where(
      and(
        eq(agentPromptVersions.agentId, agentId),
        eq(agentPromptVersions.isActive, true),
      ),
    )
    .limit(1);

  // Create the new version as a canary at 10% traffic
  const INITIAL_CANARY_PERCENT = 10;

  const [newPromptVersion] = await db
    .insert(agentPromptVersions)
    .values({
      agentId,
      version: newVersion,
      systemPrompt: patchedPrompt,
      changeReason: `[PROMPT-OPTIMIZER] ${patch.targetSection}: ${patch.reasoning}`,
      parentVersionId: activeVersion?.id,
      isActive: true,
      canaryPercent: INITIAL_CANARY_PERCENT,
      evalScore: patch.goldenCaseResults.after,
      metadata: {
        source: "prompt-optimizer",
        pattern: patch.targetSection,
        scoreBefore: patch.goldenCaseResults.before,
        scoreAfter: patch.goldenCaseResults.after,
        expectedImprovement: patch.expectedImprovement,
      },
    })
    .returning();

  // Set the canary percent via the canary system for logging
  await setCanaryPercent(newPromptVersion.id, INITIAL_CANARY_PERCENT);

  return {
    id: newPromptVersion.id,
    version: newVersion,
  };
}
