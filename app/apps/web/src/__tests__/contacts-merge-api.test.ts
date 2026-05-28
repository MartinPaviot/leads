import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  contacts: {
    id: "id",
    tenantId: "tenantId",
    email: "email",
    firstName: "firstName",
    lastName: "lastName",
    title: "title",
    companyId: "companyId",
    score: "score",
    updatedAt: "updatedAt",
    properties: "properties",
  },
  activities: { tenantId: "tenantId", entityType: "entityType", entityId: "entityId" },
  deals: { tenantId: "tenantId", contactId: "contactId" },
  sequenceEnrollments: { contactId: "contactId" },
  tasks: { tenantId: "tenantId", entityType: "entityType", entityId: "entityId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const mod = await import("@/app/api/contacts/merge/route");

const authCtx = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "admin" as const,
};

function mockSelectChain(rows: unknown[]) {
  // GET path: db.select().from().where() — terminates at where.
  const terminator = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: terminator });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function jsonReq(body?: unknown, method: string = "POST") {
  return new Request("http://localhost/api/contacts/merge", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ============================================================
// GET /api/contacts/merge
// ============================================================

describe("GET /api/contacts/merge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.GET();
    expect(res.status).toBe(401);
  });

  it("returns no groups when tenant has no contacts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectChain([]);
    const res = await mod.GET();
    expect(res.status).toBe(200);
    expect((await res.json()).groups).toEqual([]);
  });

  it("returns no groups when no email collisions", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectChain([
      { id: "c1", email: "a@x.com", properties: {}, updatedAt: null },
      { id: "c2", email: "b@x.com", properties: {}, updatedAt: null },
    ]);
    const res = await mod.GET();
    expect((await res.json()).groups).toEqual([]);
  });

  it("groups by lowercase email + sorts candidates by richness", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectChain([
      { id: "c1", email: "BOB@x.com", properties: { a: 1 }, updatedAt: new Date("2026-01-01") },
      { id: "c2", email: "bob@X.com", properties: { a: 1, b: 2, c: 3 }, updatedAt: new Date("2026-04-01") },
      { id: "c3", email: " bob@x.com ", properties: { a: 1, b: 2 }, updatedAt: new Date("2026-02-01") },
      { id: "c4", email: "alice@x.com", properties: {}, updatedAt: null }, // singleton, excluded
    ]);
    const res = await mod.GET();
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].email).toBe("bob@x.com");
    expect(body.groups[0].count).toBe(3);
    // Sorted: most properties first (c2 has 3), tie-break by updatedAt desc (c3 2026-02 > c1 2026-01)
    expect(body.groups[0].candidates.map((c: { id: string }) => c.id)).toEqual(["c2", "c3", "c1"]);
  });

  it("ignores contacts with null/empty emails", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectChain([
      { id: "c1", email: null, properties: {}, updatedAt: null },
      { id: "c2", email: "  ", properties: {}, updatedAt: null },
      { id: "c3", email: "x@x.com", properties: {}, updatedAt: null },
      { id: "c4", email: "x@x.com", properties: {}, updatedAt: null },
    ]);
    const res = await mod.GET();
    const body = await res.json();
    expect(body.groups).toHaveLength(1);
    expect(body.groups[0].email).toBe("x@x.com");
    expect(body.groups[0].count).toBe(2);
  });
});

// ============================================================
// POST /api/contacts/merge
// ============================================================

describe("POST /api/contacts/merge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.POST(jsonReq({ survivorId: "a", mergedIds: ["b"] }));
    expect(res.status).toBe(401);
  });

  it("400 on validation failure (no mergedIds)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await mod.POST(jsonReq({ survivorId: "a", mergedIds: [] }));
    expect(res.status).toBe(400);
  });

  it("400 when survivor appears in mergedIds (would self-delete)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await mod.POST(jsonReq({ survivorId: "a", mergedIds: ["a", "b"] }));
    expect(res.status).toBe(400);
  });

  it("404 when not all involved contacts belong to the caller's tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    // Tenant scope check returns only `survivor`, missing `merged-1`.
    mockSelectChain([{ id: "survivor" }]);
    const res = await mod.POST(jsonReq({ survivorId: "survivor", mergedIds: ["merged-1"] }));
    expect(res.status).toBe(404);
  });

  it("happy path: repoints FKs, deletes merged rows, returns merged count", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectChain([{ id: "survivor" }, { id: "merged-1" }, { id: "merged-2" }]);

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({ where: deleteWhere } as never);

    const res = await mod.POST(
      jsonReq({ survivorId: "survivor", mergedIds: ["merged-1", "merged-2"] })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.merged).toBe(2);
    // 4 update calls (activities, deals, sequenceEnrollments, tasks) all setting to survivorId
    expect(updateSet).toHaveBeenCalledTimes(4);
    for (const call of updateSet.mock.calls) {
      const arg = call[0] as Record<string, unknown>;
      const v = arg.entityId ?? arg.contactId;
      expect(v).toBe("survivor");
    }
    // 1 delete on contacts
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });
});
