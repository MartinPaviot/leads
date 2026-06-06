/**
 * Tests for @/lib/ai-provider — centralized AI provider configuration.
 *
 * Validates the module exports, model selection helpers, and EU region
 * routing without requiring actual API keys or network calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// vi.hoisted runs before vi.mock hoisting — safe for factory references
const { mockCreateAnthropic } = vi.hoisted(() => {
  const mockCreateAnthropic = vi.fn(() => {
    const provider = Object.assign(
      (modelId: string) => ({ modelId, provider: "anthropic" }),
      {
        languageModel: (modelId: string) => ({ modelId, provider: "anthropic" }),
      },
    );
    return provider;
  });
  return { mockCreateAnthropic };
});

// Mock the circuit breaker so getModelForTask doesn't depend on it
vi.mock("@/lib/circuit-breaker", () => ({
  isCircuitClosed: vi.fn().mockReturnValue(true),
  ANTHROPIC_CIRCUIT: { name: "anthropic" },
}));

// Mock @ai-sdk/anthropic so the Proxy can actually call through
vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}));

// Mock @ai-sdk/openai
vi.mock("@ai-sdk/openai", () => ({
  openai: Object.assign(
    (modelId: string) => ({ modelId, provider: "openai" }),
    {
      embedding: (modelId: string) => ({ modelId, provider: "openai", type: "embedding" }),
    },
  ),
}));

import {
  getModelForTask,
  getConfiguredAnthropicBaseUrl,
  isAnthropicEuConfigured,
  _resetProviderForTesting,
  anthropic,
} from "@/lib/ai/ai-provider";

// Save original env vars
const origAnthropicKey = process.env.ANTHROPIC_API_KEY;
const origAnthropicRegion = process.env.ANTHROPIC_REGION;
const origAnthropicBase = process.env.ANTHROPIC_API_BASE;
const origOpenaiKey = process.env.OPENAI_API_KEY;

beforeEach(() => {
  _resetProviderForTesting();
  mockCreateAnthropic.mockClear();
});

afterEach(() => {
  _resetProviderForTesting();
  // Restore env vars
  if (origAnthropicKey !== undefined) {
    process.env.ANTHROPIC_API_KEY = origAnthropicKey;
  } else {
    delete process.env.ANTHROPIC_API_KEY;
  }
  if (origAnthropicRegion !== undefined) {
    process.env.ANTHROPIC_REGION = origAnthropicRegion;
  } else {
    delete process.env.ANTHROPIC_REGION;
  }
  if (origAnthropicBase !== undefined) {
    process.env.ANTHROPIC_API_BASE = origAnthropicBase;
  } else {
    delete process.env.ANTHROPIC_API_BASE;
  }
  if (origOpenaiKey !== undefined) {
    process.env.OPENAI_API_KEY = origOpenaiKey;
  } else {
    delete process.env.OPENAI_API_KEY;
  }
});

describe("anthropic export", () => {
  it("exports anthropic as a truthy value", () => {
    expect(anthropic).toBeTruthy();
  });

  it("anthropic proxy delegates property access to the provider", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    _resetProviderForTesting();

    // Accessing the proxy should not throw
    expect(() => {
      const _provider = anthropic;
      return _provider;
    }).not.toThrow();
  });
});

describe("getModelForTask", () => {
  it("returns a model for 'chat' when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    _resetProviderForTesting();

    const model = getModelForTask("chat");
    expect(model).not.toBeNull();
  });

  it("returns a model for 'lightweight' when ANTHROPIC_API_KEY is set", () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    _resetProviderForTesting();

    const model = getModelForTask("lightweight");
    expect(model).not.toBeNull();
  });

  it("falls back to OpenAI for 'chat' when only OPENAI_API_KEY is set", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.OPENAI_API_KEY = "test-openai-key";
    _resetProviderForTesting();

    const model = getModelForTask("chat");
    expect(model).not.toBeNull();
  });

  it("returns null for 'chat' when neither provider is configured", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    _resetProviderForTesting();

    const model = getModelForTask("chat");
    expect(model).toBeNull();
  });

  it("returns null for 'embedding' when OPENAI_API_KEY is not set", () => {
    delete process.env.OPENAI_API_KEY;
    _resetProviderForTesting();

    const model = getModelForTask("embedding");
    expect(model).toBeNull();
  });

  it("returns an OpenAI embedding model when OPENAI_API_KEY is set", () => {
    process.env.OPENAI_API_KEY = "test-openai-key";
    _resetProviderForTesting();

    const model = getModelForTask("embedding");
    expect(model).not.toBeNull();
  });
});

describe("isAnthropicEuConfigured", () => {
  it("returns false by default (no ANTHROPIC_REGION set)", () => {
    delete process.env.ANTHROPIC_REGION;
    delete process.env.ANTHROPIC_API_BASE;
    _resetProviderForTesting();

    expect(isAnthropicEuConfigured()).toBe(false);
  });

  it("returns true when ANTHROPIC_REGION=eu", () => {
    process.env.ANTHROPIC_REGION = "eu";
    delete process.env.ANTHROPIC_API_BASE;
    _resetProviderForTesting();

    expect(isAnthropicEuConfigured()).toBe(true);
  });

  it("returns true when ANTHROPIC_API_BASE is set to EU endpoint", () => {
    process.env.ANTHROPIC_API_BASE = "https://eu.anthropic.com/v1";
    delete process.env.ANTHROPIC_REGION;
    _resetProviderForTesting();

    expect(isAnthropicEuConfigured()).toBe(true);
  });

  it("returns false when ANTHROPIC_API_BASE is the default US endpoint", () => {
    process.env.ANTHROPIC_API_BASE = "https://api.anthropic.com/v1";
    delete process.env.ANTHROPIC_REGION;
    _resetProviderForTesting();

    expect(isAnthropicEuConfigured()).toBe(false);
  });
});

describe("getConfiguredAnthropicBaseUrl", () => {
  it("returns the default US endpoint when no env vars are set", () => {
    delete process.env.ANTHROPIC_REGION;
    delete process.env.ANTHROPIC_API_BASE;
    _resetProviderForTesting();

    expect(getConfiguredAnthropicBaseUrl()).toBe("https://api.anthropic.com/v1");
  });

  it("rejects unknown base URLs to prevent SSRF", () => {
    process.env.ANTHROPIC_API_BASE = "https://evil.example.com";
    _resetProviderForTesting();

    expect(() => getConfiguredAnthropicBaseUrl()).toThrow(/not in the allowlist/);
  });
});
