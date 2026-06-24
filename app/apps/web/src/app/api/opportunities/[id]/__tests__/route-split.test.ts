import { describe, it, expect, vi, beforeEach } from "vitest";

// Shared chainable mock; resolves on `.limit()`. Call 0 = deal row, call 1 =
// timeline (empty). companyId is null on the deal so the company query is skipped.
function makeChain(results: unknown[]) {
  let i = 0;
  const c: Record<string, any> = {};
  const resolve = () => { const r = results[i] ?? []; i++; return Promise.resolve(r); };
  c.from = vi.fn(() => c);
  c.where = vi.fn(() => c);
  c.orderBy = vi.fn(() => c);
  c.limit = vi.fn(() => resolve());
  c.then = (cb: any) => resolve().then(cb);
  return c;
}

vi.mock("@/db", () => ({ db: { select: vi.fn() } }));
vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({ requirePermission: vi.fn() }));
vi.mock("@/db/schema", () => ({
  deals: { id: "deals.id", tenantId: "deals.tenantId", deletedAt: "deals.deletedAt" },
  companies: { id: "companies.id", tenantId: "companies.tenantId", name: "companies.name" },
  activities: { id: "a.id", activityType: "a.t", channel: "a.c", direction: "a.d", summary: "a.s", occurredAt: "a.o", actorType: "a.at", actorId: "a.ai", entityId: "a.e", tenantId: "a.te" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), isNull: vi.fn(), desc: vi.fn() }));
vi.mock("@/lib/collision/member-names", () => ({ getTenantMemberNames: vi.fn(async () => new Map()) }));
vi.mock("@/lib/collision/actor-name", () => ({ resolveActorName: vi.fn(() => null) }));
vi.mock("@/lib/infra/audit-log", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/deals/log-deal-event", () => ({ logDealEvent: vi.fn() }));
vi.mock("@/lib/infra/api-errors", () => ({ apiError: (_c: string, m: string) => Response.json({ error: m }, { status: 404 }) }));
vi.mock("@/lib/deals/cascade-delete", () => ({ cascadeSoftDeleteDeal: vi.fn(), DEAL_CASCADE_TYPES: [], }));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const route = await import("@/app/api/opportunities/[id]/route");

const ctx = { params: Promise.resolve({ id: "d1" }) };

describe("GET /api/opportunities/[id] — deal split fields (R3)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns projectAmount and platformArr so the bookings≠ARR split can render", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    vi.mocked(db.select).mockReturnValue(makeChain([
      [{ id: "d1", name: "Deal", stage: "demo", value: 5000, projectAmount: 10000, platformArr: 2400, summary: null, expectedCloseDate: null, properties: {}, companyId: null, ownerId: null, updatedAt: null }],
      [], // timeline
    ]) as never);

    const res = await route.GET(new Request("http://localhost/api/opportunities/d1"), ctx);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.deal.projectAmount).toBe(10000);
    expect(data.deal.platformArr).toBe(2400);
    expect(data.deal.value).toBe(5000);
  });
});
