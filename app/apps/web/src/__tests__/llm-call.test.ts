import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the DB persist path so the wrapper's fire-and-forget
// insert doesn't fail tests when there's no real database. The mock
// is recordable so we can assert what was written.
const inserted: Array<Record<string, unknown>> = [];

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: vi.fn(async (row: Record<string, unknown>) => {
        inserted.push(row);
      }),
    })),
  },
}));
vi.mock("@/db/schema", () => ({ llmCalls: {} }));
vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { llmCall } from "@/lib/ai/llm-call";

const fakeModel = (id: string) => ({ modelId: id, id }) as never;

beforeEach(() => {
  inserted.length = 0;
});

describe("llmCall", () => {
  it("returns the result on first-try success and writes one ok row", async () => {
    const fn = vi.fn().mockResolvedValue({
      text: "hello",
      usage: { promptTokens: 100, completionTokens: 25 },
    });

    const out = await llmCall({
      fn,
      args: [{ model: fakeModel("gpt-4o-mini"), prompt: "hi" }],
      retries: 1,
      trace: { surfaceId: "test", promptId: "test.v1" },
    });

    expect((out as { text: string }).text).toBe("hello");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({
      surfaceId: "test",
      promptId: "test.v1",
      model: "gpt-4o-mini",
      outcome: "ok",
      attempts: 1,
      fallbackTriggered: false,
      inputTokens: 100,
      outputTokens: 25,
    });
    // Cost should be calculated for known model.
    expect(typeof inserted[0].costUsd).toBe("number");
  });

  it("retries on transient failure and reports correct attempt count", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient blip"))
      .mockResolvedValueOnce({ text: "ok", usage: { promptTokens: 1, completionTokens: 1 } });

    const out = await llmCall({
      fn,
      args: [{ model: fakeModel("gpt-4o-mini"), prompt: "x" }],
      retries: 1,
      trace: { surfaceId: "test", promptId: "test.v1" },
    });

    expect((out as { text: string }).text).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(inserted[0]).toMatchObject({ outcome: "ok", attempts: 2, fallbackTriggered: false });
  });

  it("falls back to the secondary model on terminal primary failure", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("primary down 1"))
      .mockRejectedValueOnce(new Error("primary down 2"))
      .mockResolvedValueOnce({ text: "from fallback", usage: { promptTokens: 5, completionTokens: 5 } });

    const out = await llmCall({
      fn,
      args: [{ model: fakeModel("claude-sonnet-4-6"), prompt: "x" }],
      retries: 1,
      fallbackModel: fakeModel("gpt-4o-mini"),
      trace: { surfaceId: "test", promptId: "test.v1" },
    });

    expect((out as { text: string }).text).toBe("from fallback");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(inserted[0]).toMatchObject({
      outcome: "ok",
      attempts: 3, // 2 primary + 1 fallback
      fallbackTriggered: true,
      model: "gpt-4o-mini", // the fallback we landed on
    });
  });

  it("records terminal failure when both primary and fallback fail", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("everything is down"));

    await expect(
      llmCall({
        fn,
        args: [{ model: fakeModel("claude-sonnet-4-6"), prompt: "x" }],
        retries: 1,
        fallbackModel: fakeModel("gpt-4o-mini"),
        trace: { surfaceId: "test", promptId: "test.v1" },
      }),
    ).rejects.toThrow(/everything is down/);

    expect(fn).toHaveBeenCalledTimes(3);
    expect(inserted[0]).toMatchObject({
      outcome: "error",
      attempts: 3,
      fallbackTriggered: true,
      errorMessage: expect.stringContaining("everything is down"),
    });
  });

  it("marks outcome=timeout when fn hangs past timeoutMs", async () => {
    const fn = vi.fn(() => new Promise(() => {})); // never resolves

    await expect(
      llmCall({
        fn,
        args: [{ model: fakeModel("gpt-4o-mini") }],
        retries: 0,
        timeoutMs: 50,
        trace: { surfaceId: "test", promptId: "test.v1" },
      }),
    ).rejects.toThrow(/timeout/);

    expect(inserted[0]).toMatchObject({ outcome: "timeout", attempts: 1 });
  });

  it("returns null cost for unknown model (no entry in pricing table)", async () => {
    const fn = vi.fn().mockResolvedValue({
      text: "ok",
      usage: { promptTokens: 100, completionTokens: 50 },
    });

    await llmCall({
      fn,
      args: [{ model: fakeModel("custom-finetune-9000"), prompt: "x" }],
      retries: 0,
      trace: { surfaceId: "test", promptId: "test.v1" },
    });

    expect(inserted[0].model).toBe("custom-finetune-9000");
    expect(inserted[0].costUsd).toBeNull();
  });

  it("preserves trace metadata into the persisted row", async () => {
    const fn = vi.fn().mockResolvedValue({ text: "ok", usage: {} });
    await llmCall({
      fn,
      args: [{ model: fakeModel("gpt-4o-mini"), prompt: "x" }],
      retries: 0,
      trace: {
        surfaceId: "deal-briefing",
        promptId: "deal-briefing.v3",
        tenantId: "t1",
        metadata: { agentId: "deal-coach", traceId: "trace-abc" },
      },
    });
    expect(inserted[0]).toMatchObject({
      tenantId: "t1",
      surfaceId: "deal-briefing",
      promptId: "deal-briefing.v3",
      metadata: { agentId: "deal-coach", traceId: "trace-abc" },
    });
  });

  it("captures token usage from inputTokens/outputTokens shape too", async () => {
    const fn = vi.fn().mockResolvedValue({
      text: "ok",
      usage: { inputTokens: 200, outputTokens: 75 },
    });
    await llmCall({
      fn,
      args: [{ model: fakeModel("claude-sonnet-4-6"), prompt: "x" }],
      retries: 0,
      trace: { surfaceId: "test", promptId: "test.v1" },
    });
    expect(inserted[0]).toMatchObject({ inputTokens: 200, outputTokens: 75 });
  });
});
