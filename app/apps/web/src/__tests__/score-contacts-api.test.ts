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
  contacts: { id: "id", tenantId: "tenantId" },
  companies: { id: "id", tenantId: "tenantId" },
  activities: { id: "id", tenantId: "tenantId", entityType: "entityType", entityId: "entityId", occurredAt: "occurredAt" },
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
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(() => Promise.resolve({})),
  parseRoleKeywords: vi.fn(() => []),
}));

vi.mock("@/lib/scoring", () => ({
  calculateContactFitScore: vi.fn(() => ({ score: 40, grade: "C", reasons: ["Default score"] })),
  getGrade: vi.fn((score: number) => {
    if (score >= 90) return { grade: "A+", heat: "Burning", icon: "🔥", min: 90 };
    if (score >= 80) return { grade: "A", heat: "Burning", icon: "🔥", min: 80 };
    if (score >= 60) return { grade: "B", heat: "Warm", icon: "☀️", min: 60 };
    if (score >= 40) return { grade: "C", heat: "Cool", icon: "", min: 40 };
    if (score >= 20) return { grade: "D", heat: "Cold", icon: "", min: 20 };
    return { grade: "F", heat: "Cold", icon: "", min: 0 };
  }),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";

const { POST } = await import("@/app/api/score-contacts/route");

describe("POST /api/score-contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when contactIds missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("scores a contact successfully", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockContact = {
      id: "ct1",
      firstName: "Sarah",
      lastName: "Chen",
      email: "sarah@meridian.com",
      title: "CTO",
      companyId: null,
      properties: { seniority: "C-Suite", department: "Engineering" },
    };

    // Route does: 1) contact lookup with .where().limit(), 2) activity count with .where() (no limit)
    // where() must return thenable (for activity count) AND have .limit() (for contact lookup)
    const activityCountResult = [{ count: 0 }];
    const whereFn = vi.fn().mockImplementation(() => {
      const promise = Promise.resolve(activityCountResult);
      (promise as any).limit = vi.fn().mockResolvedValue([mockContact]);
      return promise;
    });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["ct1"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.scored).toBe(1);
  });

  it("handles missing contacts gracefully", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const limitFn = vi.fn().mockResolvedValue([]); // empty = not found
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["nonexistent"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.scored).toBe(0);
  });
});
