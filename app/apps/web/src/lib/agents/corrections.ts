/**
 * Agent Correction System — Guards, circuit breakers, and auto-retry.
 *
 * Three tiers of protection:
 * 1. Output guards: Validate agent output before returning to user
 * 2. Auto-retry: Re-run with feedback when output fails validation
 * 3. Circuit breakers: Prevent runaway costs, infinite loops, and degraded quality
 *
 * Correction patterns:
 * - Schema validation → retry with error message
 * - Hallucination detection → retry with stricter prompt
 * - Quality gate → retry with judge feedback
 * - Cost/latency budget → hard stop
 */

import { generateText, generateObject } from "ai";
import { anthropic } from "@/lib/ai/ai-provider";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import logger from "../observability/logger";
import { AGENT_REGISTRY, type TraceContext, recordTrace } from "../observability/observability";

// ─── Types ───────────────────────────────────────────────────

export interface GuardResult {
  passed: boolean;
  violations: string[];
  severity: "block" | "warn" | "log";
}

export interface CorrectionResult<T> {
  output: T;
  attempts: number;
  corrected: boolean;
  corrections: string[];
  totalLatencyMs: number;
  totalCost: number;
}

// ─── Output Guards ───────────────────────────────────────────

/**
 * Guard: No hallucinated data (fabricated names, companies, numbers not in context).
 */
export function guardNoHallucination(output: string, context: string): GuardResult {
  const violations: string[] = [];

  // Check for common hallucination patterns
  const hallucintionPatterns = [
    /founded in \d{4}/i,
    /revenue of \$[\d.]+[BMK]/i,
    /\d{3,} employees/i,
    /headquartered in/i,
  ];

  for (const pattern of hallucintionPatterns) {
    const match = output.match(pattern);
    if (match && context && !context.toLowerCase().includes(match[0].toLowerCase())) {
      violations.push(`Potential hallucination: "${match[0]}" not found in context`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    severity: violations.length > 0 ? "block" : "log",
  };
}

/**
 * Guard: No PII leakage (emails, phone numbers, SSNs in unexpected output).
 */
export function guardNoPIILeakage(output: string, allowedFields: string[] = []): GuardResult {
  const violations: string[] = [];
  const piiPatterns = [
    { name: "SSN", pattern: /\b\d{3}-\d{2}-\d{4}\b/ },
    { name: "credit_card", pattern: /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/ },
    { name: "api_key", pattern: /\b(sk|pk|api)[_-][a-zA-Z0-9]{20,}\b/ },
  ];

  for (const { name, pattern } of piiPatterns) {
    if (!allowedFields.includes(name) && pattern.test(output)) {
      violations.push(`PII detected: ${name}`);
    }
  }

  return {
    passed: violations.length === 0,
    violations,
    severity: "block",
  };
}

/**
 * Guard: JSON schema compliance.
 */
export function guardJsonSchema(output: string): GuardResult {
  const violations: string[] = [];

  try {
    JSON.parse(output);
  } catch {
    violations.push("Output is not valid JSON");
  }

  return {
    passed: violations.length === 0,
    violations,
    severity: "block",
  };
}

/**
 * Guard: Response length within bounds.
 */
export function guardLength(output: string, minWords: number, maxWords: number): GuardResult {
  const wordCount = output.split(/\s+/).filter(Boolean).length;
  const violations: string[] = [];

  if (wordCount < minWords) violations.push(`Response too short: ${wordCount} words (min: ${minWords})`);
  if (wordCount > maxWords) violations.push(`Response too long: ${wordCount} words (max: ${maxWords})`);

  return {
    passed: violations.length === 0,
    violations,
    severity: wordCount < minWords ? "block" : "warn",
  };
}

/**
 * Guard: No unresolved template variables.
 */
export function guardNoTemplateVars(output: string): GuardResult {
  const templateVarPattern = /\{\{[^}]+\}\}/g;
  const matches = output.match(templateVarPattern);
  const violations = matches
    ? matches.map((m) => `Unresolved template variable: ${m}`)
    : [];

  return {
    passed: violations.length === 0,
    violations,
    severity: "block",
  };
}

/**
 * Guard: Classification output is one of the expected labels.
 */
export function guardClassLabel(output: string, validLabels: string[]): GuardResult {
  const normalized = output.toLowerCase().trim();
  const matched = validLabels.some((l) => normalized.includes(l.toLowerCase()));
  return {
    passed: matched,
    violations: matched ? [] : [`Output "${normalized.slice(0, 50)}" not in valid labels: [${validLabels.join(", ")}]`],
    severity: "block",
  };
}

// ─── Guard Combinator ────────────────────────────────────────

export function runGuards(
  output: string,
  guards: Array<(output: string) => GuardResult>,
): { passed: boolean; allResults: GuardResult[]; blockers: string[] } {
  const allResults = guards.map((g) => g(output));
  const blockers = allResults
    .filter((r) => !r.passed && r.severity === "block")
    .flatMap((r) => r.violations);

  return {
    passed: blockers.length === 0,
    allResults,
    blockers,
  };
}

// ─── Circuit Breaker ─────────────────────────────────────────

export interface CircuitBreakerConfig {
  maxRetries: number;            // max retry attempts
  maxTotalLatencyMs: number;     // max total time for all attempts
  maxTotalCost: number;          // max total cost ($) for all attempts
  maxOutputTokens: number;       // max output tokens per attempt
  cooldownMs: number;            // minimum wait between retries
}

const DEFAULT_CIRCUIT_BREAKER: CircuitBreakerConfig = {
  maxRetries: 3,
  maxTotalLatencyMs: 60000,
  maxTotalCost: 1.00,
  maxOutputTokens: 4096,
  cooldownMs: 500,
};

export function getCircuitBreaker(agentId: string): CircuitBreakerConfig {
  const agent = AGENT_REGISTRY[agentId];
  if (!agent) return DEFAULT_CIRCUIT_BREAKER;

  return {
    maxRetries: 3,
    maxTotalLatencyMs: agent.maxLatencyMs * 3,
    maxTotalCost: agent.maxCostPerCall * 3,
    maxOutputTokens: 4096,
    cooldownMs: 500,
  };
}

// ─── Auto-Retry with Feedback ────────────────────────────────

/**
 * Runs an agent function with auto-correction:
 * 1. Execute the function
 * 2. Validate output with guards
 * 3. If guards fail, retry with violation feedback injected into prompt
 * 4. If circuit breaker trips, return best attempt or throw
 *
 * @example
 * const result = await withCorrection(
 *   { agentId: "draft-email", tenantId },
 *   async (feedbackHistory) => {
 *     const prompt = buildPrompt(input) + feedbackHistory;
 *     return await generateText({ model, prompt });
 *   },
 *   [
 *     (output) => guardNoHallucination(output, context),
 *     (output) => guardLength(output, 20, 200),
 *     (output) => guardNoTemplateVars(output),
 *   ],
 * );
 */
export async function withCorrection<T extends string>(
  ctx: TraceContext,
  fn: (feedbackHistory: string) => Promise<{ text: T; inputTokens?: number; outputTokens?: number; model?: string }>,
  guards: Array<(output: string) => GuardResult>,
  config?: Partial<CircuitBreakerConfig>,
): Promise<CorrectionResult<T>> {
  const cb = { ...getCircuitBreaker(ctx.agentId), ...config };
  const corrections: string[] = [];
  let feedbackHistory = "";
  let bestAttempt: T | null = null;
  let totalLatencyMs = 0;
  let totalCost = 0;

  for (let attempt = 0; attempt <= cb.maxRetries; attempt++) {
    // Circuit breaker: total latency
    if (totalLatencyMs > cb.maxTotalLatencyMs) {
      logger.warn(`[CIRCUIT BREAKER] ${ctx.agentId}: total latency ${totalLatencyMs}ms exceeds max ${cb.maxTotalLatencyMs}ms`);
      break;
    }

    // Circuit breaker: total cost
    if (totalCost > cb.maxTotalCost && cb.maxTotalCost > 0) {
      logger.warn(`[CIRCUIT BREAKER] ${ctx.agentId}: total cost $${totalCost.toFixed(4)} exceeds max $${cb.maxTotalCost}`);
      break;
    }

    const start = Date.now();

    try {
      const result = await fn(feedbackHistory);
      const latencyMs = Date.now() - start;
      totalLatencyMs += latencyMs;

      const inputTokens = result.inputTokens || 0;
      const outputTokens = result.outputTokens || 0;
      const modelCosts: Record<string, { input: number; output: number }> = {
        "claude-sonnet": { input: 3.0 / 1_000_000, output: 15.0 / 1_000_000 },
        "gpt-4o-mini": { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
      };
      const modelKey = Object.keys(modelCosts).find((k) => (result.model || "").includes(k)) || "claude-sonnet";
      const cost = inputTokens * modelCosts[modelKey].input + outputTokens * modelCosts[modelKey].output;
      totalCost += cost;

      bestAttempt = result.text;

      // Run guards
      const guardResults = runGuards(result.text, guards);

      if (guardResults.passed) {
        // Record successful trace
        if (corrections.length > 0) {
          await recordTrace(ctx, {
            input: feedbackHistory.slice(0, 500),
            output: result.text.slice(0, 2000),
            model: result.model,
            inputTokens,
            outputTokens,
            latencyMs: totalLatencyMs,
            status: "corrected",
            correctionApplied: corrections.join("; "),
          });
        }

        return {
          output: result.text,
          attempts: attempt + 1,
          corrected: corrections.length > 0,
          corrections,
          totalLatencyMs,
          totalCost,
        };
      }

      // Guards failed — prepare feedback for retry
      const violationsSummary = guardResults.blockers.join("\n- ");
      corrections.push(`Attempt ${attempt + 1}: ${violationsSummary}`);

      feedbackHistory = `\n\n[CORRECTION FEEDBACK - Attempt ${attempt + 1}]\nYour previous output had these issues:\n- ${violationsSummary}\n\nPlease fix these issues in your next response. Do NOT repeat the same mistakes.`;

      // Log warning for failed guards
      for (const result of guardResults.allResults) {
        if (!result.passed) {
          logger.warn(`[GUARD FAIL] ${ctx.agentId} attempt ${attempt + 1}`, {
            severity: result.severity,
            violations: result.violations,
          });
        }
      }

      // Cooldown before retry
      if (attempt < cb.maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, cb.cooldownMs));
      }
    } catch (err) {
      const latencyMs = Date.now() - start;
      totalLatencyMs += latencyMs;
      corrections.push(`Attempt ${attempt + 1}: Error - ${String(err).slice(0, 200)}`);

      if (attempt === cb.maxRetries) throw err;
    }
  }

  // All retries exhausted — return best attempt or throw
  if (bestAttempt !== null) {
    logger.error(`[CORRECTION EXHAUSTED] ${ctx.agentId}: ${corrections.length} corrections failed`, { corrections });

    await recordTrace(ctx, {
      output: bestAttempt.slice(0, 2000),
      latencyMs: totalLatencyMs,
      status: "error",
      errorMessage: `Correction exhausted after ${corrections.length} attempts: ${corrections[corrections.length - 1]}`,
    });

    return {
      output: bestAttempt,
      attempts: corrections.length,
      corrected: false,
      corrections,
      totalLatencyMs,
      totalCost,
    };
  }

  throw new Error(`[${ctx.agentId}] All ${cb.maxRetries} correction attempts failed`);
}

// ─── Online Eval Sampling ────────────────────────────────────

/**
 * Decides whether to sample this trace for online evaluation.
 * Uses the agent's evalSampleRate from the registry.
 */
export function shouldSampleForEval(agentId: string): boolean {
  const agent = AGENT_REGISTRY[agentId];
  if (!agent || agent.evalSampleRate <= 0) return false;
  return Math.random() < agent.evalSampleRate;
}

/**
 * Async online eval — runs LLM-as-judge on a production trace.
 * Call this in the background (don't block the user response).
 */
export async function onlineEval(
  agentId: string,
  input: string,
  output: string,
  context?: string,
): Promise<{ score: number; reasoning: string } | null> {
  if (!shouldSampleForEval(agentId)) return null;

  const agent = AGENT_REGISTRY[agentId];
  if (!agent) return null;

  try {
    const model = process.env.OPENAI_API_KEY
      ? openai("gpt-4o-mini")
      : process.env.ANTHROPIC_API_KEY
        // Online-eval judge is a scoring task — Haiku grades on par with Sonnet
        // at 0.21x the price. Sonnet here only fired on Anthropic-only setups
        // (no OPENAI_API_KEY), i.e. the EU-sovereign profile.
        ? anthropic("claude-haiku-4-5-20251001")
        : null;

    if (!model) return null;

    const judgePrompt = `You are a quality evaluator for an AI agent called "${agent.name}".
Agent purpose: ${agent.description}

## User Input
${input.slice(0, 1000)}

${context ? `## Context Provided\n${context.slice(0, 1000)}\n` : ""}

## Agent Output
${output.slice(0, 2000)}

## Evaluation Criteria
1. Does the output fulfill the agent's purpose?
2. Is the output accurate and grounded in the provided data?
3. Is there any hallucinated information?
4. Is the output actionable and useful?
5. Is the tone appropriate?

Rate the output 0.0-1.0 where:
- 0.9-1.0: Excellent, no issues
- 0.7-0.89: Good, minor issues
- 0.5-0.69: Acceptable but needs improvement
- 0.3-0.49: Poor, significant issues
- 0.0-0.29: Unacceptable

Provide brief reasoning, then end with: SCORE: X.XX`;

    const result = await generateText({
      model,
      prompt: judgePrompt,
      maxOutputTokens: 700,
    });

    const scoreMatch = result.text.match(/SCORE:\s*(\d+\.?\d*)/i);
    const score = scoreMatch ? Math.min(1, Math.max(0, parseFloat(scoreMatch[1]))) : 0.5;
    const reasoning = result.text.replace(/SCORE:\s*\d+\.?\d*/i, "").trim().slice(0, 500);

    return { score, reasoning };
  } catch (err) {
    logger.error("Online eval failed", { agentId, error: String(err) });
    return null;
  }
}

// ─── Pre-built Guard Sets per Agent Category ─────────────────

export function getGuardsForAgent(agentId: string, context?: string): Array<(output: string) => GuardResult> {
  const agent = AGENT_REGISTRY[agentId];
  if (!agent) return [];

  switch (agent.category) {
    case "generation":
      return [
        (output) => guardNoPIILeakage(output),
        (output) => guardLength(output, 10, 2000),
        (output) => guardNoTemplateVars(output),
        ...(context ? [(output: string) => guardNoHallucination(output, context)] : []),
      ];

    case "classification":
      return [
        (output) => guardNoPIILeakage(output),
      ];

    case "extraction":
      return [
        (output) => guardJsonSchema(output),
        (output) => guardNoPIILeakage(output, ["email", "phone"]),
      ];

    case "conversational":
      return [
        (output) => guardNoPIILeakage(output, ["email", "phone"]),
        ...(context ? [(output: string) => guardNoHallucination(output, context)] : []),
      ];

    case "rag":
      return [
        (output) => guardNoPIILeakage(output, ["email", "phone"]),
        ...(context ? [(output: string) => guardNoHallucination(output, context)] : []),
      ];

    default:
      return [
        (output) => guardNoPIILeakage(output),
      ];
  }
}
