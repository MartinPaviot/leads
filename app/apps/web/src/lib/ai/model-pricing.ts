/**
 * Model pricing reference for cost calculation in `llm-call.ts`.
 *
 * Updated 2026-05-07 from public pricing pages. Numbers are in USD
 * per 1 million tokens. Update this file when providers shift prices
 * — there's no per-call API to fetch live rates, so a stale entry
 * just produces stale cost numbers in `llm_calls`. Caller code reads
 * the raw token counts from the SDK, so missing a price entry doesn't
 * break the call — it just leaves `cost_usd` null.
 *
 * The IDs match the strings the AI SDK passes to OpenAI / Anthropic
 * (e.g. `claude-sonnet-4-6`, `gpt-4o-mini`). Unknown models return
 * null cost; our schema permits that.
 */

export interface ModelPrice {
  /** USD per 1M input tokens. */
  inputPerMillion: number;
  /** USD per 1M output tokens. */
  outputPerMillion: number;
}

const PRICES: Record<string, ModelPrice> = {
  // Anthropic — Claude 4.x (2026 pricing)
  "claude-opus-4-7": { inputPerMillion: 15, outputPerMillion: 75 },
  "claude-sonnet-4-6": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-haiku-4-5-20251001": { inputPerMillion: 0.8, outputPerMillion: 4 },
  // Legacy Anthropic IDs still in our codebase
  "claude-3-5-sonnet-20241022": { inputPerMillion: 3, outputPerMillion: 15 },
  "claude-3-5-haiku-20241022": { inputPerMillion: 1, outputPerMillion: 5 },

  // OpenAI — GPT-4o family
  "gpt-4o": { inputPerMillion: 2.5, outputPerMillion: 10 },
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6 },
  "gpt-4-turbo": { inputPerMillion: 10, outputPerMillion: 30 },

  // OpenAI — embedding models (cost is per million on input only;
  // output is "free" since the model returns the vector). We
  // record output as 0 and input as the actual rate.
  "text-embedding-3-small": { inputPerMillion: 0.02, outputPerMillion: 0 },
  "text-embedding-3-large": { inputPerMillion: 0.13, outputPerMillion: 0 },
};

/**
 * Resolve a price for a model id. Exact match first, then a FAMILY match
 * (haiku / opus / sonnet / gpt-4o-mini / gpt-4o / embeddings) so dated or
 * aliased ids (e.g. "claude-sonnet-4-6-20250514", "claude-haiku-3-5") price at
 * THEIR tier instead of a wrong default. Returns null for a genuinely unknown
 * model — callers persist null rather than fabricate a cost.
 *
 * This is the single source of truth: observability.recordTrace and the
 * billing cost-tracker delegate here. The previous per-file maps fell unknown
 * models back to Sonnet, which over-counted Haiku 3.75x and under-counted Opus
 * 5x in agent_traces.estimated_cost. Order matters: haiku before sonnet before
 * opus, gpt-4o-mini before gpt-4o, so the more specific family wins.
 */
export function resolveModelPrice(model: string): ModelPrice | null {
  if (PRICES[model]) return PRICES[model];
  const m = model.toLowerCase();
  if (m.includes("haiku")) {
    return m.includes("3-5") || m.includes("3.5")
      ? PRICES["claude-3-5-haiku-20241022"]
      : PRICES["claude-haiku-4-5-20251001"];
  }
  if (m.includes("opus")) return PRICES["claude-opus-4-7"];
  if (m.includes("sonnet")) {
    return m.includes("3-5") || m.includes("3.5")
      ? PRICES["claude-3-5-sonnet-20241022"]
      : PRICES["claude-sonnet-4-6"];
  }
  if (m.includes("gpt-4o-mini")) return PRICES["gpt-4o-mini"];
  if (m.includes("gpt-4-turbo")) return PRICES["gpt-4-turbo"];
  if (m.includes("gpt-4o")) return PRICES["gpt-4o"];
  if (m.includes("embedding-3-large")) return PRICES["text-embedding-3-large"];
  if (m.includes("embedding-3-small")) return PRICES["text-embedding-3-small"];
  return null;
}

/**
 * Compute cost in USD for a (model, input_tokens, output_tokens) trio.
 * Returns null when the model isn't recognised (even by family) OR when token
 * counts are absent. Caller persists null without warning — pricing gaps
 * surface in the eval dashboard as "model X has 0% costed calls" which is the
 * right place to notice.
 */
export function computeCallCostUsd(
  model: string,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined,
): number | null {
  const p = resolveModelPrice(model);
  if (!p) return null;
  if (inputTokens == null && outputTokens == null) return null;
  const inCost = ((inputTokens ?? 0) / 1_000_000) * p.inputPerMillion;
  const outCost = ((outputTokens ?? 0) / 1_000_000) * p.outputPerMillion;
  // Round to 6 decimals — sub-microcent isn't meaningful and avoids
  // float-drift artifacts in aggregate queries.
  return Math.round((inCost + outCost) * 1_000_000) / 1_000_000;
}

/**
 * Whether we have a price entry for a given model. Helpful for tests
 * and for the eval harness to assert prices exist before claiming
 * cost numbers are reliable.
 */
export function hasModelPrice(model: string): boolean {
  return Object.prototype.hasOwnProperty.call(PRICES, model);
}
