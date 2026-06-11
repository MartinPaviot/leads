/**
 * `?idsOnly=true` on the list endpoints — the server half of the header
 * checkbox's "select all matching": returns the ids of EVERY row the current
 * filters match (same WHERE as the list + its count), so the client can
 * select the full filtered set instead of only the loaded 200-row page.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => {
    const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext();
    if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(ctx);
  }),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: {
    id: "id",
    tenantId: "tenant_id",
    name: "name",
    domain: "domain",
    industry: "industry",
    size: "size",
    revenue: "revenue",
    description: "description",
    score: "score",
    scoreReasons: "score_reasons",
    ownerId: "owner_id",
    properties: "properties",
    createdAt: "created_at",
    updatedAt: "updated_at",
    deletedAt: "deleted_at",
    excludedReason: "excluded_reason",
  },
  contacts: {
    id: "id",
    tenantId: "tenant_id",
    firstName: "first_name",
    lastName: "last_name",
    email: "email",
    title: "title",
    phone: "phone",
    linkedinUrl: "linkedin_url",
    companyId: "company_id",
    score: "score",
    properties: "properties",
    deletedAt: "deleted_at",
  },
  activities: { id: "id" },
  users: { id: "id", firstName: "first_name", lastName: "last_name" },
}));

vi.mock("drizzle-orm", () => {
  const sqlTag = Object.assign(
    vi.fn(() => "sql"),
    { join: vi.fn(() => "sql-join") },
  );
  return {
    and: vi.fn((...args) => ({ _and: args })),
    or: vi.fn((...args) => ({ _or: args })),
    eq: vi.fn(),
    sql: sqlTag,
    desc: vi.fn(),
    isNull: vi.fn(() => "isNull"),
    isNotNull: vi.fn(() => "isNotNull"),
    ilike: vi.fn(),
    inArray: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
  };
});

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/search/industry-match", () => ({
  matchIndustries: vi.fn().mockResolvedValue([]),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const accountsModule = await import("@/app/api/accounts/route");
const contactsModule = await import("@/app/api/contacts/route");

const authCtx = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" };

/** Wire db.select for the idsOnly branch: first call is the id list
 *  (.from().where().orderBy().limit() resolves rows), second is the count
 *  (.from().where() awaited directly). */
function mockIdsOnlySelects(idRows: Array<{ id: string }>, total: number) {
  const limitFn = vi.fn().mockResolvedValue(idRows);
  const orderByFn = vi.fn().mockReturnValue({ limit: limitFn });
  vi.mocked(db.select)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy: orderByFn }) }),
    } as never)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([{ count: total }]) }),
    } as never);
  return { limitFn };
}

describe("GET /api/accounts?idsOnly=true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Once-queues survive clearAllMocks — reset so a leftover from one test
    // can never shift the next test's chain.
    vi.mocked(db.select).mockReset();
  });

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null as never);
    const res = await accountsModule.GET(new Request("http://localhost/api/accounts?idsOnly=true"));
    expect(res.status).toBe(401);
  });

  it("returns every matching id + the matching total, skipping the row payload", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    const { limitFn } = mockIdsOnlySelects([{ id: "a1" }, { id: "a2" }, { id: "a3" }], 3);

    const res = await accountsModule.GET(
      new Request("http://localhost/api/accounts?idsOnly=true&fGrade=A"),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ids: ["a1", "a2", "a3"], total: 3 });
    // Exactly the two id/count queries ran — no facets, no row hydration
    // (page 1 facets would need db.execute, which this mock doesn't even
    // define: reaching it would 500).
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2);
    // Payload guard: the id query is capped.
    expect(limitFn).toHaveBeenCalledWith(50_000);
  });

  it("reports the uncapped total so the client can detect truncation", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    mockIdsOnlySelects([{ id: "a1" }], 50_001);

    const res = await accountsModule.GET(new Request("http://localhost/api/accounts?idsOnly=true"));
    const data = await res.json();
    expect(data.ids).toEqual(["a1"]);
    expect(data.total).toBe(50_001);
  });
});

describe("GET /api/contacts?idsOnly=true", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(db.select).mockReset();
  });

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null as never);
    const res = await contactsModule.GET(new Request("http://localhost/api/contacts?idsOnly=true"));
    expect(res.status).toBe(401);
  });

  it("returns every matching id + the matching total, skipping the row payload", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    mockIdsOnlySelects([{ id: "c1" }, { id: "c2" }], 2);

    const res = await contactsModule.GET(
      new Request("http://localhost/api/contacts?idsOnly=true&fPhone=has"),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ ids: ["c1", "c2"], total: 2 });
    expect(vi.mocked(db.select)).toHaveBeenCalledTimes(2);
  });

  it("honors the deleted=true archive view (same WHERE path as the list)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx as never);
    const { isNotNull } = await import("drizzle-orm");
    mockIdsOnlySelects([{ id: "c9" }], 1);

    const res = await contactsModule.GET(
      new Request("http://localhost/api/contacts?idsOnly=true&deleted=true"),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).ids).toEqual(["c9"]);
    // The archive predicate was part of the WHERE construction.
    expect(vi.mocked(isNotNull)).toHaveBeenCalled();
  });
});
