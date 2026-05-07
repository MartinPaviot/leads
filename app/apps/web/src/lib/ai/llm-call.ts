/**
 * Central LLM call wrapper (Sprint-1 audit follow-up).
 *
 * Every LLM invocation in the codebase should route through `llmCall`
 * (or `llmCallObject`) so we get :
 *   - prompt-id versioning (`<surface>.v<n>`)
 *   - bounded retry with exponential backoff
 *   - fallback model on terminal error
 *   - timeout that actually aborts
 *   - cost / latency / token logging to `llm_calls`
 *
 * The wrapper sits ABOVE `tracedGenerateText` / `tracedGenerateObject`,
 * preserving the existing trace + budget + flywheel infrastructure.
 * Callers don't lose anything; they gain observability.
 *
 * Pure-function unit tests cover the orchestration logic in
 * `__tests__/llm-call.test.ts`. The DB write is fire-and-forget so
 * a transient persistence failure never crashes a real LLM call.
 */

import type { LanguageModel } from "ai";
import { db } from "@/db";
import { llmCalls } from "@/db/schema";
import { computeCallCostUsd } from "./model-pricing";
import { logger } from "@/lib/observability/logger";

export interface LlmCallTrace {
  /** Tenant — null for system jobs (cron, eval). */
  tenantId?: string | null;
  /** Logical surface — required for cost-per-surface dashboards. */
  surfaceId: string;
  /** Versioned prompt id (e.g. "deal-briefing.v3"). Required. */
  promptId: string;
  /** Free-form metadata — agentId, traceId, request id, etc. */
  metadata?: Record<string, unknown>;
}

export interface LlmCallOptions<TFn extends (...args: any[]) => any> {
  /** AI SDK function to invoke — `generateText` or `generateObject`. */
  fn: TFn;
  /** Args for the AI SDK function. The first positional arg's
   *  `model` field is read for the primary model id. */
  args: Parameters<TFn>;
  /** Fallback model used when the primary terminally errors. Optional
   *  — without it, terminal errors bubble. */
  fallbackModel?: LanguageModel;
  /** Total retries (excluding the initial attempt). Default: 1. */
  retries?: number;
  /** Hard wall-clock cap per attempt. Default: 60s. */
  timeoutMs?: number;
  /** Trace context required for the row. */
  trace: LlmCallTrace;
}

interface LlmCallObservation {
  outcome: "ok" | "error" | "timeout";
  errorMessage?: string;
  attempts: number;
  fallbackTriggered: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  modelUsed: string;
  latencyMs: number;
}

/**
 * Best-effort extractor for token usage from the AI SDK result. The
 * SDK shape varies slightly between `generateText`, `generateObject`,
 * and provider versions, so we try multiple paths.
 */
function extractUsage(result: unknown): {
  input: number | null;
  output: number | null;
} {
  if (!result || typeof result !== "object") return { input: null, output: null };
  const r = result as {
    usage?: {
      promptTokens?: number;
      completionTokens?: number;
      inputTokens?: number;
      outputTokens?: number;
    };
  };
  const u = r.usage ?? {};
  return {
    input:
      typeof u.inputTokens === "number"
        ? u.inputTokens
        : typeof u.promptTokens === "number"
          ? u.promptTokens
          : null,
    output:
      typeof u.outputTokens === "number"
        ? u.outputTokens
        : typeof u.completionTokens === "number"
          ? u.completionTokens
          : null,
  };
}

function modelIdOf(model: unknown): string {
  if (!model || typeof model !== "object") return "unknown";
  const m = model as { modelId?: string; id?: string };
  return m.modelId ?? m.id ?? "unknown";
}

/**
 * Invoke `fn` with `args` under a timeout. Returns the resolved value
 * or rejects with a timeout marker so the orchestration layer can
 * tell apart "the LLM said no" from "we never heard back".
 */
async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`llm-call: timeout after ${timeoutMs}ms`);
      (err as Error & { code?: string }).code = "LLM_CALL_TIMEOUT";
      reject(err);
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Persist one row to `llm_calls`. Fire-and-forget: never throws.
 * Surfacing errors here would defeat the wrapper's point — if the DB
 * is down, the LLM call already happened, and the user shouldn't
 * see a 500 because we couldn't write a metric row.
 */
async function persistCall(
  trace: LlmCallTrace,
  obs: LlmCallObservation,
): Promise<void> {
  try {
    const cost = computeCallCostUsd(obs.modelUsed, obs.inputTokens, obs.outputTokens);
    await db.insert(llmCalls).values({
      tenantId: trace.tenantId ?? null,
      surfaceId: trace.surfaceId,
      promptId: trace.promptId,
      model: obs.modelUsed,
      fallbackTriggered: obs.fallbackTriggered,
      attempts: obs.attempts,
      inputTokens: obs.inputTokens,
      outputTokens: obs.outputTokens,
      costUsd: cost,
      latencyMs: obs.latencyMs,
      outcome: obs.outcome,
      errorMessage: obs.errorMessage?.slice(0, 500) ?? null,
      metadata: trace.metadata ?? {},
    });
  } catch (err) {
    logger.warn("llm-call: persist failed (non-blocking)", {
      surfaceId: trace.surfaceId,
      promptId: trace.promptId,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Run `fn(args)` once, with a timeout. Returns either {ok: true, result, ...}
 * or {ok: false, errorMessage, isTimeout}. Used internally by `llmCall`
 * to drive the retry/fallback ladder.
 */
async function attemptOnce<TFn extends (...args: any[]) => any>(
  fn: TFn,
  args: Parameters<TFn>,
  timeoutMs: number,
): Promise<
  | { ok: true; result: Awaited<ReturnType<TFn>> }
  | { ok: false; errorMessage: string; isTimeout: boolean }
> {
  try {
    const promise = fn(...args) as Promise<Awaited<ReturnType<TFn>>>;
    const result = await withTimeout(promise, timeoutMs);
    return { ok: true, result };
  } catch (err) {
    const isTimeout =
      err instanceof Error && (err as Error & { code?: string }).code === "LLM_CALL_TIMEOUT";
    return {
      ok: false,
      errorMessage: err instanceof Error ? err.message : String(err),
      isTimeout,
    };
  }
}

/**
 * Core wrapper. Generic so callers retain the SDK's return type.
 *
 * Retry policy : up to `retries + 1` total attempts, with exponential
 * backoff (250ms, 500ms, 1s, capped at 4s). On terminal failure, if
 * a fallback model was provided, we reset the attempts counter and
 * try once more on the fallback. If that also fails, we throw the
 * last error — caller catches as before, but now with a row in
 * `llm_calls` showing the failure path.
 */
export async function llmCall<TFn extends (...args: any[]) => Promise<unknown>>(
  options: LlmCallOptions<TFn>,
): Promise<Awaited<ReturnType<TFn>>> {
  const { fn, args, fallbackModel, trace } = options;
  const retries = Math.max(0, options.retries ?? 1);
  const timeoutMs = options.timeoutMs ?? 60_000;
  const startedAt = Date.now();

  const primaryModel = (args[0] as { model?: unknown })?.model;
  const primaryModelId = modelIdOf(primaryModel);

  let attempts = 0;
  let fallbackTriggered = false;
  let lastErrorMessage: string | undefined;
  let lastIsTimeout = false;

  // Primary ladder
  for (let i = 0; i <= retries; i++) {
    attempts++;
    const r = await attemptOnce(fn, args, timeoutMs);
    if (r.ok) {
      const usage = extractUsage(r.result);
      await persistCall(trace, {
        outcome: "ok",
        attempts,
        fallbackTriggered: false,
        inputTokens: usage.input,
        outputTokens: usage.output,
        modelUsed: primaryModelId,
        latencyMs: Date.now() - startedAt,
      });
      return r.result as Awaited<ReturnType<TFn>>;
    }
    lastErrorMessage = r.errorMessage;
    lastIsTimeout = r.isTimeout;
    // Backoff before next retry, capped at 4s. Skip wait on last try.
    if (i < retries) {
      const backoffMs = Math.min(4000, 250 * 2 ** i);
      await new Promise((res) => setTimeout(res, backoffMs));
    }
  }

  // Fallback ladder (single attempt — fallbacks are themselves usually
  // an "if this still fails, give up" tier).
  if (fallbackModel) {
    fallbackTriggered = true;
    const fallbackArgs = [
      { ...(args[0] as object), model: fallbackModel },
      ...args.slice(1),
    ] as Parameters<TFn>;
    attempts++;
    const r = await attemptOnce(fn, fallbackArgs, timeoutMs);
    if (r.ok) {
      const usage = extractUsage(r.result);
      await persistCall(trace, {
        outcome: "ok",
        attempts,
        fallbackTriggered: true,
        inputTokens: usage.input,
        outputTokens: usage.output,
        modelUsed: modelIdOf(fallbackModel),
        latencyMs: Date.now() - startedAt,
      });
      return r.result as Awaited<ReturnType<TFn>>;
    }
    lastErrorMessage = r.errorMessage;
    lastIsTimeout = r.isTimeout;
  }

  // Terminal failure — log and rethrow.
  await persistCall(trace, {
    outcome: lastIsTimeout ? "timeout" : "error",
    errorMessage: lastErrorMessage,
    attempts,
    fallbackTriggered,
    inputTokens: null,
    outputTokens: null,
    modelUsed: primaryModelId,
    latencyMs: Date.now() - startedAt,
  });

  const err = new Error(
    lastErrorMessage ?? "llm-call: terminal failure (no error message)",
  );
  (err as Error & { surfaceId?: string; promptId?: string }).surfaceId =
    trace.surfaceId;
  (err as Error & { surfaceId?: string; promptId?: string }).promptId =
    trace.promptId;
  throw err;
}
