import { describe, it, expect, vi, beforeEach } from "vitest";

let authCtx: { tenantId: string; userId: string } | null = { tenantId: "t1", userId: "u1" };
let selectResult: Array<{ id: string; properties: unknown }> = [];
const updateSet = vi.fn();
const updateWhere = vi.fn(async () => undefined);

vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => selectResult }) }) }),
    update: () => ({
      set: (v: unknown) => {
        updateSet(v);
        return { where: updateWhere };
      },
    }),
  },
}));
vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: async () => authCtx }));
vi.mock("@/db/schema", () => ({
  contacts: { id: "id", tenantId: "tenant_id", properties: "properties", deletedAt: "deleted_at" },
}));
vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  isNull: (...a: unknown[]) => a,
}));

const { POST } = await import("@/app/api/contacts/[id]/lead-feedback/route");

function req(body: unknown) {
  return new Request("http://x/api/contacts/ct-1/lead-feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "ct-1" }) };

beforeEach(() => {
  authCtx = { tenantId: "t1", userId: "u1" };
  selectResult = [];
  updateSet.mockClear();
  updateWhere.mockClear();
});

describe("POST /api/contacts/[id]/lead-feedback", () => {
  it("401 without auth", async () => {
    authCtx = null;
    const res = await POST(req({ isLead: false }), ctx);
    expect(res.status).toBe(401);
  });

  it("400 when isLead is missing / non-boolean", async () => {
    const res = await POST(req({ reason: "x" }), ctx);
    expect(res.status).toBe(400);
    expect(updateSet).not.toHaveBeenCalled();
  });

  it("404 when the contact is not found (or other tenant)", async () => {
    selectResult = [];
    const res = await POST(req({ isLead: false }), ctx);
    expect(res.status).toBe(404);
  });

  it("writes leadFeedback (preserving existing props) and returns ok", async () => {
    selectResult = [{ id: "ct-1", properties: { existing: 1 } }];
    const res = await POST(req({ isLead: false, reason: "vendor we pay" }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, isLead: false });

    const arg = updateSet.mock.calls[0][0] as { properties: Record<string, any> };
    expect(arg.properties.existing).toBe(1);
    expect(arg.properties.leadFeedback.isLead).toBe(false);
    expect(arg.properties.leadFeedback.reason).toBe("vendor we pay");
    expect(typeof arg.properties.leadFeedback.at).toBe("string");
    expect(updateWhere).toHaveBeenCalled();
  });

  it("accepts isLead:true (re-confirm) and stores it", async () => {
    selectResult = [{ id: "ct-1", properties: null }];
    const res = await POST(req({ isLead: true }), ctx);
    expect(res.status).toBe(200);
    const arg = updateSet.mock.calls[0][0] as { properties: Record<string, any> };
    expect(arg.properties.leadFeedback.isLead).toBe(true);
  });
});
