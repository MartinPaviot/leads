import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * DELETE /api/contacts/[id] — cascade wiring + the guards around it.
 *
 * Covers auth (401), permission (403), 404, the active-enrollment 409 (which
 * must block BEFORE any cascade or delete runs), the plain delete, and that the
 * `cascade` body is filtered to valid ContactCascadeType values. The contact +
 * its cascade share ONE delete timestamp so a later restore is symmetric.
 */

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/db", () => ({ db: { select: vi.fn(), update: vi.fn() } }));
vi.mock("@/db/schema", () => ({
  contacts: { id: "id", email: "email", firstName: "firstName", lastName: "lastName", linkedinUrl: "linkedinUrl", tenantId: "tenantId", deletedAt: "deletedAt" },
  activities: {},
  sequenceEnrollments: { id: "id", contactId: "contactId", status: "status" },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ _and: args })),
  eq: vi.fn(),
  sql: vi.fn(() => "sql"),
  isNull: vi.fn(() => "isNull"),
}));
vi.mock("@/lib/infra/audit-log", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/accounts/suppression", () => ({ suppressContacts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/contacts/cascade-delete", () => ({
  CONTACT_CASCADE_TYPES: ["activities", "notes", "tasks"],
  cascadeSoftDeleteContact: vi.fn().mockResolvedValue({}),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { cascadeSoftDeleteContact } from "@/lib/contacts/cascade-delete";

const mod = await import("@/app/api/contacts/[id]/route");

const admin = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" as const };
const viewer = { userId: "u2", tenantId: "t1", appUserId: "u2", role: "viewer" as const };

function makeReq(body?: unknown) {
  return new Request("http://localhost/api/contacts/ct1", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const params = () => Promise.resolve({ id: "ct1" });

/** Queue the result of each sequential db.select().from().where().limit() call. */
function queueSelects(...resultsPerCall: Array<Array<unknown>>) {
  const sel = vi.mocked(db.select);
  for (const rows of resultsPerCall) {
    const limitFn = vi.fn().mockResolvedValue(rows);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    sel.mockReturnValueOnce({ from: fromFn } as never);
  }
}

/** db.update().set().where() resolves — the contact soft-delete write. */
function mockUpdate() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
}

const contactRow = { id: "ct1", email: "x@y.com", firstName: "Jo", lastName: "Lee", linkedinUrl: null };

beforeEach(() => { vi.clearAllMocks(); mockUpdate(); });

describe("DELETE /api/contacts/[id]", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(401);
  });

  it("403 when caller is a viewer (lacks contacts:delete)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(viewer);
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(403);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("404 when the contact does not exist for this tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    queueSelects([]); // existing lookup → none
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(404);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("409 on active enrollment — blocks BEFORE any cascade or delete", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    queueSelects([contactRow], [{ id: "enr1" }]); // existing, then an active enrollment
    const res = await mod.DELETE(makeReq({ cascade: ["activities"] }), { params: params() });
    expect(res.status).toBe(409);
    expect(cascadeSoftDeleteContact).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("plain delete (no body): soft-deletes the contact, no cascade", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    queueSelects([contactRow], []); // existing, no active enrollment
    const res = await mod.DELETE(makeReq(), { params: params() });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true, id: "ct1", cascaded: {} });
    expect(cascadeSoftDeleteContact).not.toHaveBeenCalled();
    expect(db.update).toHaveBeenCalledTimes(1);
  });

  it("filters the cascade list to valid types + shares the delete timestamp", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(admin);
    queueSelects([contactRow], []);
    vi.mocked(cascadeSoftDeleteContact).mockResolvedValue({ activities: 5 });
    const res = await mod.DELETE(makeReq({ cascade: ["activities", "deals", "bogus", 7] }), { params: params() });
    expect(res.status).toBe(200);
    // "deals" is not a valid ContactCascadeType, and neither is "bogus"/7. 4th arg = shared timestamp.
    expect(cascadeSoftDeleteContact).toHaveBeenCalledWith("t1", "ct1", ["activities"], expect.any(Date));
    const data = await res.json();
    expect(data).toEqual({ success: true, id: "ct1", cascaded: { activities: 5 } });
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});
