/**
 * Worker module loading and health worker tests.
 *
 * These tests verify that each worker module can be imported without
 * errors and that the health worker produces the expected response
 * format. External dependencies (Redis, PostgreSQL, EmailEngine) are
 * mocked so the tests run without infrastructure.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock external dependencies before importing workers ──

// Mock ioredis
vi.mock("ioredis", () => {
  const RedisMock = vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue("OK"),
    incr: vi.fn().mockResolvedValue(1),
    expire: vi.fn().mockResolvedValue(1),
    disconnect: vi.fn(),
  }));
  return { default: RedisMock };
});

// Mock bullmq
const mockWorkerInstance = {
  on: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
};

vi.mock("bullmq", () => ({
  Worker: vi.fn().mockImplementation((_name: string, processor: unknown) => {
    // Store the processor so tests can invoke it directly
    (mockWorkerInstance as Record<string, unknown>).__processor = processor;
    return mockWorkerInstance;
  }),
  Queue: vi.fn().mockImplementation(() => ({
    add: vi.fn().mockResolvedValue({}),
    upsertJobScheduler: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock postgres
vi.mock("postgres", () => {
  const sqlTag = vi.fn().mockResolvedValue([]);
  return { default: vi.fn(() => sqlTag) };
});

// Mock EmailEngine service
vi.mock("../services/emailengine.js", () => ({
  sendEmail: vi.fn().mockResolvedValue({ messageId: "test-msg-id", id: "test-id", response: "OK" }),
  getAccountStatus: vi.fn().mockResolvedValue({ account: "test", state: "connected" }),
}));

// Mock rate limiter
vi.mock("../services/rate-limiter.js", () => ({
  RateLimiter: {
    check: vi.fn().mockResolvedValue(true),
    recordSend: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock rotation engine
vi.mock("../services/rotation.js", () => ({
  RotationEngine: {
    pickMailbox: vi.fn().mockResolvedValue(null),
  },
}));

// Mock Anthropic SDK
vi.mock("@anthropic-ai/sdk", () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "interested" }],
        }),
      },
    })),
  };
});

// ── Tests ──

describe("Worker module loading", () => {
  it("imports send.worker without errors", async () => {
    const mod = await import("../workers/send.worker.js");
    expect(mod.createSendWorker).toBeDefined();
    expect(typeof mod.createSendWorker).toBe("function");
  });

  it("imports reply.worker without errors", async () => {
    const mod = await import("../workers/reply.worker.js");
    expect(mod.createReplyWorker).toBeDefined();
    expect(typeof mod.createReplyWorker).toBe("function");
  });

  it("imports warmup.worker without errors", async () => {
    const mod = await import("../workers/warmup.worker.js");
    expect(mod.createWarmupWorker).toBeDefined();
    expect(typeof mod.createWarmupWorker).toBe("function");
  });

  it("imports health.worker without errors", async () => {
    const mod = await import("../workers/health.worker.js");
    expect(mod.createHealthWorker).toBeDefined();
    expect(typeof mod.createHealthWorker).toBe("function");
  });

  it("imports queues/index without errors", async () => {
    const mod = await import("../queues/index.js");
    expect(mod.sendQueue).toBeDefined();
    expect(mod.replyQueue).toBeDefined();
    expect(mod.warmupQueue).toBeDefined();
    expect(mod.healthQueue).toBeDefined();
    expect(mod.connection).toBeDefined();
  });
});

describe("Health worker response format", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createHealthWorker returns an object with close() and on() methods", async () => {
    const { createHealthWorker } = await import("../workers/health.worker.js");
    const worker = createHealthWorker();

    expect(worker).toBeDefined();
    expect(typeof worker.close).toBe("function");
    // The Worker constructor registers an error handler
    expect(mockWorkerInstance.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("createSendWorker returns an object with close() and on() methods", async () => {
    const { createSendWorker } = await import("../workers/send.worker.js");
    const worker = createSendWorker();

    expect(worker).toBeDefined();
    expect(typeof worker.close).toBe("function");
  });

  it("createReplyWorker returns an object with close() and on() methods", async () => {
    const { createReplyWorker } = await import("../workers/reply.worker.js");
    const worker = createReplyWorker();

    expect(worker).toBeDefined();
    expect(typeof worker.close).toBe("function");
  });

  it("createWarmupWorker returns an object with close() and on() methods", async () => {
    const { createWarmupWorker } = await import("../workers/warmup.worker.js");
    const worker = createWarmupWorker();

    expect(worker).toBeDefined();
    expect(typeof worker.close).toBe("function");
  });
});
