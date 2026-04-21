import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  insertReturningMock,
  selectMock,
  updateMock,
  recordEventMock,
  loggerWarnMock,
} = vi.hoisted(() => ({
  insertReturningMock: vi.fn(),
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  recordEventMock: vi.fn(),
  loggerWarnMock: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    insert: () => ({
      values: () => ({ returning: () => insertReturningMock() }),
    }),
    select: () => selectMock(),
    update: () => ({
      set: () => ({ where: () => updateMock() }),
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  agentActions: {
    id: "id",
    tenantId: "tenant_id",
    userId: "user_id",
    actionType: "action_type",
    payload: "payload",
    scheduledExecutionAt: "scheduled_execution_at",
    executedAt: "executed_at",
    reversedAt: "reversed_at",
    reversedByUserId: "reversed_by_user_id",
    reversibleUntil: "reversible_until",
    status: "status",
    errorMessage: "error_message",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => ({ and: a }),
  eq: (...a: unknown[]) => ({ eq: a }),
  isNull: (x: unknown) => ({ isNull: x }),
  lte: (...a: unknown[]) => ({ lte: a }),
  sql: (strings: TemplateStringsArray, ...exprs: unknown[]) => ({ sql: { strings, exprs } }),
}));

vi.mock("@/lib/guardrails/trust-score", () => ({
  recordAutonomyEvent: (input: unknown) => recordEventMock(input),
}));

vi.mock("@/lib/logger", () => {
  const logger = { warn: loggerWarnMock, info: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { default: logger, logger };
});

const { recordAgentAction, reverseAgentAction } = await import(
  "@/lib/agent-actions"
);

beforeEach(() => {
  insertReturningMock.mockReset();
  selectMock.mockReset();
  updateMock.mockReset();
  recordEventMock.mockReset();
  loggerWarnMock.mockReset();
});

describe("recordAgentAction", () => {
  it("persists immediately when graceMs is 0 (write with 24h undo window)", async () => {
    insertReturningMock.mockResolvedValue([{ id: "a1" }]);
    const { id } = await recordAgentAction({
      tenantId: "t1",
      userId: "u1",
      actionType: "contact-create",
      payload: { name: "Alice" },
    });
    expect(id).toBe("a1");
  });

  it("schedules send when graceMs > 0", async () => {
    insertReturningMock.mockResolvedValue([{ id: "a2" }]);
    const { id } = await recordAgentAction({
      tenantId: "t1",
      userId: "u1",
      actionType: "email-send",
      payload: { to: "x@y.com" },
      graceMs: 60_000,
    });
    expect(id).toBe("a2");
  });
});

describe("reverseAgentAction", () => {
  function stubSelect(rows: unknown[]) {
    selectMock.mockReturnValue({
      from: () => ({
        where: () => ({
          limit: async () => rows,
        }),
      }),
    });
  }

  it("returns not-found when row doesn't exist", async () => {
    stubSelect([]);
    const r = await reverseAgentAction({
      actionId: "missing",
      reversedByUserId: "u1",
      tenantId: "t1",
    });
    expect(r.status).toBe("not-found");
  });

  it("reverses a scheduled-not-yet-executed action", async () => {
    stubSelect([
      {
        id: "a1",
        status: "scheduled",
        reversedAt: null,
        reversibleUntil: new Date(Date.now() + 30_000),
      },
    ]);
    updateMock.mockResolvedValue(undefined);
    recordEventMock.mockResolvedValue(null);

    const r = await reverseAgentAction({
      actionId: "a1",
      reversedByUserId: "u1",
      tenantId: "t1",
    });
    expect(r.status).toBe("reversed");
    if (r.status === "reversed") {
      expect(r.previousStatus).toBe("scheduled");
    }
    expect(recordEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "undone_after_send" }),
    );
  });

  it("returns too-late when already reversed", async () => {
    stubSelect([
      {
        id: "a1",
        status: "reversed",
        reversedAt: new Date(),
      },
    ]);
    const r = await reverseAgentAction({
      actionId: "a1",
      reversedByUserId: "u1",
      tenantId: "t1",
    });
    expect(r.status).toBe("too-late");
    if (r.status === "too-late") {
      expect(r.reason).toMatch(/already/);
    }
  });

  it("returns too-late when reversibility window expired for executed rows", async () => {
    stubSelect([
      {
        id: "a1",
        status: "executed",
        reversedAt: null,
        reversibleUntil: new Date(Date.now() - 60_000),
      },
    ]);
    const r = await reverseAgentAction({
      actionId: "a1",
      reversedByUserId: "u1",
      tenantId: "t1",
    });
    expect(r.status).toBe("too-late");
  });

  it("returns too-late when action previously failed", async () => {
    stubSelect([{ id: "a1", status: "failed", reversedAt: null }]);
    const r = await reverseAgentAction({
      actionId: "a1",
      reversedByUserId: "u1",
      tenantId: "t1",
    });
    expect(r.status).toBe("too-late");
  });
});
