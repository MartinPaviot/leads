import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  userPreferences: {
    id: "id",
    userId: "userId",
    resource: "resource",
    key: "key",
    value: "value",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const mod = await import("@/app/api/user-preferences/route");

function makeReq(method: string, body?: unknown, query?: string) {
  return new Request(
    `http://localhost/api/user-preferences${query ? `?${query}` : ""}`,
    {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
}

describe("GET /api/user-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.GET(makeReq("GET", undefined, "resource=accounts"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when resource param missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    const res = await mod.GET(makeReq("GET"));
    expect(res.status).toBe(400);
  });

  it("returns a key→value map of preferences", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });

    const whereFn = vi.fn().mockResolvedValue([
      { key: "columns", value: { visible: ["name", "score"] } },
      { key: "density", value: "compact" },
    ]);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await mod.GET(makeReq("GET", undefined, "resource=accounts"));
    const data = await res.json();
    expect(data.preferences).toEqual({
      columns: { visible: ["name", "score"] },
      density: "compact",
    });
  });
});

describe("PUT /api/user-preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when body fails validation", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });
    const res = await mod.PUT(makeReq("PUT", { key: "x" })); // missing resource
    expect(res.status).toBe(400);
  });

  it("inserts when the row doesn't already exist", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });

    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const insertValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never);

    const res = await mod.PUT(
      makeReq("PUT", { resource: "accounts", key: "density", value: "compact" })
    );
    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "u1",
        resource: "accounts",
        key: "density",
        value: "compact",
      })
    );
  });

  it("updates when a row already exists", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });

    const limitFn = vi.fn().mockResolvedValue([{ id: "row-1" }]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: updateSet } as never);

    const res = await mod.PUT(
      makeReq("PUT", { resource: "accounts", key: "density", value: "comfortable" })
    );
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ value: "comfortable" })
    );
  });
});
