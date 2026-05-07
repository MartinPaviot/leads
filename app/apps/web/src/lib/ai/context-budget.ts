/**
 * Context Budget Manager
 *
 * Allocates tokens across the 5 sections of the chat context:
 * 1. System prompt (base instructions) -- FIXED budget
 * 2. Tool definitions -- DYNAMIC (varies by routed tools)
 * 3. Conversation history -- ELASTIC (grows then compacts)
 * 4. RAG context -- CAPPED (top-k by relevance)
 * 5. Entity context -- CAPPED (current entity details)
 *
 * Total budget: 128K tokens (Sonnet context window)
 * Reserved for output: 4K tokens
 * Available for input: 124K tokens
 *
 * Allocation strategy:
 * - System prompt: up to 6K tokens (fixed, high priority)
 * - Tools: up to 4K tokens (varies by routing, medium priority)
 * - Entity context: up to 2K tokens (fixed for current entity)
 * - RAG: up to 4K tokens (top results by score)
 * - History: remainder (~108K, compacts when exceeded)
 *
 * When total exceeds the budget, sections are trimmed in priority
 * order: history first (compact oldest messages), then RAG (reduce
 * k), then entity (truncate). System prompt and tools are never
 * trimmed -- they are structural.
 */

import type { UIMessage } from "ai";
import logger from "../observability/logger";

// ── Constants ──────────────────────────────────────────────────

/** Total context window for Claude Sonnet. */
const TOTAL_CONTEXT_WINDOW = 128_000;

/** Reserved for model output generation. */
const OUTPUT_RESERVATION = 4_000;

/** Available for all input sections combined. */
const INPUT_BUDGET = TOTAL_CONTEXT_WINDOW - OUTPUT_RESERVATION; // 124K

/** Section budget caps (tokens). */
const SECTION_CAPS = {
  systemPrompt: 6_000,
  tools: 4_000,
  entity: 2_000,
  rag: 4_000,
  // history gets the remainder: INPUT_BUDGET - (sum of other caps)
} as const;

/** History budget = everything left after fixed sections. */
const HISTORY_CAP =
  INPUT_BUDGET - SECTION_CAPS.systemPrompt - SECTION_CAPS.tools -
  SECTION_CAPS.entity - SECTION_CAPS.rag; // ~108K

/** Warn when total usage exceeds this fraction of the budget. */
const HIGH_UTILIZATION_THRESHOLD = 0.9;

// ── Types ──────────────────────────────────────────────────────

export interface SectionBudget {
  /** Tokens allocated to this section (cap). */
  allocated: number;
  /** Tokens actually used by this section. */
  used: number;
}

export interface ContextBudget {
  systemPrompt: SectionBudget & { content: string };
  tools: SectionBudget & { count: number };
  history: SectionBudget & { messageCount: number; compacted: boolean };
  rag: SectionBudget & { resultCount: number };
  entity: SectionBudget;
  total: { allocated: number; used: number; remaining: number };
}

export interface RagResult {
  content: string;
  score: number;
  [key: string]: unknown;
}

export interface BudgetAllocationParams {
  systemPrompt: string;
  toolDefinitions: Record<string, unknown>;
  messages: UIMessage[];
  ragResults: RagResult[];
  entityContext: string;
}

export interface BudgetAllocationResult {
  budget: ContextBudget;
  /** Messages after potential compaction. */
  optimizedMessages: UIMessage[];
  /** RAG results after potential truncation. */
  optimizedRag: RagResult[];
  /** Entity context after potential truncation. */
  optimizedEntityContext: string;
}

// ── Token Estimation ──────────────────────────────────────────

/**
 * Estimate token count from character length.
 * ~4 chars per token for English text (conservative estimate).
 * This matches the existing estimateTokens in route.ts.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length * 0.25);
}

/** Estimate tokens for a UIMessage array. */
function estimateMessagesTokens(messages: UIMessage[]): number {
  return messages.reduce((sum, m) => {
    const text =
      m.parts
        ?.filter((p) => p.type === "text")
        .map((p) => ("text" in p ? (p as { text: string }).text : ""))
        .join("") || "";
    // +4 per message for role/separator overhead
    return sum + estimateTokens(text) + 4;
  }, 0);
}

/** Estimate tokens for tool definitions (JSON stringified). */
function estimateToolTokens(tools: Record<string, unknown>): number {
  // Tools are serialized as JSON schemas in the API call. Estimate
  // from the stringified length. This is an approximation -- the
  // actual serialization includes parameter descriptions etc.
  try {
    const json = JSON.stringify(tools);
    return estimateTokens(json);
  } catch {
    // Fallback: count keys * ~50 tokens average per tool definition
    return Object.keys(tools).length * 50;
  }
}

/** Estimate tokens for RAG results. */
function estimateRagTokens(results: RagResult[]): number {
  return results.reduce((sum, r) => sum + estimateTokens(r.content) + 10, 0);
}

// ── Compaction Strategies ─────────────────────────────────────

/**
 * Compact conversation history by dropping older messages.
 * Preserves: first message (context), last N messages (recent context).
 * Returns compacted messages and whether compaction occurred.
 */
function compactHistory(
  messages: UIMessage[],
  maxTokens: number,
): { messages: UIMessage[]; compacted: boolean } {
  const currentTokens = estimateMessagesTokens(messages);

  if (currentTokens <= maxTokens) {
    return { messages, compacted: false };
  }

  // Strategy: keep first message + progressively remove the oldest
  // messages after the first until we fit the budget.
  if (messages.length <= 2) {
    return { messages, compacted: false };
  }

  const first = messages[0];
  let remaining = messages.slice(1);

  // Calculate how many tokens we need to shed
  let currentTotal = estimateMessagesTokens([first, ...remaining]);

  while (currentTotal > maxTokens && remaining.length > 2) {
    // Drop the oldest message (first in remaining)
    remaining = remaining.slice(1);
    currentTotal = estimateMessagesTokens([first, ...remaining]);
  }

  // If still over budget after dropping most messages, truncate the
  // first message content (it's often a big context dump)
  if (currentTotal > maxTokens && first.parts) {
    const firstClone: UIMessage = {
      ...first,
      parts: first.parts.map((p) => {
        if (p.type === "text" && "text" in p) {
          const text = (p as { type: "text"; text: string }).text;
          const maxChars = (maxTokens - estimateMessagesTokens(remaining)) * 4;
          if (text.length > maxChars) {
            return { type: "text" as const, text: text.slice(0, Math.max(maxChars, 200)) + "\n[...truncated]" };
          }
        }
        return p;
      }),
    };
    return { messages: [firstClone, ...remaining], compacted: true };
  }

  return { messages: [first, ...remaining], compacted: true };
}

/**
 * Trim RAG results by removing the lowest-scored entries until
 * the section fits its budget.
 */
function trimRag(results: RagResult[], maxTokens: number): RagResult[] {
  if (results.length === 0) return results;

  // Sort by score descending (keep highest-relevance results)
  const sorted = [...results].sort((a, b) => b.score - a.score);

  // Progressively drop lowest-scored until under budget
  let trimmed = sorted;
  while (trimmed.length > 0 && estimateRagTokens(trimmed) > maxTokens) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed;
}

/**
 * Truncate entity context to fit its budget.
 */
function truncateEntity(context: string, maxTokens: number): string {
  const currentTokens = estimateTokens(context);
  if (currentTokens <= maxTokens) return context;

  // Truncate to fit, preserving as much as possible
  const maxChars = maxTokens * 4;
  return context.slice(0, maxChars) + "\n[...entity context truncated]";
}

// ── Main Allocator ────────────────────────────────────────────

/**
 * Allocate context budget across all sections, trimming as needed
 * to fit within the 124K input token budget.
 *
 * Priority order (last to trim = highest priority):
 * 1. System prompt -- NEVER trimmed
 * 2. Tools -- NEVER trimmed
 * 3. Entity context -- trimmed third (truncate)
 * 4. RAG -- trimmed second (reduce k)
 * 5. History -- trimmed first (compact oldest messages)
 */
export function allocateContextBudget(
  params: BudgetAllocationParams,
): BudgetAllocationResult {
  const { systemPrompt, toolDefinitions, messages, ragResults, entityContext } =
    params;

  // 1. Measure each section's actual size
  const systemTokens = estimateTokens(systemPrompt);
  const toolTokens = estimateToolTokens(toolDefinitions);
  const historyTokens = estimateMessagesTokens(messages);
  const ragTokens = estimateRagTokens(ragResults);
  const entityTokens = estimateTokens(entityContext);

  const rawTotal =
    systemTokens + toolTokens + historyTokens + ragTokens + entityTokens;

  // 2. If everything fits, return as-is
  if (rawTotal <= INPUT_BUDGET) {
    const budget = buildBudget({
      systemTokens,
      systemPrompt,
      toolTokens,
      toolCount: Object.keys(toolDefinitions).length,
      historyTokens,
      messageCount: messages.length,
      compacted: false,
      ragTokens,
      ragCount: ragResults.length,
      entityTokens,
    });

    if (rawTotal > INPUT_BUDGET * HIGH_UTILIZATION_THRESHOLD) {
      logger.warn(
        `[context-budget] High utilization: ${rawTotal}/${INPUT_BUDGET} tokens (${Math.round((rawTotal / INPUT_BUDGET) * 100)}%)`,
      );
    }

    return {
      budget,
      optimizedMessages: messages,
      optimizedRag: ragResults,
      optimizedEntityContext: entityContext,
    };
  }

  // 3. Over budget -- trim in priority order
  let overflow = rawTotal - INPUT_BUDGET;

  // 3a. Trim history first (lowest priority for preservation)
  let optimizedMessages = messages;
  let finalHistoryTokens = historyTokens;
  let compacted = false;
  if (overflow > 0) {
    const historyBudget = Math.max(historyTokens - overflow, 1000); // keep at least 1K
    const result = compactHistory(messages, historyBudget);
    optimizedMessages = result.messages;
    compacted = result.compacted;
    finalHistoryTokens = estimateMessagesTokens(optimizedMessages);
    overflow -= historyTokens - finalHistoryTokens;
  }

  // 3b. Trim RAG second
  let optimizedRag = ragResults;
  let finalRagTokens = ragTokens;
  if (overflow > 0) {
    const ragBudget = Math.max(ragTokens - overflow, 0);
    optimizedRag = trimRag(ragResults, ragBudget);
    finalRagTokens = estimateRagTokens(optimizedRag);
    overflow -= ragTokens - finalRagTokens;
  }

  // 3c. Trim entity context third
  let optimizedEntityContext = entityContext;
  let finalEntityTokens = entityTokens;
  if (overflow > 0) {
    const entityBudget = Math.max(entityTokens - overflow, 0);
    optimizedEntityContext = truncateEntity(entityContext, entityBudget);
    finalEntityTokens = estimateTokens(optimizedEntityContext);
    overflow -= entityTokens - finalEntityTokens;
  }

  const budget = buildBudget({
    systemTokens,
    systemPrompt,
    toolTokens,
    toolCount: Object.keys(toolDefinitions).length,
    historyTokens: finalHistoryTokens,
    messageCount: optimizedMessages.length,
    compacted,
    ragTokens: finalRagTokens,
    ragCount: optimizedRag.length,
    entityTokens: finalEntityTokens,
  });

  if (overflow > 0) {
    logger.warn(
      `[context-budget] Could not fit within budget even after trimming. Overflow: ${overflow} tokens`,
    );
  }

  return {
    budget,
    optimizedMessages,
    optimizedRag,
    optimizedEntityContext,
  };
}

// ── Budget Object Builder ─────────────────────────────────────

function buildBudget(params: {
  systemTokens: number;
  systemPrompt: string;
  toolTokens: number;
  toolCount: number;
  historyTokens: number;
  messageCount: number;
  compacted: boolean;
  ragTokens: number;
  ragCount: number;
  entityTokens: number;
}): ContextBudget {
  const totalUsed =
    params.systemTokens +
    params.toolTokens +
    params.historyTokens +
    params.ragTokens +
    params.entityTokens;

  return {
    systemPrompt: {
      allocated: SECTION_CAPS.systemPrompt,
      used: params.systemTokens,
      content: params.systemPrompt,
    },
    tools: {
      allocated: SECTION_CAPS.tools,
      used: params.toolTokens,
      count: params.toolCount,
    },
    history: {
      allocated: HISTORY_CAP,
      used: params.historyTokens,
      messageCount: params.messageCount,
      compacted: params.compacted,
    },
    rag: {
      allocated: SECTION_CAPS.rag,
      used: params.ragTokens,
      resultCount: params.ragCount,
    },
    entity: {
      allocated: SECTION_CAPS.entity,
      used: params.entityTokens,
    },
    total: {
      allocated: INPUT_BUDGET,
      used: totalUsed,
      remaining: INPUT_BUDGET - totalUsed,
    },
  };
}

// ── Observability helpers ─────────────────────────────────────

/**
 * Format budget breakdown for logging / tracing.
 */
export function formatBudgetSummary(budget: ContextBudget): string {
  const pct = (used: number, allocated: number) =>
    allocated > 0 ? `${Math.round((used / allocated) * 100)}%` : "N/A";

  return [
    `Context Budget: ${budget.total.used}/${budget.total.allocated} tokens (${pct(budget.total.used, budget.total.allocated)})`,
    `  System:  ${budget.systemPrompt.used} tokens (${pct(budget.systemPrompt.used, budget.systemPrompt.allocated)})`,
    `  Tools:   ${budget.tools.used} tokens, ${budget.tools.count} tools (${pct(budget.tools.used, budget.tools.allocated)})`,
    `  History: ${budget.history.used} tokens, ${budget.history.messageCount} msgs${budget.history.compacted ? " [COMPACTED]" : ""} (${pct(budget.history.used, budget.history.allocated)})`,
    `  RAG:     ${budget.rag.used} tokens, ${budget.rag.resultCount} results (${pct(budget.rag.used, budget.rag.allocated)})`,
    `  Entity:  ${budget.entity.used} tokens (${pct(budget.entity.used, budget.entity.allocated)})`,
    `  Remaining: ${budget.total.remaining} tokens`,
  ].join("\n");
}
