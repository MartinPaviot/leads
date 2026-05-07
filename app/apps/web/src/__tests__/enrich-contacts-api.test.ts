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
  contacts: { id: "id" },
  companies: { name: "name" },
}));

vi.mock("@/lib/integrations/apollo-client", () => ({
  enrichPerson: vi.fn(),
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
  embedEntity: vi.fn(() => Promise.resolve(undefined)),
  contactToText: vi.fn(() => "test text"),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/infra/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: vi.fn(),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";
import { enrichPerson } from "@/lib/integrations/apollo-client";

const { POST } = await import("@/app/api/enrich-contacts/route");

describe("POST /api/enrich-contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when contactIds missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when contactIds is empty", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("enriches a contact successfully via Apollo", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockContact = {
      id: "ct1",
      firstName: "Sarah",
      lastName: "Chen",
      email: "sarah@meridian.com",
      title: null,
      phone: null,
      linkedinUrl: null,
      companyId: null,
      properties: {},
    };

    // Mock select chain (used twice: once for contact, once for company lookup by org name)
    const limitFn = vi.fn()
      .mockResolvedValueOnce([mockContact])  // contact lookup
      .mockResolvedValueOnce([]);             // company lookup by org name (not found)
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    // Mock update chain
    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    // Mock Apollo enrichPerson response
    vi.mocked(enrichPerson).mockResolvedValue({
      id: "apollo-person-1",
      title: "CTO",
      seniority: "C-Suite",
      departments: ["Engineering"],
      linkedin_url: "https://linkedin.com/in/sarahchen",
      email_status: "verified",
      headline: "CTO at Meridian Labs",
      city: "San Francisco",
      state: "CA",
      country: "US",
      phone_numbers: [{ raw_number: "+14155551234" }],
      organization: { name: "Meridian Labs" },
    } as never);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["ct1"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.enriched).toBe(1);
    expect(data.failed).toBe(0);

    // Verify Apollo was called
    expect(enrichPerson).toHaveBeenCalled();
  });

  it("skips already enriched contacts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockContact = {
      id: "ct1",
      firstName: "Sarah",
      lastName: "Chen",
      email: "sarah@meridian.com",
      title: "CTO",
      linkedinUrl: "https://linkedin.com/in/sarahchen",
      companyId: "c1",
      properties: { enrichment_source: "apollo", seniority: "C-Suite" },
    };

    const limitFn = vi.fn().mockResolvedValue([mockContact]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["ct1"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.enriched).toBe(1);
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("counts failures for missing contacts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["nonexistent"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.failed).toBe(1);
    expect(data.enriched).toBe(0);
  });

  it("limits batch to 20 contacts", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const ids = Array.from({ length: 25 }, (_, i) => `ct${i}`);

    const mockContact = {
      id: "ct1",
      firstName: "Test",
      lastName: "User",
      title: "CTO",
      linkedinUrl: "url",
      properties: { enrichment_source: "apollo", seniority: "IC" },
    };

    const limitFn = vi.fn().mockResolvedValue([mockContact]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ids }),
    });

    await POST(req);

    expect(db.select).toHaveBeenCalledTimes(20);
  });
});
