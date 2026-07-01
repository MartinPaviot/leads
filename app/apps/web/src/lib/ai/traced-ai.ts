/**
 * Traced AI — Drop-in replacements for generateText, generateObject, streamText
 * that automatically record traces, sample for online eval, and feed the flywheel.
 *
 * Usage: Replace `import { generateText } from "ai"` with
 *        `import { tracedGenerateText as generateText } from "@/lib/ai/traced-ai"`
 *
 * Or wrap existing calls:
 *   const result = await tracedGenerateObject({
 *     ...originalArgs,
 *     _trace: { agentId: "draft-email", tenantId }
 *   });
 */

import { generateText, generateObject, streamText } from "ai";
import { recordTrace, type TraceContext, AGENT_REGISTRY } from "../observability/observability";
import { getActivePrompt, getFewShotExamples } from "../evals/flywheel";
import { getPlaybookPromptBlock } from "../playbook/get-playbook";
import { getCoachingPromptBlock } from "../coaching/get-coaching-guidance";
import { getObjectionsPromptBlock } from "../emails/get-objections";
import { getWinLossPromptBlock } from "../analysis/get-winloss";
import { enforceLlmBudget } from "../billing/llm-budget";
import logger from "../observability/logger";
import { isAiDisabled } from "./ai-provider";

/** Thrown when the AI_DISABLED kill-switch short-circuits a traced model call. */
const AI_DISABLED_MESSAGE =
  "AI_DISABLED: model calls are disabled by the AI_DISABLED kill-switch";

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
  // Orchestrator telemetry
  orchestratorRouted?: boolean;
  orchestratorSpecialists?: string;
  orchestratorConfidence?: number;
  // Entity the call is about — lets the learned-context seam fetch
  // per-entity context (this contact's open objections, this company's
  // win/loss lessons) for drafting agents. Optional; absent → tenant-only.
  contactId?: string;
  dealId?: string;
  companyId?: string;
  // Extensible: allow additional trace fields without type errors
  [key: string]: string | number | boolean | undefined;
}

/**
 * Inject few-shot examples from the flywheel into the messages array.
 * Examples are prepended as user/assistant pairs so the model learns
 * from the best production outputs curated by the flywheel.
 */
export function injectFewShotExamples(
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

/**
 * Apply the flywheel's learned artifacts to an outgoing model call:
 *  - the active (auto-refined) system prompt version, when one exists;
 *  - curated few-shot examples (best prod outputs + founder-approved drafts).
 *
 * The few-shot FALLBACK is load-bearing. `getActivePrompt` returns null
 * for any agent that has no refined prompt VERSION yet — i.e. almost
 * every agent, since most run on their default prompt — and the previous
 * inline code only injected few-shots when `getActivePrompt` was
 * non-null. So curated examples were stored but never reached the model
 * for the common case, leaving the curation loop open. We now fall back
 * to `getFewShotExamples` so the loop (high-quality / approved output →
 * example → injected next call) actually closes regardless of whether a
 * versioned prompt exists. The single seam also dedupes what were three
 * copy-pasted blocks across text/object/stream, and appends the tenant's
 * learned playbook for outbound-drafting agents (see PLAYBOOK_AGENT_IDS).
 */

/**
 * Outbound-drafting agents that get the tenant's learned context — the
 * playbook (what's worked) and recent coaching (what to improve) —
 * appended to their system prompt. Other agents (classification,
 * extraction, chat) are left untouched so we neither pay the tokens nor
 * muddy unrelated prompts.
 */
const DRAFTING_AGENT_IDS = new Set([
  "draft-email",
  "follow-up-email",
  "suggest-reply",
  "send-sequence-step",
]);

export async function applyLearnedContext(
  agentId: string,
  aiParams: any,
  tenantId?: string,
  entity?: { contactId?: string; companyId?: string; dealId?: string },
): Promise<void> {
  // Scope few-shots to this tenant: a few-shot output is an approved email
  // body, so an unscoped fetch would inject another tenant's copy into this
  // draft (getFewShotExamples fails closed on rows without a tenant tag).
  const activePrompt = await getActivePrompt(agentId, tenantId).catch(() => null);
  if (activePrompt?.prompt && !aiParams.system) {
    aiParams.system = activePrompt.prompt;
  }
  // `getActivePrompt` already bundles the agent's few-shots; only fetch
  // them separately when there is no active version to bundle them.
  const examples =
    activePrompt?.fewShotExamples ??
    (await getFewShotExamples(agentId, tenantId).catch(() => []));
  injectFewShotExamples(aiParams, examples);

  // Append learned context for outbound-drafting agents, at the END of
  // system so the stable prefix still prompt-caches and each piece is a
  // no-op when there's nothing to add:
  //  - playbook + coaching: tenant-scoped (what's worked / to improve);
  //  - objections: per-CONTACT (open concerns to pre-empt) when a
  //    contactId is supplied;
  //  - win/loss: per-COMPANY (lessons from prior deals here) when a
  //    companyId is supplied.
  if (tenantId && DRAFTING_AGENT_IDS.has(agentId)) {
    const [playbook, coaching, objections, winloss] = await Promise.all([
      getPlaybookPromptBlock(tenantId).catch(() => ""),
      getCoachingPromptBlock(tenantId).catch(() => ""),
      entity?.contactId
        ? getObjectionsPromptBlock(tenantId, entity.contactId).catch(() => "")
        : Promise.resolve(""),
      entity?.companyId
        ? getWinLossPromptBlock(tenantId, entity.companyId).catch(() => "")
        : Promise.resolve(""),
    ]);
    for (const block of [playbook, coaching, objections, winloss]) {
      if (block) {
        aiParams.system = aiParams.system ? `${aiParams.system}\n\n${block}` : block;
      }
    }
  }
}

// ─── tracedGenerateText ──────────────────────────────────────

export async function tracedGenerateText(
  params: AnyParams & { _trace: TraceMetadata },
) {
  const { _trace, ...aiParams } = params;
  const start = Date.now();

  if (isAiDisabled()) throw new Error(AI_DISABLED_MESSAGE);

  // Pre-dispatch budget gate — throws BudgetExceededError when the
  // tenant is over their monthly LLM cap. Intentionally un-caught
  // here so callers see the cap reason and can surface it to the
  // user (the alternative of silently returning "" would look like
  // a bug). Tenants with no cap configured pass through cheaply.
  await enforceLlmBudget(_trace.tenantId);

  // Inject the flywheel's learned prompt + few-shot examples + playbook.
  await applyLearnedContext(_trace.agentId, aiParams as any, _trace.tenantId, {
    contactId: _trace.contactId,
    companyId: _trace.companyId,
    dealId: _trace.dealId,
  });

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

  if (isAiDisabled()) throw new Error(AI_DISABLED_MESSAGE);

  await enforceLlmBudget(_trace.tenantId);

  await applyLearnedContext(_trace.agentId, aiParams, _trace.tenantId, {
    contactId: _trace.contactId,
    companyId: _trace.companyId,
    dealId: _trace.dealId,
  });

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

  if (isAiDisabled()) throw new Error(AI_DISABLED_MESSAGE);

  await enforceLlmBudget(_trace.tenantId);

  // Inject the flywheel's learned prompt + few-shot examples + playbook.
  await applyLearnedContext(_trace.agentId, aiParams as any, _trace.tenantId, {
    contactId: _trace.contactId,
    companyId: _trace.companyId,
    dealId: _trace.dealId,
  });

  const originalOnFinish = (aiParams as any).onFinish;

  (aiParams as any).onFinish = async (event: any) => {
    const latencyMs = Date.now() - start;

    const toolCalls = event.steps
      ?.flatMap((s: any) => s.toolCalls || [])
      .map((tc: any) => ({
        name: tc.toolName,
        args: JSON.stringify(tc.args || {}).slice(0, 500),
        result: JSON.stringify(tc.result || "").slice(0, 500),
      })) || [];

    const toolSelectionMeta = {
      orchestratorRouted: _trace.orchestratorRouted,
      orchestratorSpecialists: _trace.orchestratorSpecialists,
      orchestratorConfidence: _trace.orchestratorConfidence,
      allowedToolCount: _trace.allowedToolCount,
      toolsSelected: toolCalls.map((tc: any) => tc.name),
      userIntent: _trace.inputPreview?.slice(0, 200),
    };

    recordTrace(
      {
        agentId: _trace.agentId,
        tenantId: _trace.tenantId,
        traceId: _trace.traceId,
        metadata: toolSelectionMeta,
      },
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
