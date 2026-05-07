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
  distillationSamples: { id: "id", tenantId: "tenant_id", agentId: "agent_id", input: "input", output: "output", score: "score", createdAt: "created_at" },
  actionOutcomes: { id: "id", tenantId: "tenant_id", actionId: "action_id", outcome: "outcome", createdAt: "created_at" },
  signalOutcomes: { id: "id", tenantId: "tenant_id", signalId: "signal_id", outcome: "outcome", createdAt: "created_at" },
  agentTraces: { id: "id", tenantId: "tenant_id", agentId: "agent_id", agentCategory: "agent_category", traceId: "trace_id", input: "input", output: "output", model: "model", status: "status", inputTokens: "input_tokens", outputTokens: "output_tokens", estimatedCost: "estimated_cost", latencyMs: "latency_ms", toolCalls: "tool_calls", toolCallsCount: "tool_calls_count", errorMessage: "error_message", evalScore: "eval_score", metadata: "metadata", createdAt: "created_at" },
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
  tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
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
  embedEntity: vi.fn(),
  companyToText: vi.fn(() => "test text"),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/infra/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

// Set env before import
process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";
import { embedEntity } from "@/lib/ai/embeddings";

// Dynamic import to get the route handler
const { POST } = await import("@/app/api/enrich/route");

describe("POST /api/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyIds missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyIds is empty array", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("enriches a company successfully via Apollo", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockCompany = {
      id: "c1",
      name: "Stripe",
      domain: "stripe.com",
      industry: null,
      description: null,
      size: null,
      revenue: null,
      properties: {},
    };

    // Mock select chain
    const limitFn = vi.fn().mockResolvedValue([mockCompany]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    // Mock update chain
    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    // Mock waterfall enrichment result
    mockEnrichCompany.mockResolvedValue({
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
      provenance: [
        { provider: "apollo", field: "industry", atIso: new Date().toISOString() },
      ],
      attempts: [
        { ok: true, data: {}, provider: "apollo", durationMs: 100, costCents: 1, error: undefined },
      ],
      totalCostCents: 1,
      enriched: true,
    });

    vi.mocked(embedEntity).mockResolvedValue(undefined);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["c1"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.enriched).toBe(1);
    expect(data.failed).toBe(0);

    // Verify waterfall was called
    expect(mockEnrichCompany).toHaveBeenCalledWith(
      { domain: "stripe.com", name: "Stripe" },
      { tenantId: "t1" },
    );
  });

  it("skips already enriched companies", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockCompany = {
      id: "c1",
      name: "Stripe",
      domain: "stripe.com",
      industry: "Fintech",
      description: "Already enriched",
      size: "1000+",
      revenue: "$100M+",
      properties: { enrichment_source: "apollo" },
    };

    const limitFn = vi.fn().mockResolvedValue([mockCompany]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["c1"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.enriched).toBe(1);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("limits batch to 20 companies", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const ids = Array.from({ length: 25 }, (_, i) => `c${i}`);

    const mockCompany = {
      id: "c1",
      name: "Test",
      domain: null,
      industry: "Tech",
      description: "Already enriched",
    };

    const limitFn = vi.fn().mockResolvedValue([mockCompany]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ids }),
    });

    await POST(req);

    // Should only process 20 companies
    expect(limitFn).toHaveBeenCalledTimes(20);
  });

  it("counts failures for missing companies", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["nonexistent"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.failed).toBe(1);
    expect(data.enriched).toBe(0);
  });
});
