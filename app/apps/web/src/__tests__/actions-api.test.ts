import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db/rls", () => ({
  withTenantTx: vi.fn(async (_tenantId: string, fn: (tx: unknown) => Promise<unknown>) => fn({})),
}));

const { mockGetAuthContext } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: mockGetAuthContext,
  withAuthRLS: vi.fn(async (handler: (ctx: any) => Promise<Response>) => {
    const ctx = await mockGetAuthContext();
    if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return handler(ctx);
  }),
}));

vi.mock("@/db", () => {
  const chainable = () => {
    const chain: Record<string, unknown> = {};
    const methods = ["select", "from", "leftJoin", "innerJoin", "where", "groupBy", "having", "orderBy", "limit"];
    for (const m of methods) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    // Make the chain thenable so it resolves to []
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve([]).then(resolve);
    return chain;
  };
  return {
    db: {
      select: vi.fn().mockReturnValue(chainable()),
    },
  };
});

vi.mock("@/db/schema", () => ({
  deals: { id: "id", tenantId: "tenant_id", name: "name", stage: "stage", value: "value", updatedAt: "updated_at" },
  companies: { id: "id", tenantId: "tenant_id", name: "name", domain: "domain", properties: "properties", score: "score" },
  contacts: { id: "id", tenantId: "tenant_id", companyId: "company_id", firstName: "first_name", lastName: "last_name", email: "email", title: "title", properties: "properties", score: "score" },
  activities: { id: "id", tenantId: "tenant_id", entityId: "entity_id", entityType: "entity_type", activityType: "activity_type", sentiment: "sentiment", direction: "direction", occurredAt: "occurred_at", summary: "summary", intent: "intent", metadata: "metadata" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  desc: vi.fn(),
  lt: vi.fn(),
  isNull: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";

const { GET } = await import("@/app/api/actions/route");

describe("GET /api/actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/actions");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns actions array when authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/actions");
    const res = await GET(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data).toHaveProperty("actions");
    expect(Array.isArray(data.actions)).toBe(true);
  });
});
