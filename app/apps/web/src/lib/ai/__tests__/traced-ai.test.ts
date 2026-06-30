import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the flywheel so applyLearnedContext is exercised without a DB.
// vi.hoisted keeps these defined before the hoisted vi.mock factory runs.
const {
  getActivePrompt,
  getFewShotExamples,
  getPlaybookPromptBlock,
  getCoachingPromptBlock,
  getObjectionsPromptBlock,
  getWinLossPromptBlock,
} = vi.hoisted(() => ({
  getActivePrompt: vi.fn(),
  getFewShotExamples: vi.fn(),
  getPlaybookPromptBlock: vi.fn(),
  getCoachingPromptBlock: vi.fn(),
  getObjectionsPromptBlock: vi.fn(),
  getWinLossPromptBlock: vi.fn(),
}));
vi.mock("@/lib/evals/flywheel", () => ({ getActivePrompt, getFewShotExamples }));
vi.mock("@/lib/playbook/get-playbook", () => ({ getPlaybookPromptBlock }));
vi.mock("@/lib/coaching/get-coaching-guidance", () => ({ getCoachingPromptBlock }));
vi.mock("@/lib/emails/get-objections", () => ({ getObjectionsPromptBlock }));
vi.mock("@/lib/analysis/get-winloss", () => ({ getWinLossPromptBlock }));

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
  getPlaybookPromptBlock.mockReset();
  getCoachingPromptBlock.mockReset();
  getObjectionsPromptBlock.mockReset();
  getWinLossPromptBlock.mockReset();
  // Default: no entries -> all blocks empty (the common cold-start case).
  getPlaybookPromptBlock.mockResolvedValue("");
  getCoachingPromptBlock.mockResolvedValue("");
  getObjectionsPromptBlock.mockResolvedValue("");
  getWinLossPromptBlock.mockResolvedValue("");
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

describe("applyLearnedContext — playbook injection", () => {
  beforeEach(() => {
    getActivePrompt.mockResolvedValue(null);
    getFewShotExamples.mockResolvedValue([]);
  });

  it("appends the tenant playbook to the system prompt for an outbound-drafting agent", async () => {
    getPlaybookPromptBlock.mockResolvedValue("PLAYBOOK BLOCK");

    const params: Record<string, unknown> = { system: "BASE", prompt: "write a cold email" };
    await applyLearnedContext("draft-email", params, "tenant-1");

    expect(getPlaybookPromptBlock).toHaveBeenCalledWith("tenant-1");
    expect(params.system).toBe("BASE\n\nPLAYBOOK BLOCK");
  });

  it("sets system to the playbook block when the caller passed none", async () => {
    getPlaybookPromptBlock.mockResolvedValue("PLAYBOOK BLOCK");

    const params: Record<string, unknown> = { prompt: "q" };
    await applyLearnedContext("send-sequence-step", params, "tenant-1");

    expect(params.system).toBe("PLAYBOOK BLOCK");
  });

  it("does not fetch the playbook for a non-drafting agent", async () => {
    const params: Record<string, unknown> = { system: "BASE", prompt: "classify this" };
    await applyLearnedContext("process-reply", params, "tenant-1");

    expect(getPlaybookPromptBlock).not.toHaveBeenCalled();
    expect(params.system).toBe("BASE");
  });

  it("does not fetch the playbook when there is no tenantId", async () => {
    const params: Record<string, unknown> = { system: "BASE", prompt: "write a cold email" };
    await applyLearnedContext("draft-email", params);

    expect(getPlaybookPromptBlock).not.toHaveBeenCalled();
    expect(params.system).toBe("BASE");
  });

  it("leaves the system prompt untouched when the tenant has no playbook (empty block)", async () => {
    getPlaybookPromptBlock.mockResolvedValue("");

    const params: Record<string, unknown> = { system: "BASE", prompt: "write a cold email" };
    await applyLearnedContext("draft-email", params, "tenant-1");

    expect(params.system).toBe("BASE");
  });

  it("never throws on the hot path when the playbook lookup fails", async () => {
    getPlaybookPromptBlock.mockRejectedValue(new Error("db down"));

    const params: Record<string, unknown> = { system: "BASE", prompt: "q" };
    await expect(applyLearnedContext("draft-email", params, "tenant-1")).resolves.toBeUndefined();
    expect(params.system).toBe("BASE");
  });
});

describe("applyLearnedContext — coaching injection", () => {
  beforeEach(() => {
    getActivePrompt.mockResolvedValue(null);
    getFewShotExamples.mockResolvedValue([]);
  });

  it("appends recent coaching after the playbook for a drafting agent", async () => {
    getPlaybookPromptBlock.mockResolvedValue("PLAYBOOK BLOCK");
    getCoachingPromptBlock.mockResolvedValue("COACHING BLOCK");

    const params: Record<string, unknown> = { system: "BASE", prompt: "write a cold email" };
    await applyLearnedContext("draft-email", params, "tenant-1");

    expect(getCoachingPromptBlock).toHaveBeenCalledWith("tenant-1");
    // Order: base, then playbook (what worked), then coaching (what to fix).
    expect(params.system).toBe("BASE\n\nPLAYBOOK BLOCK\n\nCOACHING BLOCK");
  });

  it("appends coaching alone when the playbook is empty", async () => {
    getPlaybookPromptBlock.mockResolvedValue("");
    getCoachingPromptBlock.mockResolvedValue("COACHING BLOCK");

    const params: Record<string, unknown> = { system: "BASE", prompt: "q" };
    await applyLearnedContext("follow-up-email", params, "tenant-1");

    expect(params.system).toBe("BASE\n\nCOACHING BLOCK");
  });

  it("does not fetch coaching for a non-drafting agent", async () => {
    const params: Record<string, unknown> = { system: "BASE", prompt: "classify" };
    await applyLearnedContext("process-reply", params, "tenant-1");

    expect(getCoachingPromptBlock).not.toHaveBeenCalled();
    expect(params.system).toBe("BASE");
  });

  it("never throws on the hot path when the coaching lookup fails", async () => {
    getPlaybookPromptBlock.mockResolvedValue("");
    getCoachingPromptBlock.mockRejectedValue(new Error("db down"));

    const params: Record<string, unknown> = { system: "BASE", prompt: "q" };
    await expect(applyLearnedContext("draft-email", params, "tenant-1")).resolves.toBeUndefined();
    expect(params.system).toBe("BASE");
  });
});

describe("applyLearnedContext — per-contact objection injection", () => {
  beforeEach(() => {
    getActivePrompt.mockResolvedValue(null);
    getFewShotExamples.mockResolvedValue([]);
  });

  it("appends the contact's objections after playbook + coaching when a contactId is supplied", async () => {
    getPlaybookPromptBlock.mockResolvedValue("PLAYBOOK BLOCK");
    getCoachingPromptBlock.mockResolvedValue("COACHING BLOCK");
    getObjectionsPromptBlock.mockResolvedValue("OBJECTIONS BLOCK");

    const params: Record<string, unknown> = { system: "BASE", prompt: "write a cold email" };
    await applyLearnedContext("draft-email", params, "tenant-1", { contactId: "c1", companyId: "co1" });

    expect(getObjectionsPromptBlock).toHaveBeenCalledWith("tenant-1", "c1");
    expect(params.system).toBe("BASE\n\nPLAYBOOK BLOCK\n\nCOACHING BLOCK\n\nOBJECTIONS BLOCK");
  });

  it("does not fetch objections when no contactId is supplied", async () => {
    const params: Record<string, unknown> = { system: "BASE", prompt: "q" };
    await applyLearnedContext("draft-email", params, "tenant-1", { companyId: "co1" });

    expect(getObjectionsPromptBlock).not.toHaveBeenCalled();
    expect(params.system).toBe("BASE");
  });

  it("does not fetch objections for a non-drafting agent even with a contactId", async () => {
    const params: Record<string, unknown> = { system: "BASE", prompt: "classify" };
    await applyLearnedContext("process-reply", params, "tenant-1", { contactId: "c1" });

    expect(getObjectionsPromptBlock).not.toHaveBeenCalled();
    expect(params.system).toBe("BASE");
  });

  it("never throws on the hot path when the objection lookup fails", async () => {
    getObjectionsPromptBlock.mockRejectedValue(new Error("db down"));

    const params: Record<string, unknown> = { system: "BASE", prompt: "q" };
    await expect(
      applyLearnedContext("draft-email", params, "tenant-1", { contactId: "c1" }),
    ).resolves.toBeUndefined();
    expect(params.system).toBe("BASE");
  });
});

describe("applyLearnedContext — per-company win/loss injection", () => {
  beforeEach(() => {
    getActivePrompt.mockResolvedValue(null);
    getFewShotExamples.mockResolvedValue([]);
  });

  it("appends the company's win/loss lessons last, after objections, when a companyId is supplied", async () => {
    getPlaybookPromptBlock.mockResolvedValue("PLAYBOOK BLOCK");
    getObjectionsPromptBlock.mockResolvedValue("OBJECTIONS BLOCK");
    getWinLossPromptBlock.mockResolvedValue("WINLOSS BLOCK");

    const params: Record<string, unknown> = { system: "BASE", prompt: "write a cold email" };
    await applyLearnedContext("draft-email", params, "tenant-1", { contactId: "c1", companyId: "co1" });

    expect(getWinLossPromptBlock).toHaveBeenCalledWith("tenant-1", "co1");
    expect(params.system).toBe("BASE\n\nPLAYBOOK BLOCK\n\nOBJECTIONS BLOCK\n\nWINLOSS BLOCK");
  });

  it("does not fetch win/loss when no companyId is supplied", async () => {
    const params: Record<string, unknown> = { system: "BASE", prompt: "q" };
    await applyLearnedContext("draft-email", params, "tenant-1", { contactId: "c1" });

    expect(getWinLossPromptBlock).not.toHaveBeenCalled();
    expect(params.system).toBe("BASE");
  });

  it("never throws on the hot path when the win/loss lookup fails", async () => {
    getWinLossPromptBlock.mockRejectedValue(new Error("db down"));

    const params: Record<string, unknown> = { system: "BASE", prompt: "q" };
    await expect(
      applyLearnedContext("draft-email", params, "tenant-1", { companyId: "co1" }),
    ).resolves.toBeUndefined();
    expect(params.system).toBe("BASE");
  });
});
