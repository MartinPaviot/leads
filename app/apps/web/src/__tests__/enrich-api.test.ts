import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: { id: "id" },
}));

const mockEnrichCompany = vi.fn();

vi.mock("@/lib/providers/company-enrichment", () => ({
  enrichCompany: (...args: unknown[]) => mockEnrichCompany(...args),
}));

vi.mock("@/lib/integrations/apollo-client", () => ({
  enrichOrganization: vi.fn(),
  employeeCountToRange: vi.fn((n: number | null) => n != null && n > 1000 ? "1000+" : "51-200"),
  revenueToRange: vi.fn(() => "$100M+"),
  isApolloAvailable: vi.fn(() => true),
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai/ai-provider", () => ({
  anthropic: vi.fn(() => "mock-anthropic-model"),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-openai-model"),
}));

vi.mock("@/lib/ai/embeddings", () => ({
  // embedEntity is async in prod — return a promise so the route's
  // `.catch(...)` is valid regardless of whether OPENAI_API_KEY is set.
  embedEntity: vi.fn(() => Promise.resolve()),
  companyToText: vi.fn(() => "test text"),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock("@/lib/infra/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

// Set env before import
process.env.ANTHROPIC_API_KEY = "test-key";

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

// Dynamic import to get the route handler
const { POST } = await import("@/app/api/enrich/route");

const AUTH = { userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as const;

/** Wire db.select() -> from -> where -> limit to resolve `rows`. */
function mockSelect(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);
  return { limitFn };
}

/** Wire db.update() -> set -> where, capturing the set() payload. */
function mockUpdate() {
  const updateWhereFn = vi.fn().mockResolvedValue([]);
  const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
  vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);
  return { updateSetFn };
}

const FULL_WATERFALL = {
  data: {
    domain: "stripe.com",
    name: "Stripe",
    industry: "Fintech",
    description: "Online payment processing platform",
    employeeCount: 8000,
    sizeRange: "1000+",
    annualRevenue: 1000000000,
    revenueRange: "$1B+",
    foundedYear: 2010,
    city: "San Francisco",
    state: "CA",
    country: "US",
    technologies: ["React", "Ruby"],
    keywords: ["fintech", "payments"],
    fundingStage: "Series I",
    totalFunding: 2200000000,
    linkedinUrl: "https://linkedin.com/company/stripe",
    logoUrl: null,
    investors: [],
    raw: null,
  },
  provenance: [{ provider: "apollo", field: "industry", atIso: new Date().toISOString() }],
  attempts: [{ ok: true, data: {}, provider: "apollo", durationMs: 100, costCents: 1, error: undefined }],
  totalCostCents: 1,
  enriched: true,
};

const EMPTY_WATERFALL = {
  data: {
    domain: null, name: null, industry: null, description: null, employeeCount: null,
    sizeRange: null, annualRevenue: null, revenueRange: null, foundedYear: null,
    city: null, state: null, country: null, technologies: [], keywords: [],
    fundingStage: null, totalFunding: null, linkedinUrl: null, logoUrl: null,
    investors: [], raw: null,
  },
  provenance: [],
  attempts: [{ ok: false, data: null, provider: "apollo", durationMs: 50, costCents: 0, error: "no organization found" }],
  totalCostCents: 0,
  enriched: false,
};

describe("POST /api/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["1"] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyIds missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyIds is empty array", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: [] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("enriches a fresh company and reports per-criterion outcomes", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    mockSelect([{ id: "c1", name: "Stripe", domain: "stripe.com", industry: null, description: null, size: null, revenue: null, properties: {} }]);
    mockUpdate();
    mockEnrichCompany.mockResolvedValue(FULL_WATERFALL);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["c1"] }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.enriched).toBe(1);
    expect(data.failed).toBe(0);
    expect(mockEnrichCompany).toHaveBeenCalledWith({ domain: "stripe.com", name: "Stripe" }, { tenantId: "t1" });

    // Honest per-company + per-criterion detail.
    expect(data.perCompany[0].status).toBe("enriched");
    const byKey = Object.fromEntries(data.perCompany[0].criteria.map((c: { key: string; outcome: string }) => [c.key, c.outcome]));
    expect(byKey.industry).toBe("filled");
    expect(byKey.revenue).toBe("filled");
    // Default request is the base set only — extras aren't touched.
    expect(byKey.funding).toBeUndefined();
    expect(data.criteria).toEqual(["industry", "description", "geography", "size", "revenue", "linkedin"]);
  });

  it("skips the provider when every requested base criterion is already present", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    mockSelect([{
      id: "c1", name: "Stripe", domain: "stripe.com",
      industry: "Fintech", description: "Payments", size: "1000+", revenue: "$100M+",
      properties: { enrichment_source: "apollo", country: "US", linkedin_url: "https://linkedin.com/company/stripe" },
    }]);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["c1"] }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(mockEnrichCompany).not.toHaveBeenCalled();
    expect(data.alreadyComplete).toBe(1);
    expect(data.enriched).toBe(0);
    expect(data.perCompany[0].status).toBe("already-complete");
  });

  it("persists only the requested criterion's fields", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    mockSelect([{ id: "c1", name: "Stripe", domain: "stripe.com", industry: null, description: null, size: null, revenue: null, properties: {} }]);
    const { updateSetFn } = mockUpdate();
    mockEnrichCompany.mockResolvedValue(FULL_WATERFALL);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["c1"], criteria: ["revenue"] }),
    });
    const res = await POST(req);
    const data = await res.json();

    const setArg = updateSetFn.mock.calls[0][0] as Record<string, unknown>;
    // Revenue (the requested criterion) is written...
    expect(setArg.revenue).toBe("$1B+");
    // ...but industry / description (out of scope) keep their existing null.
    expect(setArg.industry).toBeNull();
    expect(setArg.description).toBeNull();
    expect(data.perCompany[0].criteria.map((c: { key: string }) => c.key)).toEqual(["revenue"]);
    expect(data.perCompany[0].status).toBe("enriched");
  });

  it("reports no-data honestly when the waterfall finds nothing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    mockSelect([{ id: "c1", name: "Obscure GmbH", domain: null, industry: null, description: null, size: null, revenue: null, properties: {} }]);
    mockUpdate();
    mockEnrichCompany.mockResolvedValue(EMPTY_WATERFALL);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["c1"] }),
    });
    const res = await POST(req);
    const data = await res.json();

    expect(data.enriched).toBe(0);
    expect(data.failed).toBe(0);
    expect(data.noData).toBe(1);
    expect(data.perCompany[0].status).toBe("no-data");
    expect(data.perCompany[0].criteria.every((c: { outcome: string }) => c.outcome === "not-found")).toBe(true);
  });

  it("limits batch to 20 companies", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    const ids = Array.from({ length: 25 }, (_, i) => `c${i}`);
    const { limitFn } = mockSelect([{ id: "c1", name: "Test", domain: null, industry: "Tech", description: "x", size: null, revenue: null, properties: {} }]);
    mockUpdate();
    mockEnrichCompany.mockResolvedValue(EMPTY_WATERFALL);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ids }),
    });
    await POST(req);
    expect(limitFn).toHaveBeenCalledTimes(20);
  });

  it("counts failures for missing companies", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(AUTH);
    mockSelect([]);
    const req = new Request("http://localhost/api/enrich", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["nonexistent"] }),
    });
    const res = await POST(req);
    const data = await res.json();
    expect(data.failed).toBe(1);
    expect(data.enriched).toBe(0);
    expect(data.perCompany[0].status).toBe("error");
  });
});
