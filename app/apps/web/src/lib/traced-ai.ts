/**
 * Traced AI — Drop-in replacements for generateText, generateObject, streamText
 * that automatically record traces, sample for online eval, and feed the flywheel.
 *
 * Usage: Replace `import { generateText } from "ai"` with
 *        `import { tracedGenerateText as generateText } from "@/lib/traced-ai"`
 *
 * Or wrap existing calls:
 *   const result = await tracedGenerateObject({
 *     ...originalArgs,
 *     _trace: { agentId: "draft-email", tenantId }
 *   });
 */

import { generateText, generateObject, streamText } from "ai";
import { recordTrace, type TraceContext, AGENT_REGISTRY } from "./observability";
import { getActivePrompt } from "./evals/flywheel";
import { enforceLlmBudget } from "./llm-budget";
import logger from "./logger";

type AnyParams = Parameters<typeof generateText>[0];
type AnyObjectParams = Parameters<typeof generateObject>[0];
type AnyStreamParams = Parameters<typeof streamText>[0];

interface TraceMetadata {
  agentId: string;
  tenantId?: string;
  traceId?: string;
  inputPreview?: string; // short description of what was sent
  // CHAT-02: surface + resolver telemetry
  surfaceType?: string;
  allowedToolCount?: number;
  droppedToolCount?: number;
}

/**
 * Inject few-shot examples from the flywheel into the messages array.
 * Examples are prepended as user/assistant pairs so the model learns
 * from the best production outputs curated by the flywheel.
 */
function injectFewShotExamples(
  aiParams: any,
  examples: Array<{ input: string; output: string }>,
): void {
  if (!examples || examples.length === 0) return;

  const fewShotMessages = examples.flatMap((ex) => [
    { role: "user" as const, content: ex.input },
    { role: "assistant" as const, content: ex.output },
  ]);

  if (aiParams.messages) {
    // Prepend few-shot examples before the real conversation
    aiParams.messages = [...fewShotMessages, ...aiParams.messages];
  } else if (aiParams.prompt) {
    // Convert prompt-based call to messages-based with few-shots
    aiParams.messages = [
      ...fewShotMessages,
      { role: "user" as const, content: aiParams.prompt },
    ];
    delete aiParams.prompt;
  }
}

// ─── tracedGenerateText ──────────────────────────────────────

export async function tracedGenerateText(
  params: AnyParams & { _trace: TraceMetadata },
) {
  const { _trace, ...aiParams } = params;
  const start = Date.now();

  // Pre-dispatch budget gate — throws BudgetExceededError when the
  // tenant is over their monthly LLM cap. Intentionally un-caught
  // here so callers see the cap reason and can surface it to the
  // user (the alternative of silently returning "" would look like
  // a bug). Tenants with no cap configured pass through cheaply.
  await enforceLlmBudget(_trace.tenantId);

  // Inject versioned prompt + few-shot examples from flywheel
  const activePrompt = await getActivePrompt(_trace.agentId).catch(() => null);
  if (activePrompt) {
    if (!aiParams.system) {
      (aiParams as any).system = activePrompt.prompt;
    }
    injectFewShotExamples(aiParams, activePrompt.fewShotExamples);
  }

  try {
    const result = await generateText(aiParams);
    const latencyMs = Date.now() - start;

    // Record trace (async, don't block)
    recordTrace(
      { agentId: _trace.agentId, tenantId: _trace.tenantId, traceId: _trace.traceId },
      {
        input: _trace.inputPreview || extractInput(aiParams),
        output: result.text?.slice(0, 2000),
        model: extractModelId(aiParams),
        inputTokens: ((result.usage as any)?.promptTokens ?? (result.usage as any)?.inputTokens) || 0,
        outputTokens: ((result.usage as any)?.completionTokens ?? (result.usage as any)?.outputTokens) || 0,
        latencyMs,
        toolCalls: result.steps
          ?.flatMap((s: any) => s.toolCalls || [])
          .map((tc: any) => ({ name: tc.toolName })),
        status: "ok",
      },
    ).catch((e) => console.warn("traced-ai: recordTrace failed (non-blocking)", e));

    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    recordTrace(
      { agentId: _trace.agentId, tenantId: _trace.tenantId },
      {
        input: _trace.inputPreview || extractInput(aiParams),
        model: extractModelId(aiParams),
        latencyMs,
        status: String(err).includes("timeout") ? "timeout" : "error",
        errorMessage: String(err).slice(0, 500),
      },
    ).catch((e) => console.warn("traced-ai: recordTrace failed (non-blocking)", e));
    throw err;
  }
}

// ─── tracedGenerateObject ────────────────────────────────────

/**
 * Drop-in replacement for generateObject that adds tracing.
 * Pass all original params + _trace. Returns the same type as generateObject.
 *
 * The _trace field is stripped before passing to generateObject so it doesn't
 * affect the AI SDK's type inference. We use `as any` internally because
 * the AI SDK's parameter types are complex generics that don't compose
 * well with intersections.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function tracedGenerateObject(
  params: any,
): Promise<any> {
  const { _trace, ...aiParams } = params as { _trace: TraceMetadata; [k: string]: any };
  const start = Date.now();

  await enforceLlmBudget(_trace.tenantId);

  const activePrompt = await getActivePrompt(_trace.agentId).catch(() => null);
  if (activePrompt) {
    if (!aiParams.system) {
      aiParams.system = activePrompt.prompt;
    }
    injectFewShotExamples(aiParams, activePrompt.fewShotExamples);
  }

  try {
    const result = await generateObject(aiParams as any);
    const latencyMs = Date.now() - start;

    recordTrace(
      { agentId: _trace.agentId, tenantId: _trace.tenantId, traceId: _trace.traceId },
      {
        input: _trace.inputPreview || extractInput(aiParams),
        output: JSON.stringify(result.object)?.slice(0, 2000),
        model: extractModelId(aiParams),
        inputTokens: ((result.usage as any)?.promptTokens ?? (result.usage as any)?.inputTokens) || 0,
        outputTokens: ((result.usage as any)?.completionTokens ?? (result.usage as any)?.outputTokens) || 0,
        latencyMs,
        status: "ok",
      },
    ).catch((e) => console.warn("traced-ai: recordTrace failed (non-blocking)", e));

    return result;
  } catch (err) {
    const latencyMs = Date.now() - start;
    recordTrace(
      { agentId: _trace.agentId, tenantId: _trace.tenantId },
      {
        input: _trace.inputPreview || extractInput(aiParams),
        model: extractModelId(aiParams),
        latencyMs,
        status: String(err).includes("timeout") ? "timeout" : "error",
        errorMessage: String(err).slice(0, 500),
      },
    ).catch((e) => console.warn("traced-ai: recordTrace failed (non-blocking)", e));
    throw err;
  }
}

// ─── tracedStreamText (for chat) ─────────────────────────────

/**
 * For streamText, we can't wrap the whole call. Instead, this returns
 * the stream result and records the trace via onFinish callback.
 */
export async function tracedStreamText(
  params: AnyStreamParams & { _trace: TraceMetadata },
) {
  const { _trace, ...aiParams } = params;
  const start = Date.now();

  await enforceLlmBudget(_trace.tenantId);

  // Inject versioned prompt + few-shot examples from flywheel
  const activePrompt = await getActivePrompt(_trace.agentId).catch(() => null);
  if (activePrompt) {
    if (!(aiParams as any).system) {
      (aiParams as any).system = activePrompt.prompt;
    }
    injectFewShotExamples(aiParams, activePrompt.fewShotExamples);
  }

  const originalOnFinish = (aiParams as any).onFinish;

  (aiParams as any).onFinish = async (event: any) => {
    const latencyMs = Date.now() - start;

    const toolCalls = event.steps
      ?.flatMap((s: any) => s.toolCalls || [])
      .map((tc: any) => ({ name: tc.toolName })) || [];

    recordTrace(
      { agentId: _trace.agentId, tenantId: _trace.tenantId, traceId: _trace.traceId },
      {
        input: _trace.inputPreview || "chat message",
        output: event.text?.slice(0, 2000),
        model: extractModelId(aiParams),
        inputTokens: ((event.usage as any)?.promptTokens ?? (event.usage as any)?.inputTokens) || 0,
        outputTokens: ((event.usage as any)?.completionTokens ?? (event.usage as any)?.outputTokens) || 0,
        latencyMs,
        toolCalls,
        status: "ok",
      },
    ).catch((e) => console.warn("traced-ai: recordTrace failed (non-blocking)", e));

    // Call original onFinish if exists
    if (originalOnFinish) await originalOnFinish(event);
  };

  try {
    return streamText(aiParams);
  } catch (err) {
    const latencyMs = Date.now() - start;
    recordTrace(
      { agentId: _trace.agentId, tenantId: _trace.tenantId },
      {
        input: _trace.inputPreview || "chat message",
        model: extractModelId(aiParams),
        latencyMs,
        status: "error",
        errorMessage: String(err).slice(0, 500),
      },
    ).catch((e) => console.warn("traced-ai: recordTrace failed (non-blocking)", e));
    throw err;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function extractInput(params: any): string {
  if (params.prompt) return String(params.prompt).slice(0, 500);
  if (params.messages) {
    const last = params.messages[params.messages.length - 1];
    if (typeof last?.content === "string") return last.content.slice(0, 500);
    if (last?.parts) {
      const textPart = last.parts.find((p: any) => p.type === "text");
      if (textPart) return textPart.text?.slice(0, 500) || "";
    }
  }
  return "";
}

function extractModelId(params: any): string {
  if (!params.model) return "unknown";
  // AI SDK model objects have a modelId property
  if (params.model.modelId) return params.model.modelId;
  if (params.model.id) return params.model.id;
  return String(params.model);
}
