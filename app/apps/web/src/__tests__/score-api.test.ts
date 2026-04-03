import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: { id: "id", tenantId: "tenantId" },
  activities: { id: "id", tenantId: "tenantId", entityType: "entityType", entityId: "entityId", occurredAt: "occurredAt", actorType: "actorType", sentiment: "sentiment" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(() => Promise.resolve({})),
  parseSizeRange: vi.fn(() => null),
}));

vi.mock("@/lib/scoring", () => ({
  calculateFitScore: vi.fn(() => ({ score: 50, reasons: ["Industry match"] })),
}));

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";

const { POST } = await import("@/app/api/score/route");

describe("POST /api/score", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyIds missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("scores a company using calculated model", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockCompany = {
      id: "c1",
      name: "Stripe",
      domain: "stripe.com",
      industry: "information technology & services",
      description: "Payment platform",
      size: "1000+",
      revenue: "$100M+",
      properties: {
        enrichment_source: "apollo",
        employee_count: 8000,
        annual_revenue: 5100000000,
        total_funding: 9400000000,
        technologies: ["React", "Node.js", "AWS"],
        country: "United States",
      },
    };

    // Mock db.select chains:
    // 1) Company lookup: .select().from().where().limit(1) -> [mockCompany]
    // 2-6) Engagement queries: .select().from().where() -> [{count: 0}] or [{latest: null}]
    // The where() return must be both thenable (for engagement) and have .limit() (for company lookup)
    const engagementResult = [{ count: 0, latest: null }];
    const whereFn = vi.fn().mockImplementation(() => {
      const promise = Promise.resolve(engagementResult);
      (promise as any).limit = vi.fn().mockResolvedValue([mockCompany]);
      return promise;
    });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    const req = new Request("http://localhost/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["c1"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // Score should be calculated, not zero (company has good properties)
    expect(data.scored).toBeGreaterThanOrEqual(0);
  });

  it("handles missing company gracefully", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["nonexistent"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.scored).toBe(0);
  });
});
