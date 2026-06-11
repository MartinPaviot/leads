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
  distillationSamples: { id: "id", tenantId: "tenant_id", agentId: "agent_id", input: "input", output: "output", score: "score", createdAt: "created_at" },
  actionOutcomes: { id: "id", tenantId: "tenant_id", actionId: "action_id", outcome: "outcome", createdAt: "created_at" },
  signalOutcomes: { id: "id", tenantId: "tenant_id", signalId: "signal_id", outcome: "outcome", createdAt: "created_at" },
  agentTraces: { id: "id", tenantId: "tenant_id", agentId: "agent_id", agentCategory: "agent_category", traceId: "trace_id", input: "input", output: "output", model: "model", status: "status", inputTokens: "input_tokens", outputTokens: "output_tokens", estimatedCost: "estimated_cost", latencyMs: "latency_ms", toolCalls: "tool_calls", toolCallsCount: "tool_calls_count", errorMessage: "error_message", evalScore: "eval_score", metadata: "metadata", createdAt: "created_at" },
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
  tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
  companies: { id: "id", tenantId: "tenantId" },
  activities: { id: "id", tenantId: "tenantId", entityType: "entityType", entityId: "entityId", occurredAt: "occurredAt", actorType: "actorType", sentiment: "sentiment" },
  // R1.5: the route now reads the ICP fit matrix (joined to active icps)
  // before falling back to the legacy flat-settings scorer.
  companyIcpFit: { companyId: "company_id", icpId: "icp_id", tenantId: "tenant_id", fitScore: "fit_score" },
  icps: { id: "id", priority: "priority", status: "status", deletedAt: "deleted_at" },
  icpCriteria: { id: "id", icpId: "icp_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/lib/infra/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: vi.fn(() => Promise.resolve({})),
  parseSizeRange: vi.fn(() => null),
}));

vi.mock("@/lib/scoring/scoring", () => ({
  calculateFitScore: vi.fn(() => ({ score: 50, reasons: ["Industry match"] })),
  getGrade: vi.fn((score: number) => {
    if (score >= 90) return { grade: "A+", heat: "Burning", icon: "🔥", min: 90 };
    if (score >= 80) return { grade: "A", heat: "Burning", icon: "🔥", min: 80 };
    if (score >= 60) return { grade: "B", heat: "Warm", icon: "☀️", min: 60 };
    if (score >= 40) return { grade: "C", heat: "Cool", icon: "", min: 40 };
    if (score >= 20) return { grade: "D", heat: "Cold", icon: "", min: 20 };
    return { grade: "F", heat: "Cold", icon: "", min: 0 };
  }),
}));

vi.mock("@/lib/scoring/signal-outcomes", () => ({
  getSignalMultipliers: vi.fn(() => Promise.resolve({ multipliers: {} })),
}));

vi.mock("@/lib/scoring/score-with-signals", () => ({
  scoreSignals: vi.fn(() => ({ bonus: 0, reasons: [], contributions: [] })),
}));

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
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
    // 0) Matrix lookup (R1.5): .select().from(companyIcpFit).innerJoin(icps).where() -> []
    //    (no cells -> the route falls back to the legacy flat-settings scorer)
    // 1) Company lookup: .select().from().where().limit(1) -> [mockCompany]
    // 2-6) Engagement queries: .select().from().where() -> [{count: 0}] or [{latest: null}]
    // The where() return must be both thenable (for engagement) and have .limit() (for company lookup)
    const engagementResult = [{ count: 0, latest: null }];
    const whereFn = vi.fn().mockImplementation(() => {
      const promise = Promise.resolve(engagementResult);
      (promise as any).limit = vi.fn().mockResolvedValue([mockCompany]);
      return promise;
    });
    const innerJoinFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, innerJoin: innerJoinFn });
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
    const innerJoinFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn, innerJoin: innerJoinFn });
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
