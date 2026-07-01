import { describe, it, expect, vi, beforeEach } from "vitest";

// recordFlywheelCandidate gained an optional 5th arg (qualitySource). This
// pins that it is actually USED: an unedited approval tags "user-approved"
// and distills as "user_approved"; the founder's edited final tags
// "user-edited" and distills as "user_edited". Backward-compat: the 4-arg
// call (reply-flywheel listener) still behaves as user_approved.

const h = vi.hoisted(() => ({
  inserted: null as Record<string, unknown> | null,
  distill: null as Record<string, unknown> | null,
}));

vi.mock("@/db", () => {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit"]) c[m] = () => c;
    (c as { then: unknown }).then = (res: (v: unknown) => unknown) => res(result);
    return c;
  };
  return {
    db: {
      select: () => chain([]), // dup-check → none
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          h.inserted = v;
          return { returning: () => Promise.resolve([{ id: "fs-1" }]) };
        },
      }),
    },
  };
});

vi.mock("@/db/schema", () => ({
  agentFewShotExamples: { id: "id", agentId: "agent_id", input: "input", isActive: "is_active", evalScore: "eval_score" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...a: unknown[]) => ({ _eq: a }),
  and: (...a: unknown[]) => ({ _and: a }),
  desc: (...a: unknown[]) => ({ _desc: a }),
  gte: (...a: unknown[]) => ({ _gte: a }),
  lte: (...a: unknown[]) => ({ _lte: a }),
  sql: (...a: unknown[]) => ({ _sql: a }),
  count: (...a: unknown[]) => ({ _count: a }),
}));

vi.mock("@/lib/distillation/pipeline", () => ({
  captureDistillationSample: vi.fn(async (p: Record<string, unknown>) => {
    h.distill = p;
  }),
}));

// Keep AI provider / SDK imports inert at module load (no env, no network).
vi.mock("@/lib/ai/ai-provider", () => ({ anthropic: () => ({}) }));
vi.mock("@ai-sdk/openai", () => ({ openai: () => ({}) }));
vi.mock("ai", () => ({ generateText: vi.fn(), generateObject: vi.fn() }));
vi.mock("../observability/observability", () => ({ AGENT_REGISTRY: {} }));

const { recordFlywheelCandidate } = await import("@/lib/evals/flywheel");

describe("recordFlywheelCandidate — qualitySource threads to tag + distillation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.inserted = null;
    h.distill = null;
  });

  it("tags user-edited and distills user_edited for an edited final", async () => {
    await recordFlywheelCandidate("draft-email", "in", "out", "t-1", "user_edited");
    expect(h.inserted?.tags).toContain("user-edited");
    expect(h.inserted?.tags).not.toContain("user-approved");
    expect(h.distill?.qualitySource).toBe("user_edited");
  });

  it("tags user-approved and distills user_approved for an explicit approval", async () => {
    await recordFlywheelCandidate("draft-email", "in", "out", "t-1", "user_approved");
    expect(h.inserted?.tags).toContain("user-approved");
    expect(h.distill?.qualitySource).toBe("user_approved");
  });

  it("defaults to user_approved for the legacy 4-arg call", async () => {
    await recordFlywheelCandidate("draft-email", "in", "out", "t-1");
    expect(h.inserted?.tags).toContain("user-approved");
    expect(h.distill?.qualitySource).toBe("user_approved");
  });
});
