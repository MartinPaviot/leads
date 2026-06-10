import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Bulk cascade delete — the API surface behind the selection-bar Delete.
 *
 * Covers:
 *  - DELETE /api/accounts/batch with a `cascade` body: the list is filtered
 *    to valid CascadeType values, the cascade runs BEFORE the company
 *    soft-delete, and both share ONE timestamp (symmetric cascade-restore).
 *    Suppression + audit keep working.
 *  - POST /api/{accounts,contacts,opportunities}/related-counts: aggregate
 *    counts for a selection, restricted to live rows of the caller's tenant.
 */

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler: (ctx: unknown) => Promise<Response>) => {
    const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext();
    if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(ctx);
  }),
}));
vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  companies: { id: "id", name: "name", domain: "domain", properties: "properties", tenantId: "tenantId", deletedAt: "deletedAt" },
  contacts: { id: "id", tenantId: "tenantId", deletedAt: "deletedAt" },
  deals: { id: "id", tenantId: "tenantId", deletedAt: "deletedAt" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ _and: args })),
  eq: vi.fn((a, b) => ({ _eq: [a, b] })),
  inArray: vi.fn((col, vals) => ({ _inArray: [col, vals] })),
  isNull: vi.fn(() => "isNull"),
}));
vi.mock("@/lib/infra/audit-log", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/accounts/suppression", () => ({ suppressAccounts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/accounts/cascade-delete", () => ({
  CASCADE_TYPES: ["contacts", "deals", "activities", "notes", "tasks"],
  cascadeSoftDeleteCompanies: vi.fn().mockResolvedValue({}),
  getCompaniesRelatedCounts: vi.fn().mockResolvedValue({ contacts: 0, deals: 0, activities: 0, notes: 0, tasks: 0 }),
}));
vi.mock("@/lib/contacts/cascade-delete", () => ({
  getContactsRelatedCounts: vi.fn().mockResolvedValue({ activities: 0, notes: 0, tasks: 0 }),
}));
vi.mock("@/lib/deals/cascade-delete", () => ({
  getDealsRelatedCounts: vi.fn().mockResolvedValue({ activities: 0, notes: 0, tasks: 0 }),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { logAudit } from "@/lib/infra/audit-log";
import { suppressAccounts } from "@/lib/accounts/suppression";
import { cascadeSoftDeleteCompanies, getCompaniesRelatedCounts } from "@/lib/accounts/cascade-delete";
import { getContactsRelatedCounts } from "@/lib/contacts/cascade-delete";
import { getDealsRelatedCounts } from "@/lib/deals/cascade-delete";

const batchMod = await import("@/app/api/accounts/batch/route");
const accountCountsMod = await import("@/app/api/accounts/related-counts/route");
const contactCountsMod = await import("@/app/api/contacts/related-counts/route");
const dealCountsMod = await import("@/app/api/opportunities/related-counts/route");

const admin = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" as const };
const viewer = { userId: "u2", tenantId: "t1", appUserId: "u2", role: "viewer" as const };

function jsonReq(url: string, method: string, body?: unknown) {
  return new Request(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** db.select().from().where() resolves to `rows` (thenable where — no .limit). */
function mockSelectRows(rows: Array<Record<string, unknown>>) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);
}

/** db.update().set().where().returning() resolves to `rows`; captures set(). */
let lastSetPayload: Record<string, unknown> | null = null;
function mockUpdateReturning(rows: Array<{ id: string }>) {
  const returningFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
  const setFn = vi.fn().mockImplementation((payload: Record<string, unknown>) => {
    lastSetPayload = payload;
    return { where: whereFn };
  });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  lastSetPayload = null;
});

describe("DELETE /api/accounts/batch (cascade)", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await batchMod.DELETE(jsonReq("http://localhost/api/accounts/batch", "DELETE", { ids: ["co1"] }));
    expect(res.status).toBe(401);
  });

  it("403 for viewers — nothing deleted, nothing cascaded", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(viewer);
    const res = await batchMod.DELETE(jsonReq("http://localhost/api/accounts/batch", "DELETE", { ids: ["co1"], cascade: ["contacts"] }));
    expect(res.status).toBe(403);
    expect(cascadeSoftDeleteCompanies).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("400 without ids or all:true", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    const res = await batchMod.DELETE(jsonReq("http://localhost/api/accounts/batch", "DELETE", { cascade: ["contacts"] }));
    expect(res.status).toBe(400);
  });

  it("plain bulk delete (no cascade): soft-deletes + suppresses, cascaded is empty", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockSelectRows([{ id: "co1", name: "Acme", domain: "acme.ch", properties: {} }]);
    mockUpdateReturning([{ id: "co1" }]);
    const res = await batchMod.DELETE(jsonReq("http://localhost/api/accounts/batch", "DELETE", { ids: ["co1"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, deleted: 1, cascaded: {} });
    expect(cascadeSoftDeleteCompanies).not.toHaveBeenCalled();
    expect(suppressAccounts).toHaveBeenCalledTimes(1);
    // Soft-delete via a real Date payload (shared-timestamp contract).
    expect(lastSetPayload?.deletedAt).toBeInstanceOf(Date);
  });

  it("filters cascade to valid types, runs it BEFORE the company soft-delete, with ONE shared timestamp", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockSelectRows([
      { id: "co1", name: "Acme", domain: "acme.ch", properties: {} },
      { id: "co2", name: "Beta", domain: "beta.ch", properties: {} },
    ]);
    mockUpdateReturning([{ id: "co1" }, { id: "co2" }]);
    vi.mocked(cascadeSoftDeleteCompanies).mockResolvedValue({ contacts: 5, deals: 2 });

    const res = await batchMod.DELETE(
      jsonReq("http://localhost/api/accounts/batch", "DELETE", { ids: ["co1", "co2"], cascade: ["contacts", "deals", "bogus", 42] }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, deleted: 2, cascaded: { contacts: 5, deals: 2 } });

    // Filtered list + the ids resolved from the tenant-scoped select.
    expect(cascadeSoftDeleteCompanies).toHaveBeenCalledWith("t1", ["co1", "co2"], ["contacts", "deals"], expect.any(Date));
    // The SAME Date instance lands on the companies row (symmetric restore).
    const sharedAt = vi.mocked(cascadeSoftDeleteCompanies).mock.calls[0][3];
    expect(lastSetPayload?.deletedAt).toBe(sharedAt);
    // Cascade ran before the company update.
    const cascadeOrder = vi.mocked(cascadeSoftDeleteCompanies).mock.invocationCallOrder[0];
    const updateOrder = vi.mocked(db.update).mock.invocationCallOrder[0];
    expect(cascadeOrder).toBeLessThan(updateOrder);
    // Audit carries the per-type cascade counts.
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "delete",
        entityType: "company",
        metadata: expect.objectContaining({ deletedCount: 2, softDeleted: true, cascaded: { contacts: 5, deals: 2 } }),
      }),
    );
  });

  it("all:true resolves the cascade scope from the tenant's live accounts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    mockSelectRows([
      { id: "co1", name: "A", domain: null, properties: {} },
      { id: "co2", name: "B", domain: null, properties: {} },
      { id: "co3", name: "C", domain: null, properties: {} },
    ]);
    mockUpdateReturning([{ id: "co1" }, { id: "co2" }, { id: "co3" }]);
    const res = await batchMod.DELETE(jsonReq("http://localhost/api/accounts/batch", "DELETE", { all: true, cascade: ["deals"] }));
    expect(res.status).toBe(200);
    expect(cascadeSoftDeleteCompanies).toHaveBeenCalledWith("t1", ["co1", "co2", "co3"], ["deals"], expect.any(Date));
  });
});

describe.each([
  {
    name: "POST /api/accounts/related-counts",
    POST: () => accountCountsMod.POST,
    lib: () => vi.mocked(getCompaniesRelatedCounts),
    url: "http://localhost/api/accounts/related-counts",
    counts: { contacts: 3, deals: 1, activities: 7, notes: 0, tasks: 2 },
  },
  {
    name: "POST /api/contacts/related-counts",
    POST: () => contactCountsMod.POST,
    lib: () => vi.mocked(getContactsRelatedCounts),
    url: "http://localhost/api/contacts/related-counts",
    counts: { activities: 4, notes: 1, tasks: 0 },
  },
  {
    name: "POST /api/opportunities/related-counts",
    POST: () => dealCountsMod.POST,
    lib: () => vi.mocked(getDealsRelatedCounts),
    url: "http://localhost/api/opportunities/related-counts",
    counts: { activities: 2, notes: 2, tasks: 5 },
  },
])("$name", ({ POST, lib, url, counts }) => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await POST()(jsonReq(url, "POST", { ids: ["x1"] }));
    expect(res.status).toBe(401);
  });

  it("400 without a non-empty ids array", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    const res = await POST()(jsonReq(url, "POST", { ids: [] }));
    expect(res.status).toBe(400);
    expect(lib()).not.toHaveBeenCalled();
  });

  it("aggregates over the tenant-owned live subset of the selection", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    // The client sent 3 ids but only 2 are live rows of this tenant.
    mockSelectRows([{ id: "x1" }, { id: "x2" }]);
    lib().mockResolvedValue(counts as never);
    const res = await POST()(jsonReq(url, "POST", { ids: ["x1", "x2", "foreign-or-deleted"] }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ counts });
    expect(lib()).toHaveBeenCalledWith("t1", ["x1", "x2"]);
  });
});
