import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAuthContext, mockInsert, mockUpdate } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockInsert: vi.fn(),
  mockUpdate: vi.fn(),
}));

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: mockGetAuthContext,
}));

vi.mock("@/db", () => ({
  db: {
    insert: mockInsert,
    update: mockUpdate,
  },
}));

vi.mock("@/db/schema", () => ({
  inboxTriage: {
    tenantId: "tenant_id",
    conversationKey: "conversation_key",
    status: "status",
    doneAt: "done_at",
    snoozedUntil: "snoozed_until",
    updatedAt: "updated_at",
  },
  outboundEmails: {
    id: "id",
    tenantId: "tenant_id",
    status: "status",
    sentAt: "sent_at",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));

const { POST: triagePost } = await import("@/app/api/inbox/triage/route");
const { POST: consumePost } = await import("@/app/api/inbox/drafts/[id]/consume/route");

function triageReq(body: unknown) {
  return new Request("http://localhost/api/inbox/triage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function insertChain(returned: unknown[]) {
  const chain = {
    values: vi.fn().mockReturnThis(),
    onConflictDoUpdate: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returned),
  };
  mockInsert.mockReturnValue(chain);
  return chain;
}

function updateChain(returned: unknown[]) {
  const chain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue(returned),
  };
  mockUpdate.mockReturnValue(chain);
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthContext.mockResolvedValue({ userId: "u1", appUserId: "au1", tenantId: "t1", role: "admin" });
});

describe("POST /api/inbox/triage", () => {
  it("401s when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await triagePost(triageReq({ conversationKey: "t1", action: "done" }));
    expect(res.status).toBe(401);
  });

  it("marks done with a done_at timestamp", async () => {
    const chain = insertChain([{ status: "done" }]);
    const res = await triagePost(triageReq({ conversationKey: "thread-1", action: "done" }));
    expect(res.status).toBe(200);
    const values = chain.values.mock.calls[0][0];
    expect(values.status).toBe("done");
    expect(values.doneAt).toBeInstanceOf(Date);
    expect(values.snoozedUntil).toBeNull();
    expect(values.tenantId).toBe("t1");
    expect(chain.onConflictDoUpdate).toHaveBeenCalled();
  });

  it("rejects snooze without snoozeUntil", async () => {
    const res = await triagePost(triageReq({ conversationKey: "thread-1", action: "snooze" }));
    expect(res.status).toBe(422);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("rejects snooze in the past", async () => {
    const res = await triagePost(
      triageReq({ conversationKey: "thread-1", action: "snooze", snoozeUntil: "2020-01-01T00:00:00.000Z" }),
    );
    expect(res.status).toBe(422);
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it("snoozes to a future date", async () => {
    const chain = insertChain([{ status: "snoozed" }]);
    const until = new Date(Date.now() + 86_400_000).toISOString();
    const res = await triagePost(triageReq({ conversationKey: "thread-1", action: "snooze", snoozeUntil: until }));
    expect(res.status).toBe(200);
    const values = chain.values.mock.calls[0][0];
    expect(values.status).toBe("snoozed");
    expect(values.snoozedUntil).toBeInstanceOf(Date);
    expect(values.doneAt).toBeNull();
  });

  it("reopens by clearing both timestamps", async () => {
    const chain = insertChain([{ status: "open" }]);
    const res = await triagePost(triageReq({ conversationKey: "thread-1", action: "reopen" }));
    expect(res.status).toBe(200);
    const values = chain.values.mock.calls[0][0];
    expect(values.status).toBe("open");
    expect(values.doneAt).toBeNull();
    expect(values.snoozedUntil).toBeNull();
  });

  it("rejects an unknown action", async () => {
    const res = await triagePost(triageReq({ conversationKey: "thread-1", action: "explode" }));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/inbox/drafts/[id]/consume", () => {
  it("401s when unauthenticated", async () => {
    mockGetAuthContext.mockResolvedValue(null);
    const res = await consumePost(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(401);
  });

  it("marks the draft skipped and returns its id", async () => {
    const chain = updateChain([{ id: "d1" }]);
    const res = await consumePost(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "d1" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).consumed).toBe("d1");
    expect(chain.set.mock.calls[0][0].status).toBe("skipped");
  });

  it("404s when no draft row matches (wrong tenant, already sent, or not a draft)", async () => {
    updateChain([]);
    const res = await consumePost(new Request("http://localhost", { method: "POST" }), {
      params: Promise.resolve({ id: "missing" }),
    });
    expect(res.status).toBe(404);
  });
});
