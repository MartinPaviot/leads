import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  savedViews: {
    id: "id",
    userId: "userId",
    resource: "resource",
    name: "name",
    filters: "filters",
    sort: "sort",
    columns: "columns",
    isDefault: "isDefault",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const mod = await import("@/app/api/views/route");

const authCtx = {
  userId: "u1",
  tenantId: "t1",
  appUserId: "u1",
  role: "admin" as const,
};

function makeReq(method: string, body?: unknown, query?: string) {
  return new Request(`http://localhost/api/views${query ? `?${query}` : ""}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /api/views", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.GET(makeReq("GET", undefined, "resource=accounts"));
    expect(res.status).toBe(401);
  });

  it("400 when resource missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await mod.GET(makeReq("GET"));
    expect(res.status).toBe(400);
  });

  it("returns the user's views for the resource", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const orderByFn = vi.fn().mockResolvedValue([
      { id: "v1", name: "High intent", resource: "accounts" },
    ]);
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderByFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await mod.GET(makeReq("GET", undefined, "resource=accounts"));
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.views).toHaveLength(1);
    expect(data.views[0].name).toBe("High intent");
  });
});

describe("POST /api/views", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.POST(makeReq("POST", { resource: "accounts", name: "x", filters: [] }));
    expect(res.status).toBe(401);
  });

  it("400 when payload fails validation", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await mod.POST(makeReq("POST", { resource: "", name: "x" })); // missing filters, empty resource
    expect(res.status).toBe(400);
  });

  it("inserts a view and returns it", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);

    const returningFn = vi.fn().mockResolvedValue([
      { id: "v-new", name: "Test", resource: "accounts" },
    ]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    const res = await mod.POST(
      makeReq("POST", {
        resource: "accounts",
        name: "Test",
        filters: [{ field: "score", operator: ">=", value: 80 }],
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.view.id).toBe("v-new");
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        resource: "accounts",
        name: "Test",
        isDefault: false,
      })
    );
  });

  it("clears sibling default flags before inserting a new default view", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const returningFn = vi.fn().mockResolvedValue([{ id: "v-default" }]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    const res = await mod.POST(
      makeReq("POST", {
        resource: "accounts",
        name: "Default",
        filters: [],
        isDefault: true,
      })
    );
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith({ isDefault: false });
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ isDefault: true })
    );
  });
});

describe("DELETE /api/views", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.DELETE(makeReq("DELETE", undefined, "id=v1"));
    expect(res.status).toBe(401);
  });

  it("400 when id missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await mod.DELETE(makeReq("DELETE"));
    expect(res.status).toBe(400);
  });

  it("deletes scoped to the caller's user", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const whereFn = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.delete).mockReturnValue({ where: whereFn } as never);

    const res = await mod.DELETE(makeReq("DELETE", undefined, "id=v1"));
    expect(res.status).toBe(200);
    expect(whereFn).toHaveBeenCalled();
  });
});
