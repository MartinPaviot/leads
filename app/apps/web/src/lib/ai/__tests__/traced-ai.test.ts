import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the flywheel so applyLearnedContext is exercised without a DB.
// vi.hoisted keeps these defined before the hoisted vi.mock factory runs.
const { getActivePrompt, getFewShotExamples } = vi.hoisted(() => ({
  getActivePrompt: vi.fn(),
  getFewShotExamples: vi.fn(),
}));
vi.mock("@/lib/evals/flywheel", () => ({ getActivePrompt, getFewShotExamples }));

// Stub the infra siblings traced-ai imports at module load so the unit
// under test stays hermetic (these are never called by the functions we
// test, but ESM still evaluates the imports).
vi.mock("@/lib/observability/observability", () => ({
  recordTrace: vi.fn(),
  AGENT_REGISTRY: {},
}));
vi.mock("@/lib/billing/llm-budget", () => ({ enforceLlmBudget: vi.fn() }));
vi.mock("@/lib/ai/ai-provider", () => ({ isAiDisabled: () => false }));

import { applyLearnedContext, injectFewShotExamples } from "@/lib/ai/traced-ai";

beforeEach(() => {
  getActivePrompt.mockReset();
  getFewShotExamples.mockReset();
});

describe("injectFewShotExamples", () => {
  it("is a no-op for an empty example list", () => {
    const params: Record<string, unknown> = { prompt: "real question" };
    injectFewShotExamples(params, []);
    expect(params.prompt).toBe("real question");
    expect(params.messages).toBeUndefined();
  });

  it("converts a prompt-based call into messages with the examples prepended", () => {
    const params: Record<string, unknown> = { prompt: "real question" };
    injectFewShotExamples(params, [{ input: "q1", output: "a1" }]);
    expect(params.prompt).toBeUndefined();
    expect(params.messages).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "real question" },
    ]);
  });

  it("prepends the examples ahead of an existing messages array", () => {
    const params: Record<string, unknown> = {
      messages: [{ role: "user", content: "hi" }],
    };
    injectFewShotExamples(params, [{ input: "x", output: "y" }]);
    expect(params.messages).toEqual([
      { role: "user", content: "x" },
      { role: "assistant", content: "y" },
      { role: "user", content: "hi" },
    ]);
  });
});

describe("applyLearnedContext", () => {
  // The regression this fixes: few-shots used to reach the model ONLY
  // when an agent had a refined prompt VERSION. Most agents run on their
  // default prompt (getActivePrompt -> null), so curated examples never
  // got injected and the curation loop stayed open.
  it("injects curated few-shots even when there is no active prompt version", async () => {
    getActivePrompt.mockResolvedValue(null);
    getFewShotExamples.mockResolvedValue([
      { input: "q1", output: "a1" },
      { input: "q2", output: "a2" },
    ]);

    const params: Record<string, unknown> = { prompt: "real question" };
    await applyLearnedContext("draft-email", params);

    expect(getFewShotExamples).toHaveBeenCalledWith("draft-email");
    expect(params.prompt).toBeUndefined();
    expect(params.messages).toEqual([
      { role: "user", content: "q1" },
      { role: "assistant", content: "a1" },
      { role: "user", content: "q2" },
      { role: "assistant", content: "a2" },
      { role: "user", content: "real question" },
    ]);
  });

  it("uses the active version's prompt + bundled examples without a second fetch", async () => {
    getActivePrompt.mockResolvedValue({
      prompt: "REFINED",
      version: 3,
      fewShotExamples: [{ input: "x", output: "y" }],
    });

    const params: Record<string, unknown> = {
      messages: [{ role: "user", content: "hi" }],
    };
    await applyLearnedContext("chat", params);

    expect(params.system).toBe("REFINED");
    expect(getFewShotExamples).not.toHaveBeenCalled();
    expect(params.messages).toEqual([
      { role: "user", content: "x" },
      { role: "assistant", content: "y" },
      { role: "user", content: "hi" },
    ]);
  });

  it("never overwrites a system prompt the caller already set", async () => {
    getActivePrompt.mockResolvedValue({
      prompt: "REFINED",
      version: 1,
      fewShotExamples: [],
    });

    const params: Record<string, unknown> = { system: "caller-set", prompt: "q" };
    await applyLearnedContext("chat", params);

    expect(params.system).toBe("caller-set");
  });

  it("degrades safely when the flywheel lookup throws (no throw, falls back)", async () => {
    getActivePrompt.mockRejectedValue(new Error("db down"));
    getFewShotExamples.mockResolvedValue([]);

    const params: Record<string, unknown> = { prompt: "q" };
    await expect(applyLearnedContext("x", params)).resolves.toBeUndefined();
    // No examples -> prompt untouched, no crash on the hot path.
    expect(params.prompt).toBe("q");
  });
});
