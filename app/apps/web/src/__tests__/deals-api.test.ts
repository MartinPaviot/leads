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
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
  tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
  deals: { id: "id", tenantId: "tenantId" },
  activities: { entityId: "entity_id", tenantId: "tenantId" },
  companies: { id: "id", tenantId: "tenantId" },
}));

vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

vi.mock("@/lib/ai-provider", () => ({
  anthropic: vi.fn(() => "mock-anthropic-model"),
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: vi.fn(() => "mock-openai-model"),
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  isNull: vi.fn(),
  desc: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(() => Promise.resolve({})),
  getStageNames: vi.fn(() => "lead, qualification, demo, trial, proposal, negotiation, won, lost"),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";

const analyzeModule = await import("@/app/api/deals/analyze/route");

describe("POST /api/deals/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/deals/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealIds: ["d1000000-0000-4000-a000-000000000001"] }),
    });

    const res = await analyzeModule.POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when dealIds missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/deals/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await analyzeModule.POST(req);
    expect(res.status).toBe(400);
  });

  it("analyzes a deal successfully", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockDeal = {
      id: "d1000000-0000-4000-a000-000000000001",
      name: "Acme Partnership",
      stage: "qualification",
      value: 50000,
      companyId: null,
      properties: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock select: deal fetch (.where().limit(1)), activity count (.where() no limit)
    // where() must be thenable (for activity count) and have .limit() (for deal fetch)
    const activityCountResult = [{ count: 0 }];
    const whereFn = vi.fn().mockImplementation(() => {
      const promise = Promise.resolve(activityCountResult);
      (promise as any).limit = vi.fn().mockResolvedValue([mockDeal]);
      return promise;
    });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    // Mock update
    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    vi.mocked(generateObject).mockResolvedValue({
      object: {
        suggestedStage: "demo",
        stageReason: "Multiple interactions suggest demo readiness",
        riskLevel: "medium",
        risks: ["Limited engagement in last 2 weeks"],
        summary: "Acme Partnership is in qualification with moderate engagement.",
        nextActions: ["Schedule demo", "Send case study"],
      },
    } as never);

    const req = new Request("http://localhost/api/deals/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealIds: ["d1000000-0000-4000-a000-000000000001"] }),
    });

    const res = await analyzeModule.POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.analyzed).toBe(1);
    expect(data.results[0].riskLevel).toBe("medium");
    expect(data.results[0].suggestedStage).toBe("demo");
  });
});
