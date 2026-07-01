import { describe, it, expect, vi, beforeEach } from "vitest";

// getFewShotExamples must scope its read to the caller's tenant: a few-shot
// `output` is an approved email body, so an unscoped read leaks one tenant's
// copy into another's prompt. This pins that passing tenantId adds a third
// (tenant-tag) WHERE condition, and omitting it keeps the legacy two — the
// filter is fail-closed against rows that don't carry a tenant tag.

const h = vi.hoisted(() => ({ andArgs: [] as unknown[] }));

vi.mock("@/db", () => {
  const chain = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "from", "where", "orderBy", "limit"]) c[m] = () => c;
    (c as { then: unknown }).then = (res: (v: unknown) => unknown) => res([]);
    return c;
  };
  return { db: { select: () => chain() } };
});

vi.mock("@/db/schema", () => ({
  agentFewShotExamples: {
    agentId: "afse.agent_id",
    isActive: "afse.is_active",
    tags: "afse.tags",
    input: "afse.input",
    output: "afse.output",
    evalScore: "afse.eval_score",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => {
    h.andArgs = a;
    return { _and: a };
  },
  eq: (...a: unknown[]) => ({ _eq: a }),
  desc: (...a: unknown[]) => ({ _desc: a }),
  gte: (...a: unknown[]) => ({ _gte: a }),
  lte: (...a: unknown[]) => ({ _lte: a }),
  count: (...a: unknown[]) => ({ _count: a }),
  sql: (..._a: unknown[]) => ({ _sql: true }),
}));

// Keep flywheel's heavy module-load imports inert (no env, no network).
vi.mock("@/lib/distillation/pipeline", () => ({ captureDistillationSample: vi.fn() }));
vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: () => ({}) }));
vi.mock("@ai-sdk/openai", () => ({ openai: () => ({}) }));
vi.mock("ai", () => ({ generateText: vi.fn(), generateObject: vi.fn() }));
vi.mock("../observability/observability", () => ({ AGENT_REGISTRY: {} }));

const { getFewShotExamples } = await import("@/lib/evals/flywheel");

describe("getFewShotExamples — tenant-scoped read (fail closed)", () => {
  beforeEach(() => {
    h.andArgs = [];
  });

  it("adds a tenant-tag condition when tenantId is provided", async () => {
    await getFewShotExamples("draft-email", "tenant-9");
    // agentId + isActive + tenant tag
    expect(h.andArgs.length).toBe(3);
  });

  it("keeps only the legacy two conditions when tenantId is omitted", async () => {
    await getFewShotExamples("draft-email");
    expect(h.andArgs.length).toBe(2);
  });
});
