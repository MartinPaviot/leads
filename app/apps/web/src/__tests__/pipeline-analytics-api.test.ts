import { describe, it, expect, vi, beforeEach } from "vitest";

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
  },
}));

vi.mock("@/db/schema", () => ({
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
  tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
  deals: { id: "id" },
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

const analyticsModule = await import(
  "@/app/api/pipeline/analytics/route"
);

describe("GET /api/pipeline/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const res = await analyticsModule.GET();
    expect(res.status).toBe(401);
  });

  it("returns zeroes when no deals exist", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const whereFn = vi.fn().mockResolvedValue([]);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await analyticsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalDeals).toBe(0);
    expect(data.activeDeals).toBe(0);
    expect(data.winRate).toBe(0);
    expect(data.avgDealValue).toBe(0);
    expect(data.avgVelocityDays).toBe(0);
    expect(data.totalPipelineValue).toBe(0);
  });

  it("computes correct analytics for mixed deals", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);

    const mockDeals = [
      { id: "d1", stage: "lead", value: 10000, properties: { riskLevel: "low" }, createdAt: now, updatedAt: now },
      { id: "d2", stage: "qualification", value: 25000, properties: { riskLevel: "medium" }, createdAt: now, updatedAt: now },
      { id: "d3", stage: "demo", value: 50000, properties: { riskLevel: "high" }, createdAt: now, updatedAt: now },
      { id: "d4", stage: "won", value: 30000, properties: {}, createdAt: thirtyDaysAgo, updatedAt: now },
      { id: "d5", stage: "lost", value: 15000, properties: {}, createdAt: now, updatedAt: now },
    ];

    const whereFn = vi.fn().mockResolvedValue(mockDeals);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await analyticsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalDeals).toBe(5);
    expect(data.activeDeals).toBe(3);
    expect(data.totalPipelineValue).toBe(85000); // 10k + 25k + 50k
    expect(data.wonValue).toBe(30000);
    expect(data.wonCount).toBe(1);
    expect(data.lostCount).toBe(1);
    expect(data.winRate).toBe(50); // 1 won / (1 won + 1 lost) = 50%
    // avg of valued non-lost deals: (10k + 25k + 50k + 30k) / 4 = 28750
    expect(data.avgDealValue).toBe(28750);
    expect(data.avgVelocityDays).toBe(30);
    expect(data.riskSummary.high).toBe(1);
    expect(data.riskSummary.medium).toBe(1);
    expect(data.riskSummary.low).toBe(1);
    expect(data.funnel).toHaveLength(6);
    expect(data.valueByStage.lead.count).toBe(1);
    expect(data.valueByStage.lead.value).toBe(10000);
  });

  it("handles deals with no values", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockDeals = [
      { id: "d1", stage: "lead", value: null, properties: {}, createdAt: new Date(), updatedAt: new Date() },
      { id: "d2", stage: "qualification", value: 0, properties: {}, createdAt: new Date(), updatedAt: new Date() },
    ];

    const whereFn = vi.fn().mockResolvedValue(mockDeals);
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await analyticsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.avgDealValue).toBe(0);
    expect(data.totalPipelineValue).toBe(0);
  });
});
