import { describe, it, expect, vi, beforeEach } from "vitest";

// Universal chainable db mock: every builder method returns the same chain,
// and the chain is thenable, resolving to [] — so any query shape completes
// with an empty result (enrichment is then skipped on the empty path).
function makeChain() {
  const c: Record<string, any> = {};
  for (const m of ["from", "where", "orderBy", "limit", "offset", "groupBy", "having", "leftJoin", "innerJoin"]) {
    c[m] = vi.fn(() => c);
  }
  c.then = (res: (v: unknown) => unknown) => res([]);
  return c;
}

vi.mock("@/db", () => ({
  db: { select: vi.fn(() => makeChain()), selectDistinct: vi.fn(() => makeChain()) },
}));

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));

vi.mock("@/db/schema", () => ({
  contacts: { id: "contacts.id", tenantId: "contacts.tenantId", companyId: "contacts.companyId", deletedAt: "contacts.deletedAt", firstName: "f", lastName: "l", email: "e", title: "t", properties: "p", score: "s", linkedinUrl: "li", phone: "ph" },
  companies: { id: "companies.id", tenantId: "companies.tenantId", industry: "companies.industry", deletedAt: "companies.deletedAt", name: "companies.name" },
  activities: { id: "a.id", entityId: "a.entityId", entityType: "a.entityType", tenantId: "a.tenantId", occurredAt: "a.occurredAt" },
}));

vi.mock("drizzle-orm", () => {
  const sql = Object.assign((..._a: unknown[]) => ({ _sql: true }), { join: () => ({}), raw: () => ({}) });
  return {
    and: vi.fn((...a: unknown[]) => ({ _and: a })),
    eq: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
    sql,
    isNull: vi.fn(() => ({ _isNull: true })),
    isNotNull: vi.fn(() => ({ _isNotNull: true })),
  };
});

// Heavy collaborators — only used on the search/filter/POST paths, mocked so the
// module imports resolve.
vi.mock("@/lib/search/industry-match", () => ({ matchIndustries: vi.fn(async () => []) }));
vi.mock("@/inngest/client", () => ({ inngest: { send: vi.fn() } }));
vi.mock("@/lib/ai/embeddings", () => ({ embedEntity: vi.fn(), contactToText: vi.fn() }));
vi.mock("@/lib/util/email", () => ({ extractDomain: vi.fn(() => null) }));
vi.mock("@/lib/billing/plan-limits", () => ({ checkPlanLimit: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/infra/api-errors", () => ({ apiError: (_c: string, m: string) => Response.json({ error: m }, { status: 400 }) }));
vi.mock("@/lib/contacts/phone-region", () => ({ phoneRegionKeySql: () => ({}) }));
vi.mock("@/lib/contacts/recency", () => ({ recencyBucketSql: () => ({}) }));
vi.mock("@/lib/search/industry-family", () => ({ classifyIndustryFamilies: vi.fn(async () => ({})), familiesToIndustries: vi.fn(() => []) }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { eq } from "drizzle-orm";

const route = await import("@/app/api/contacts/route");

describe("GET /api/contacts — companyId filter (R2)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("filters by contacts.companyId when ?companyId is provided", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    const res = await route.GET(new Request("http://localhost/api/contacts?companyId=comp-123"));
    expect(res.status).toBe(200);
    // The account-scoped filter must reach the where clause.
    expect(vi.mocked(eq)).toHaveBeenCalledWith("contacts.companyId", "comp-123");
  });

  it("does NOT add a companyId filter when the param is absent", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    const res = await route.GET(new Request("http://localhost/api/contacts"));
    expect(res.status).toBe(200);
    const calledWithCompanyId = vi.mocked(eq).mock.calls.some((c) => c[0] === "contacts.companyId");
    expect(calledWithCompanyId).toBe(false);
  });
});
