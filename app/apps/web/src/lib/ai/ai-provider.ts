/**
 * Centralized AI provider configuration with EU region routing.
 *
 * FINDING-004: The privacy page claims GDPR compliance but Anthropic API
 * calls were going to the default US endpoint (api.anthropic.com). This
 * module provides a pre-configured Anthropic provider that routes to the
 * EU endpoint when ANTHROPIC_REGION=eu is set.
 *
 * Migration path (separate PR):
 *   Replace every `import { anthropic } from "@ai-sdk/anthropic"` with
 *   `import { anthropic } from "@/lib/ai/ai-provider"` across all 83+ files.
 *   The `getModelForTask()` helper can then replace the per-file
 *   `pickModel()` / `getModel()` functions that duplicate the
 *   Anthropic-vs-OpenAI fallback logic.
 *
 * Usage:
 *   import { anthropic, getModelForTask } from "@/lib/ai/ai-provider";
 *
 *   // Drop-in replacement — same API as @ai-sdk/anthropic's default export
 *   const model = anthropic("claude-sonnet-4-6");
 *
 *   // Or use the task-based helper
 *   const model = getModelForTask("chat");       // claude-sonnet-4-6
 *   const model = getModelForTask("lightweight"); // claude-haiku-4-5-20251001
 *   const model = getModelForTask("embedding");   // openai text-embedding-3-small
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { openai, createOpenAI } from "@ai-sdk/openai";
import { isCircuitClosed, ANTHROPIC_CIRCUIT } from "../infra/circuit-breaker";

// ---------------------------------------------------------------------------
// Region configuration
// ---------------------------------------------------------------------------

// NOTE: `@ai-sdk/anthropic`'s `createAnthropic({ baseURL })` treats baseURL as
// the full API PREFIX and appends "/messages" to it. The SDK's own default is
// "https://api.anthropic.com/v1", so the prefix MUST include "/v1" — otherwise
// requests hit ".../messages" (no /v1) and Anthropic returns 404 Not Found,
// which surfaced as empty chat responses + inert intelligence in prod.

/** Anthropic's EU endpoint base URL (must include the /v1 API prefix). */
const ANTHROPIC_EU_BASE_URL = "https://eu.anthropic.com/v1";

/** Anthropic's default (US) endpoint base URL (must include the /v1 API prefix). */
const ANTHROPIC_DEFAULT_BASE_URL = "https://api.anthropic.com/v1";

/**
 * Allowed base URLs for the Anthropic SDK. Any other value in
 * ANTHROPIC_API_BASE is rejected at startup to prevent SSRF via env
 * injection. Bedrock EU endpoints can be added here when needed.
 */
const ALLOWED_ANTHROPIC_BASE_URLS: ReadonlySet<string> = new Set([
  ANTHROPIC_EU_BASE_URL,
  ANTHROPIC_DEFAULT_BASE_URL,
]);

/**
 * Resolve the Anthropic base URL from environment variables.
 *
 * Priority:
 *   1. ANTHROPIC_API_BASE — explicit override (validated against allowlist)
 *   2. ANTHROPIC_REGION=eu — shorthand for the EU endpoint
 *   3. Default — https://api.anthropic.com
 */
function resolveAnthropicBaseUrl(): string {
  const explicit = process.env.ANTHROPIC_API_BASE;
  if (explicit) {
    const normalized = explicit.replace(/\/+$/, "");
    if (!ALLOWED_ANTHROPIC_BASE_URLS.has(normalized)) {
      throw new Error(
        `[ai-provider] ANTHROPIC_API_BASE "${normalized}" is not in the ` +
          `allowlist. Allowed values: ${[...ALLOWED_ANTHROPIC_BASE_URLS].join(", ")}. ` +
          `This guard prevents SSRF via env injection.`,
      );
    }
    return normalized;
  }

  const region = process.env.ANTHROPIC_REGION?.toLowerCase();
  if (region === "eu") {
    return ANTHROPIC_EU_BASE_URL;
  }

  return ANTHROPIC_DEFAULT_BASE_URL;
}

// ---------------------------------------------------------------------------
// Singleton provider
// ---------------------------------------------------------------------------

let _anthropicProvider: ReturnType<typeof createAnthropic> | null = null;

/**
 * Returns a pre-configured Anthropic provider function.
 *
 * This is a drop-in replacement for the default `anthropic` export from
 * `@ai-sdk/anthropic`. Call it with a model ID to get a model instance:
 *
 *   anthropic("claude-sonnet-4-6")
 *
 * The provider is created once and reused (singleton) so every call site
 * in the process shares the same baseURL configuration.
 */
function getAnthropicProvider(): ReturnType<typeof createAnthropic> {
  if (!_anthropicProvider) {
    const baseURL = resolveAnthropicBaseUrl();
    _anthropicProvider = createAnthropic({
      baseURL,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }
  return _anthropicProvider;
}

/**
 * Drop-in replacement for `import { anthropic } from "@ai-sdk/anthropic"`.
 *
 * The underlying provider is lazily created on first use so that env vars
 * are read at runtime, not at module-load time (important for test mocking).
 *
 * Usage:
 *   import { anthropic } from "@/lib/ai/ai-provider";
 *   const model = anthropic("claude-sonnet-4-6");
 */
export const anthropic: ReturnType<typeof createAnthropic> = new Proxy(
  // The proxy target MUST be a function (not {}) for the `apply` trap to
  // fire when calling `anthropic("claude-sonnet-4-6")`. Per the JS spec,
  // `Proxy.apply` is only invoked when the target itself is callable.
  function () {} as unknown as ReturnType<typeof createAnthropic>,
  {
    apply(_target, _thisArg, args) {
      const provider = getAnthropicProvider();
      return (provider as Function).apply(provider, args);
    },
    get(_target, prop) {
      const provider = getAnthropicProvider();
      const val = (provider as unknown as Record<string | symbol, unknown>)[prop];
      if (typeof val === "function") {
        return val.bind(provider);
      }
      return val;
    },
  },
);

// ---------------------------------------------------------------------------
// Mistral (EU-sovereign opt-in) — OpenAI-compatible endpoint
// ---------------------------------------------------------------------------

/**
 * Sovereign-EU LLM provider. Activated by setting MISTRAL_API_KEY and
 * either LLM_PROVIDER=mistral (force) or LLM_PROVIDER=auto (fallback when
 * Anthropic is unavailable).
 *
 * Mistral exposes an OpenAI-compatible API at https://api.mistral.ai/v1,
 * so we reuse the AI SDK's createOpenAI factory with a different base URL.
 * No new dependency required.
 */
const MISTRAL_BASE_URL = "https://api.mistral.ai/v1";

let _mistralProvider: ReturnType<typeof createOpenAI> | null = null;

function getMistralProvider(): ReturnType<typeof createOpenAI> | null {
  if (!process.env.MISTRAL_API_KEY) return null;
  if (!_mistralProvider) {
    _mistralProvider = createOpenAI({
      baseURL: MISTRAL_BASE_URL,
      apiKey: process.env.MISTRAL_API_KEY,
    });
  }
  return _mistralProvider;
}

/** Return true if the current `LLM_PROVIDER` setting selects Mistral. */
function shouldUseMistral(): boolean {
  const provider = process.env.LLM_PROVIDER?.toLowerCase();
  return (provider === "mistral" || provider === "auto") && !!process.env.MISTRAL_API_KEY;
}

// ---------------------------------------------------------------------------
// Model selection helpers
// ---------------------------------------------------------------------------

/** Default model IDs per task type and per provider. */
const MODEL_MAP = {
  /** Primary model for chat, analysis, generation. */
  chat: "claude-sonnet-4-6",
  /** Fast/cheap model for classification, extraction, triage. */
  lightweight: "claude-haiku-4-5-20251001",
  /** OpenAI embedding model (no Anthropic equivalent). */
  embedding: "text-embedding-3-small",
} as const;

/** Mistral model IDs equivalent to the Anthropic / OpenAI defaults. */
const MISTRAL_MODEL_MAP = {
  chat: "mistral-large-latest",
  lightweight: "mistral-small-latest",
  embedding: "mistral-embed",
} as const;

type TaskType = keyof typeof MODEL_MAP;

/**
 * Return the right model for a given task, with Anthropic-vs-OpenAI
 * fallback logic baked in.
 *
 * - "chat" and "lightweight" prefer Anthropic, fall back to OpenAI.
 * - "embedding" always uses OpenAI (Anthropic has no embedding model).
 * - If the Anthropic circuit breaker is OPEN, immediately route to the
 *   OpenAI fallback instead of waiting for a timeout. This is the
 *   "Cursor March 2026 lesson" — when a provider is down, don't make
 *   users wait for every request to individually time out.
 *
 * Returns `null` if neither provider is configured for the requested task.
 */
export function getModelForTask(task: TaskType) {
  const useMistral = shouldUseMistral();
  const forceMistral = process.env.LLM_PROVIDER?.toLowerCase() === "mistral";

  // Embeddings: Mistral Embed when the sovereign profile is on, otherwise OpenAI.
  if (task === "embedding") {
    if (useMistral) {
      const m = getMistralProvider();
      if (m) return m.embedding(MISTRAL_MODEL_MAP.embedding);
      if (forceMistral) return null;
    }
    if (!process.env.OPENAI_API_KEY) return null;
    return openai.embedding(MODEL_MAP.embedding);
  }

  // Chat / lightweight: try Mistral (sovereign opt-in) first when configured.
  if (useMistral) {
    const m = getMistralProvider();
    if (m) return m(MISTRAL_MODEL_MAP[task]);
    if (forceMistral) return null;
  }

  const modelId = MODEL_MAP[task];
  const anthropicAvailable =
    !!process.env.ANTHROPIC_API_KEY &&
    isCircuitClosed(ANTHROPIC_CIRCUIT.name);

  if (anthropicAvailable) {
    return anthropic(modelId);
  }
  if (process.env.OPENAI_API_KEY) {
    // Fallback to OpenAI equivalents — either because Anthropic isn't
    // configured, or because the Anthropic circuit breaker is open.
    const openaiEquiv = task === "chat" ? "gpt-4o" : "gpt-4o-mini";
    return openai(openaiEquiv);
  }
  // Last resort: try Anthropic even if the circuit is open — better to
  // attempt the call than return null (which disables AI entirely).
  if (process.env.ANTHROPIC_API_KEY) {
    return anthropic(modelId);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sovereign profile diagnostics
// ---------------------------------------------------------------------------

/**
 * Returns the resolved primary provider name. Useful for logging /
 * health endpoints to expose which profile is active.
 */
export function getActiveProvider(): "mistral" | "anthropic-eu" | "anthropic-us" | "openai-fallback" | "none" {
  if (shouldUseMistral()) return "mistral";
  if (process.env.ANTHROPIC_API_KEY) {
    return isAnthropicEuConfigured() ? "anthropic-eu" : "anthropic-us";
  }
  if (process.env.OPENAI_API_KEY) return "openai-fallback";
  return "none";
}

// ---------------------------------------------------------------------------
// Diagnostics (used by health checks / startup validation)
// ---------------------------------------------------------------------------

/**
 * Return the resolved Anthropic base URL for diagnostics and health checks.
 * Does NOT create the provider — safe to call at startup.
 */
export function getConfiguredAnthropicBaseUrl(): string {
  return resolveAnthropicBaseUrl();
}

/**
 * Returns true if the current Anthropic configuration points to an EU
 * endpoint.
 */
export function isAnthropicEuConfigured(): boolean {
  return resolveAnthropicBaseUrl() === ANTHROPIC_EU_BASE_URL;
}

// ---------------------------------------------------------------------------
// Reset (for testing only)
// ---------------------------------------------------------------------------

/** @internal — reset the singleton so tests can change env vars. */
export function _resetProviderForTesting(): void {
  _anthropicProvider = null;
}
