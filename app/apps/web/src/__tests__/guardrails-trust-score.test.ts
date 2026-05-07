import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  getSettingsMock,
  updateSettingsMock,
  dbInsertMock,
  loggerWarnMock,
} = vi.hoisted(() => {
  const returnable = { id: "event-id-123" };
  return {
    getSettingsMock: vi.fn(),
    updateSettingsMock: vi.fn(),
    dbInsertMock: vi.fn(() => ({
      values: () => ({
        returning: async () => [returnable],
      }),
    })),
    loggerWarnMock: vi.fn(),
  };
});

vi.mock("@/db", () => ({
  db: {
    insert: () => dbInsertMock(),
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [],
          }),
        }),
      }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  distillationSamples: { id: "id", tenantId: "tenant_id", agentId: "agent_id", input: "input", output: "output", score: "score", createdAt: "created_at" },
  actionOutcomes: { id: "id", tenantId: "tenant_id", actionId: "action_id", outcome: "outcome", createdAt: "created_at" },
  signalOutcomes: { id: "id", tenantId: "tenant_id", signalId: "signal_id", outcome: "outcome", createdAt: "created_at" },
  agentTraces: { id: "id", tenantId: "tenant_id", agentId: "agent_id", agentCategory: "agent_category", traceId: "trace_id", input: "input", output: "output", model: "model", status: "status", inputTokens: "input_tokens", outputTokens: "output_tokens", estimatedCost: "estimated_cost", latencyMs: "latency_ms", toolCalls: "tool_calls", toolCallsCount: "tool_calls_count", errorMessage: "error_message", evalScore: "eval_score", metadata: "metadata", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
  tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
  trustEvents: {
    id: "id",
    tenantId: "tenant_id",
    userId: "user_id",
    eventType: "event_type",
    scoreDelta: "score_delta",
    newScore: "new_score",
    entityRef: "entity_ref",
    reason: "reason",
    createdAt: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  desc: (x: unknown) => ({ desc: x }),
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (tenantId: string) => getSettingsMock(tenantId),
  updateTenantSettings: (tenantId: string, updates: Record<string, unknown>) =>
    updateSettingsMock(tenantId, updates),
}));

vi.mock("@/lib/observability/logger", () => {
  const logger = {
    warn: loggerWarnMock,
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
  return { default: logger, logger };
});

const {
  recordAutonomyEvent,
  recordNudgeResponse,
  computeNudgeCandidate,
  TRUST_SCORE_DELTAS,
  NUDGE_THRESHOLDS,
} = await import("@/lib/guardrails/trust-score");

beforeEach(() => {
  getSettingsMock.mockReset();
  updateSettingsMock.mockReset();
  loggerWarnMock.mockReset();
});

describe("recordAutonomyEvent", () => {
  it("increments score by the event delta and writes the audit row", async () => {
    getSettingsMock.mockResolvedValue({ trustScore: 0.3 });
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await recordAutonomyEvent({
      tenantId: "t1",
      userId: "u1",
      eventType: "approved_no_edit",
      entityRef: "email:abc",
    });

    expect(result).not.toBeNull();
    expect(result!.previousScore).toBe(0.3);
    expect(result!.delta).toBe(TRUST_SCORE_DELTAS.approved_no_edit);
    expect(result!.newScore).toBeCloseTo(0.32, 5);
    expect(updateSettingsMock).toHaveBeenCalledWith("t1", expect.objectContaining({
      trustScore: expect.closeTo(0.32, 5),
    }));
  });

  it("clamps score at 1.0 on overflow", async () => {
    getSettingsMock.mockResolvedValue({ trustScore: 0.99 });
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await recordAutonomyEvent({
      tenantId: "t1",
      eventType: "approved_no_edit",
    });

    expect(result!.newScore).toBe(1.0);
  });

  it("clamps score at 0 on underflow", async () => {
    getSettingsMock.mockResolvedValue({ trustScore: 0.02 });
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await recordAutonomyEvent({
      tenantId: "t1",
      eventType: "undone_after_send", // -0.05
    });

    expect(result!.newScore).toBe(0);
  });

  it("does not update settings for zero-delta events (nudge lifecycle)", async () => {
    getSettingsMock.mockResolvedValue({ trustScore: 0.4 });
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await recordAutonomyEvent({
      tenantId: "t1",
      eventType: "nudge_offered",
    });

    expect(result!.newScore).toBe(0.4);
    expect(result!.delta).toBe(0);
    expect(updateSettingsMock).not.toHaveBeenCalled();
  });

  it("accepts a customDelta override", async () => {
    getSettingsMock.mockResolvedValue({ trustScore: 0.5 });
    updateSettingsMock.mockResolvedValue(undefined);

    const result = await recordAutonomyEvent({
      tenantId: "t1",
      eventType: "approved_no_edit",
      customDelta: 0.1,
    });

    expect(result!.delta).toBe(0.1);
    expect(result!.newScore).toBeCloseTo(0.6, 5);
  });

  it("swallows DB errors and returns null", async () => {
    getSettingsMock.mockRejectedValue(new Error("DB down"));

    const result = await recordAutonomyEvent({
      tenantId: "t1",
      eventType: "approved_no_edit",
    });

    expect(result).toBeNull();
    expect(loggerWarnMock).toHaveBeenCalled();
  });
});

describe("computeNudgeCandidate", () => {
  const now = new Date("2026-04-21T10:00:00.000Z");

  it("returns null if agentMemoryPanelDiscovered is false", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.9,
        agentMemoryPanelDiscovered: false,
        agentApprovalMode: "review-each",
      },
      now,
    );
    expect(nudge).toBeNull();
  });

  it("returns null below the batch-daily threshold", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.4,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "review-each",
      },
      now,
    );
    expect(nudge).toBeNull();
  });

  it("suggests batch-daily at the threshold", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: NUDGE_THRESHOLDS.batchDaily,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "review-each",
      },
      now,
    );
    expect(nudge).toBe("batch-daily");
  });

  it("suggests auto-high-confidence at its threshold", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: NUDGE_THRESHOLDS.autoHighConfidence,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "batch-daily",
      },
      now,
    );
    expect(nudge).toBe("auto-high-confidence");
  });

  it("does not re-offer an accepted nudge", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.6,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "batch-daily",
        autonomyNudgeState: {
          batchDailyOffered: true,
          batchDailyAcceptedAt: "2026-04-20T10:00:00.000Z",
          autoHighConfidenceOffered: false,
        },
      },
      now,
    );
    expect(nudge).toBeNull();
  });

  it("does not re-offer a recently dismissed nudge (< 14 days)", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.6,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "review-each",
        autonomyNudgeState: {
          batchDailyOffered: true,
          batchDailyDismissedAt: "2026-04-10T10:00:00.000Z", // 11 days ago
          autoHighConfidenceOffered: false,
        },
      },
      now,
    );
    expect(nudge).toBeNull();
  });

  it("re-offers a nudge dismissed more than 14 days ago", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.6,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "review-each",
        autonomyNudgeState: {
          batchDailyOffered: true,
          batchDailyDismissedAt: "2026-04-01T10:00:00.000Z", // 20 days ago
          autoHighConfidenceOffered: false,
        },
      },
      now,
    );
    expect(nudge).toBe("batch-daily");
  });

  it("never suggests a mode the user already has", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.9,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "auto-high-confidence",
      },
      now,
    );
    expect(nudge).toBeNull();
  });

  it("treats legacy auto as already auto-high-confidence (no nudge)", () => {
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.9,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "auto" as never,
      },
      now,
    );
    expect(nudge).toBeNull();
  });

  it("offers the highest applicable nudge first (auto before batch)", () => {
    // When trust is high enough for both, we never need to see the
    // batch-daily nudge — the user's history supports going further.
    const nudge = computeNudgeCandidate(
      {
        trustScore: 0.9,
        agentMemoryPanelDiscovered: true,
        agentApprovalMode: "review-each",
      },
      now,
    );
    expect(nudge).toBe("auto-high-confidence");
  });
});

describe("recordNudgeResponse", () => {
  it("accepted response mutates mode + autonomyNudgeState", async () => {
    getSettingsMock.mockResolvedValue({
      autonomyNudgeState: {
        batchDailyOffered: true,
        autoHighConfidenceOffered: false,
      },
      trustScore: 0.55,
    });
    updateSettingsMock.mockResolvedValue(undefined);

    await recordNudgeResponse({
      tenantId: "t1",
      userId: "u1",
      nudge: "batch-daily",
      response: "accepted",
    });

    // First call — the nudge acceptance itself.
    const firstCall = updateSettingsMock.mock.calls[0];
    expect(firstCall[0]).toBe("t1");
    expect(firstCall[1].agentApprovalMode).toBe("batch-daily");
    expect(firstCall[1].autonomyNudgeState).toMatchObject({
      batchDailyOffered: true,
      batchDailyAcceptedAt: expect.any(String),
    });
  });

  it("dismissed response stores dismissal timestamp, does NOT mutate mode", async () => {
    getSettingsMock.mockResolvedValue({
      autonomyNudgeState: {
        batchDailyOffered: true,
        autoHighConfidenceOffered: false,
      },
      agentApprovalMode: "review-each",
    });
    updateSettingsMock.mockResolvedValue(undefined);

    await recordNudgeResponse({
      tenantId: "t1",
      nudge: "batch-daily",
      response: "dismissed",
    });

    const firstCall = updateSettingsMock.mock.calls[0];
    expect(firstCall[1].agentApprovalMode).toBeUndefined(); // not mutated
    expect(firstCall[1].autonomyNudgeState).toMatchObject({
      batchDailyDismissedAt: expect.any(String),
    });
  });
});
