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

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  deals: { id: "id" },
  contacts: { id: "id" },
  companies: { id: "id" },
  activities: { id: "id" },
  sequences: { id: "id" },
  sequenceEnrollments: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
}));

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const insightsModule = await import("@/app/api/insights/route");

describe("GET /api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const res = await insightsModule.GET();
    expect(res.status).toBe(401);
  });

  it("returns empty insights when no data", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const whereFn = vi.fn().mockResolvedValue([]);
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // deals (has .where)
      .mockReturnValueOnce({ where: whereFn })   // contacts (has .where)
      .mockReturnValueOnce({ where: whereFn })   // companies (has .where)
      .mockResolvedValueOnce([]);                 // sequenceEnrollments (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights).toEqual([]);
  });

  it("detects stalling deals", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const oldDate = new Date(Date.now() - 20 * 86400000); // 20 days ago
    const mockDeals = [
      { id: "d1", name: "Stale Deal", stage: "qualification", value: 10000, properties: {}, createdAt: oldDate, updatedAt: oldDate },
      { id: "d2", name: "Another Stale", stage: "demo", value: 20000, properties: {}, createdAt: oldDate, updatedAt: oldDate },
    ];

    const whereFn = vi.fn()
      .mockResolvedValueOnce(mockDeals)  // deals
      .mockResolvedValueOnce([])         // contacts
      .mockResolvedValueOnce([]);        // companies
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // deals (has .where)
      .mockReturnValueOnce({ where: whereFn })   // contacts (has .where)
      .mockReturnValueOnce({ where: whereFn })   // companies (has .where)
      .mockResolvedValueOnce([]);                 // sequenceEnrollments (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    const stallingInsight = data.insights.find((i: { title: string }) => i.title.includes("stalling"));
    expect(stallingInsight).toBeDefined();
    expect(stallingInsight.category).toBe("alert");
  });

  it("detects high-risk deals", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const now = new Date();
    const mockDeals = [
      { id: "d1", name: "Risky Deal", stage: "proposal", value: 50000, properties: { riskLevel: "high" }, createdAt: now, updatedAt: now },
    ];

    const whereFn = vi.fn()
      .mockResolvedValueOnce(mockDeals)  // deals
      .mockResolvedValueOnce([])         // contacts
      .mockResolvedValueOnce([]);        // companies
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // deals (has .where)
      .mockReturnValueOnce({ where: whereFn })   // contacts (has .where)
      .mockReturnValueOnce({ where: whereFn })   // companies (has .where)
      .mockResolvedValueOnce([]);                 // sequenceEnrollments (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    const riskInsight = data.insights.find((i: { title: string }) => i.title.includes("high-risk"));
    expect(riskInsight).toBeDefined();
    expect(riskInsight.severity).toBe("high");
  });

  it("detects win rate trend", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const now = new Date();
    const mockDeals = [
      { id: "d1", name: "Won 1", stage: "won", value: 10000, properties: {}, createdAt: now, updatedAt: now },
      { id: "d2", name: "Won 2", stage: "won", value: 20000, properties: {}, createdAt: now, updatedAt: now },
      { id: "d3", name: "Lost 1", stage: "lost", value: 5000, properties: {}, createdAt: now, updatedAt: now },
    ];

    const whereFn = vi.fn()
      .mockResolvedValueOnce(mockDeals)  // deals
      .mockResolvedValueOnce([])         // contacts
      .mockResolvedValueOnce([]);        // companies
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // deals (has .where)
      .mockReturnValueOnce({ where: whereFn })   // contacts (has .where)
      .mockReturnValueOnce({ where: whereFn })   // companies (has .where)
      .mockResolvedValueOnce([]);                 // sequenceEnrollments (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    const winRateInsight = data.insights.find((i: { title: string }) => i.title.includes("Win rate"));
    expect(winRateInsight).toBeDefined();
    expect(winRateInsight.title).toContain("67%");
    expect(winRateInsight.category).toBe("trend");
  });
});
