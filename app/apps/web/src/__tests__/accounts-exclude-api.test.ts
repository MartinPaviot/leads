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
    update: vi.fn(),
    // The exclude path now re-selects the changed rows to feed the
    // suppression ledger (db.select(...).from(companies).where(...)).
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: {
    id: "id",
    name: "name",
    domain: "domain",
    tenantId: "tenantId",
    deletedAt: "deletedAt",
    excludedReason: "excludedReason",
    excludedAt: "excludedAt",
    properties: "properties",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ _and: args })),
  eq: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(() => "isNull"),
  isNotNull: vi.fn(() => "isNotNull"),
  sql: vi.fn(() => "sql"),
}));

vi.mock("@/lib/infra/audit-log", () => ({
  logAudit: vi.fn(),
}));

// The exclude/include path mirrors changes into the durable suppression
// ledger (lib/accounts/suppression). Its DB internals are covered by
// account-suppression.test.ts; here we stub it so this route test stays
// focused on the route's own behavior (and isn't a 500 when the ledger
// write isn't wired into the mock db).
vi.mock("@/lib/accounts/suppression", () => ({
  suppressAccounts: vi.fn().mockResolvedValue(undefined),
  liftSuppression: vi.fn().mockResolvedValue(undefined),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { logAudit } from "@/lib/infra/audit-log";

const mod = await import("@/app/api/accounts/exclude/route");

const admin = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" as const };
const viewer = { userId: "u2", tenantId: "t1", appUserId: "u2", role: "viewer" as const };

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/accounts/exclude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** Wire db.update(...).set(...).where(...).returning() to resolve `rows`, plus
 *  the follow-up db.select(...).from(companies).where(...) the exclude path
 *  runs to feed the suppression ledger (resolves to the same changed rows). */
function mockUpdateReturns(rows: Array<{ id: string }>) {
  const returningFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

  const selectWhereFn = vi
    .fn()
    .mockResolvedValue(rows.map((r) => ({ id: r.id, name: null, domain: null, properties: null })));
  const selectFromFn = vi.fn().mockReturnValue({ where: selectWhereFn });
  vi.mocked(db.select).mockReturnValue({ from: selectFromFn } as never);

  return { setFn, whereFn, returningFn };
}

describe("POST /api/accounts/exclude", () => {
  beforeEach(() => vi.clearAllMocks());

  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.POST(makeReq({ ids: ["c1"] }));
    expect(res.status).toBe(401);
  });

  it("403 when caller is a viewer (lacks companies:delete)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(viewer);
    const res = await mod.POST(makeReq({ ids: ["c1"] }));
    expect(res.status).toBe(403);
  });

  it("400 when neither ids nor all is provided", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    const res = await mod.POST(makeReq({}));
    expect(res.status).toBe(400);
  });

  it("excludes accounts: sets excludedReason + returns changed count + audits", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    const { setFn } = mockUpdateReturns([{ id: "c1" }, { id: "c2" }]);

    const res = await mod.POST(makeReq({ ids: ["c1", "c2"] }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ success: true, action: "exclude", changed: 2 });
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ excludedReason: "not_a_fit" }),
    );
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "update",
        entityType: "company",
        metadata: expect.objectContaining({ op: "exclude", count: 2, reason: "not_a_fit" }),
      }),
    );
  });

  it("honours a custom reason tag", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    const { setFn } = mockUpdateReturns([{ id: "c1" }]);

    const res = await mod.POST(makeReq({ ids: ["c1"], reason: "anti_icp_size" }));
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ excludedReason: "anti_icp_size" }),
    );
  });

  it("re-includes accounts: clears the exclusion flag", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    const { setFn } = mockUpdateReturns([{ id: "c1" }]);

    const res = await mod.POST(makeReq({ ids: ["c1"], action: "include" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toMatchObject({ success: true, action: "include", changed: 1 });
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ excludedReason: null, excludedAt: null }),
    );
  });

  it("supports the all:true path", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    const { setFn } = mockUpdateReturns([{ id: "c1" }, { id: "c2" }, { id: "c3" }]);

    const res = await mod.POST(makeReq({ all: true, reason: "do_not_contact_request" }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.changed).toBe(3);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ excludedReason: "do_not_contact_request" }),
    );
  });
});
