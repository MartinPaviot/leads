import { describe, it, expect, vi, beforeEach } from "vitest";

// Thenable chain: resolves on .limit()/.groupBy() or when awaited at .where().
// The route runs three queries in order: subscriptions(.limit), usageEvents
// (.groupBy), connectedMailboxes(await at .where).
function makeChain(results: unknown[]) {
  let i = 0;
  const c: Record<string, any> = {};
  const resolve = () => { const r = results[i] ?? []; i++; return Promise.resolve(r); };
  c.from = () => c;
  c.where = () => c;
  c.limit = () => resolve();
  c.groupBy = () => resolve();
  c.then = (cb: any) => resolve().then(cb);
  return c;
}

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  // The route was admin-gated after this test was written (requireAdmin added to
  // /api/billing/usage). Mirror the real impl: null for admins, 403 otherwise.
  requireAdmin: (ctx: { role?: string } | null) =>
    ctx?.role === "admin" ? null : Response.json({ error: "Admin access required" }, { status: 403 }),
}));
vi.mock("@/db/billing-schema", () => ({ subscriptions: { tenantId: "s.tenantId" }, usageEvents: { tenantId: "u.tenantId", eventType: "u.type", count: "u.count", createdAt: "u.createdAt" } }));
vi.mock("@/db/schema", () => ({ connectedMailboxes: { tenantId: "cm.tenantId" } }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), gte: vi.fn(), sql: Object.assign(() => ({}), { raw: () => ({}) }) }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const route = await import("@/app/api/billing/usage/route");

describe("GET /api/billing/usage — real mailbox count (R8)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the tenant's connected-mailbox count instead of a hardcoded 0", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    vi.mocked(db.select).mockReturnValue(makeChain([
      [{}], // subscriptions (no period -> fallback)
      [], // usageEvents
      [{ c: 3 }], // connectedMailboxes count
    ]) as never);

    const res = await route.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.mailboxCount).toBe(3);
  });
});
