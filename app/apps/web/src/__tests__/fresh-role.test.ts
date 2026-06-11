import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", role: "role", tenantId: "tenantId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { db } from "@/db";
import {
  getFreshRole,
  getFreshUserState,
  invalidateRoleCache,
  __clearRoleCacheForTests,
} from "@/lib/auth/fresh-role";

function mockSelectOnce(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

describe("getFreshRole", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearRoleCacheForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the role from the DB on first call", async () => {
    mockSelectOnce([{ role: "viewer" }]);
    expect(await getFreshRole("u1")).toBe("viewer");
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("serves from cache within the TTL (no second query)", async () => {
    mockSelectOnce([{ role: "member" }]);
    await getFreshRole("u1");
    expect(await getFreshRole("u1")).toBe("member");
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("re-queries after the TTL expires", async () => {
    mockSelectOnce([{ role: "member" }]);
    await getFreshRole("u1");
    vi.advanceTimersByTime(61_000);
    mockSelectOnce([{ role: "viewer" }]);
    expect(await getFreshRole("u1")).toBe("viewer");
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("invalidateRoleCache forces an immediate re-read", async () => {
    mockSelectOnce([{ role: "member" }]);
    await getFreshRole("u1");
    invalidateRoleCache("u1");
    mockSelectOnce([{ role: "admin" }]);
    expect(await getFreshRole("u1")).toBe("admin");
    expect(db.select).toHaveBeenCalledTimes(2);
  });

  it("returns null when the user row is missing", async () => {
    mockSelectOnce([]);
    expect(await getFreshRole("ghost")).toBeNull();
  });

  it("returns null on DB failure (caller falls back to the JWT role)", async () => {
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("connection refused");
    });
    expect(await getFreshRole("u1")).toBeNull();
  });

  it("defaults a NULL db role to member", async () => {
    mockSelectOnce([{ role: null }]);
    expect(await getFreshRole("u1")).toBe("member");
  });

  it("returns null for an empty user id without querying", async () => {
    expect(await getFreshRole("")).toBeNull();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("caches per user id", async () => {
    mockSelectOnce([{ role: "member" }]);
    mockSelectOnce([{ role: "viewer" }]);
    expect(await getFreshRole("u1")).toBe("member");
    expect(await getFreshRole("u2")).toBe("viewer");
    expect(db.select).toHaveBeenCalledTimes(2);
  });
});

describe("getFreshUserState", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __clearRoleCacheForTests();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns role AND tenantId from the same single query", async () => {
    mockSelectOnce([{ role: "member", tenantId: "t-pilae" }]);
    expect(await getFreshUserState("u1")).toEqual({
      role: "member",
      tenantId: "t-pilae",
    });
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("shares the cache with getFreshRole (one query serves both)", async () => {
    mockSelectOnce([{ role: "viewer", tenantId: "t1" }]);
    expect(await getFreshRole("u1")).toBe("viewer");
    expect((await getFreshUserState("u1"))?.tenantId).toBe("t1");
    expect(db.select).toHaveBeenCalledTimes(1);
  });

  it("a tenant switch is visible immediately after invalidateRoleCache (invite-accept incident)", async () => {
    mockSelectOnce([{ role: "admin", tenantId: "t-solo" }]);
    expect((await getFreshUserState("u1"))?.tenantId).toBe("t-solo");
    // invite accept: users.tenantId switched + cache dropped
    invalidateRoleCache("u1");
    mockSelectOnce([{ role: "member", tenantId: "t-pilae" }]);
    expect(await getFreshUserState("u1")).toEqual({
      role: "member",
      tenantId: "t-pilae",
    });
  });

  it("returns tenantId null when the row has none (caller falls back to the JWT claim)", async () => {
    mockSelectOnce([{ role: "member", tenantId: null }]);
    expect((await getFreshUserState("u1"))?.tenantId).toBeNull();
  });

  it("returns null on missing row / DB failure / empty id", async () => {
    mockSelectOnce([]);
    expect(await getFreshUserState("ghost")).toBeNull();
    vi.mocked(db.select).mockImplementationOnce(() => {
      throw new Error("connection refused");
    });
    expect(await getFreshUserState("u1")).toBeNull();
    expect(await getFreshUserState("")).toBeNull();
  });
});
