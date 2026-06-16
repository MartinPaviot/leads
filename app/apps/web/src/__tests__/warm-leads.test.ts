import { describe, it, expect, vi, beforeEach } from "vitest";

const { getSettingsMock, selectChainMock, clearCacheFn } = vi.hoisted(() => ({
  getSettingsMock: vi.fn(),
  selectChainMock: vi.fn(),
  clearCacheFn: { fn: null as (() => void) | null },
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (tenantId: string) => getSettingsMock(tenantId),
  buildIgnoredDomains: () => new Set(["gmail.com", "outlook.com"]),
}));

vi.mock("@/db", () => ({
  db: {
    select: () => selectChainMock(),
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
  activities: {
    id: "id",
    tenantId: "tenant_id",
    entityType: "entity_type",
    entityId: "entity_id",
    direction: "direction",
    summary: "summary",
    occurredAt: "occurred_at",
  },
  contacts: {
    id: "id",
    tenantId: "tenant_id",
    firstName: "first_name",
    lastName: "last_name",
    email: "email",
    title: "title",
    companyId: "company_id",
  },
  companies: {
    id: "id",
    name: "name",
    domain: "domain",
    industry: "industry",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  gte: (...args: unknown[]) => ({ gte: args }),
  isNotNull: (x: unknown) => ({ isNotNull: x }),
  sql: (strings: TemplateStringsArray, ...exprs: unknown[]) => ({ sql: { strings, exprs } }),
}));

const { rankWarmLeads, clearWarmLeadCacheForTest } = await import(
  "@/lib/deals/warm-leads"
);
clearCacheFn.fn = clearWarmLeadCacheForTest;

function setRows(rows: unknown[]) {
  selectChainMock.mockReturnValue({
    from: () => ({
      innerJoin: () => ({
        leftJoin: () => ({
          where: () => ({
            groupBy: () => Promise.resolve(rows),
          }),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  getSettingsMock.mockReset();
  selectChainMock.mockReset();
  clearCacheFn.fn?.();
});

describe("rankWarmLeads", () => {
  it("returns empty array for a tenant with no activities", async () => {
    getSettingsMock.mockResolvedValue({});
    setRows([]);
    const leads = await rankWarmLeads("t1");
    expect(leads).toEqual([]);
  });

  it("ranks by composite score and returns top N", async () => {
    getSettingsMock.mockResolvedValue({
      targetSeniorities: ["VP"],
      targetIndustries: ["Computer Software"],
      companyDomain: "acme.com",
    });
    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    setRows([
      {
        contactId: "c-recent-high",
        firstName: "Alice",
        lastName: "Chen",
        email: "alice@acme-target.com",
        title: "VP Engineering",
        companyId: "cmp1",
        companyName: "Acme Target",
        companyDomain: "acme-target.com",
        industry: "Computer Software",
        activityCount: 8,
        lastActivityAt: new Date(now - 3 * day),
        inboundCount: 4,
        outboundCount: 4,
        lastSummary: "Thanks for the follow-up, let's circle back next month",
      },
      {
        contactId: "c-old-icp-fit",
        firstName: "Bob",
        lastName: "Old",
        email: "bob@cold-industry.com",
        title: "Intern",
        companyId: "cmp2",
        companyName: "Cold Co",
        companyDomain: "cold-industry.com",
        industry: "Unrelated",
        activityCount: 2,
        lastActivityAt: new Date(now - 60 * day),
        inboundCount: 1,
        outboundCount: 1,
        lastSummary: "Thanks for reaching out",
      },
    ]);

    const leads = await rankWarmLeads("t1", { limit: 2 });
    expect(leads).toHaveLength(2);
    expect(leads[0].contactId).toBe("c-recent-high");
    expect(leads[0].rankScore).toBeGreaterThan(leads[1].rankScore);
  });

  it("filters out contacts in ignored domains", async () => {
    getSettingsMock.mockResolvedValue({});
    const now = Date.now();
    setRows([
      {
        contactId: "gmail-user",
        firstName: "Cold",
        lastName: "Gmail",
        email: "someone@gmail.com",
        title: null,
        companyId: null,
        companyName: null,
        companyDomain: null,
        industry: null,
        activityCount: 5,
        lastActivityAt: new Date(now - 5 * 86_400_000),
        inboundCount: 3,
        lastSummary: "hi",
      },
    ]);

    const leads = await rankWarmLeads("t1");
    expect(leads).toEqual([]);
  });

  it("filters out contacts with zero inbound activity (cold, not warm)", async () => {
    getSettingsMock.mockResolvedValue({});
    const now = Date.now();
    setRows([
      {
        contactId: "cold-outbound",
        firstName: null,
        lastName: null,
        email: "prospect@example.com",
        title: null,
        companyId: null,
        companyName: null,
        companyDomain: null,
        industry: null,
        activityCount: 5,
        lastActivityAt: new Date(now - 2 * 86_400_000),
        inboundCount: 0,
        lastSummary: null,
      },
    ]);

    const leads = await rankWarmLeads("t1");
    expect(leads).toEqual([]);
  });

  it("excludes role/automated sender addresses even when recent (noreply@)", async () => {
    getSettingsMock.mockResolvedValue({});
    const now = Date.now();
    setRows([
      {
        contactId: "vendor-noreply",
        firstName: "Stripe",
        lastName: null,
        email: "noreply@stripe.com",
        title: null,
        companyId: "cmpS",
        companyName: "Stripe",
        companyDomain: "stripe.com",
        industry: null,
        activityCount: 6,
        lastActivityAt: new Date(now - 86_400_000),
        inboundCount: 6,
        outboundCount: 0,
        lastSummary: "Your receipt from Stripe",
      },
    ]);
    const leads = await rankWarmLeads("t1");
    expect(leads).toEqual([]);
  });

  it("excludes unsolicited off-ICP inbound but keeps a two-way conversation", async () => {
    getSettingsMock.mockResolvedValue({
      targetSeniorities: ["VP"],
      targetIndustries: ["Computer Software"],
    });
    const now = Date.now();
    setRows([
      {
        // human who replied to us once (two-way) — kept despite being off-ICP
        contactId: "two-way",
        firstName: "Marc",
        lastName: "Roux",
        email: "marc@romandco.ch",
        title: "Office Manager",
        companyId: "c1",
        companyName: "Romand Co",
        companyDomain: "romandco.ch",
        industry: "Facilities",
        activityCount: 4,
        lastActivityAt: new Date(now - 2 * 86_400_000),
        inboundCount: 2,
        outboundCount: 2,
        lastSummary: "Re: votre offre",
      },
      {
        // unsolicited (no outbound), off-ICP human — excluded by the ICP floor
        contactId: "unsolicited-officp",
        firstName: "Random",
        lastName: "Person",
        email: "random@othercorp.com",
        title: "Student",
        companyId: "c2",
        companyName: "Other Corp",
        companyDomain: "othercorp.com",
        industry: "Education",
        activityCount: 1,
        lastActivityAt: new Date(now - 86_400_000),
        inboundCount: 1,
        outboundCount: 0,
        lastSummary: "Question",
      },
    ]);
    const leads = await rankWarmLeads("t1");
    expect(leads).toHaveLength(1);
    expect(leads[0].contactId).toBe("two-way");
  });

  it("keeps an unsolicited inbound that DOES fit the ICP (floor passed)", async () => {
    getSettingsMock.mockResolvedValue({
      targetSeniorities: ["VP"],
      targetIndustries: ["Computer Software"],
    });
    const now = Date.now();
    setRows([
      {
        contactId: "cold-inbound-icp",
        firstName: "Jeanne",
        lastName: "Favre",
        email: "jeanne@softwareco.ch",
        title: "VP Operations",
        companyId: "c3",
        companyName: "Software Co",
        companyDomain: "softwareco.ch",
        industry: "Computer Software",
        activityCount: 1,
        lastActivityAt: new Date(now - 86_400_000),
        inboundCount: 1,
        outboundCount: 0,
        lastSummary: "Interested in your product",
      },
    ]);
    const leads = await rankWarmLeads("t1");
    expect(leads).toHaveLength(1);
    expect(leads[0].contactId).toBe("cold-inbound-icp");
  });

  it("caches results for 5 minutes within the same tenant", async () => {
    getSettingsMock.mockResolvedValue({});
    const now = Date.now();
    setRows([
      {
        contactId: "c1",
        firstName: "A",
        lastName: "B",
        email: "a@example-corp.com",
        title: null,
        companyId: null,
        companyName: null,
        companyDomain: null,
        industry: null,
        activityCount: 3,
        lastActivityAt: new Date(now - 2 * 86_400_000),
        inboundCount: 2,
        outboundCount: 2,
        lastSummary: null,
      },
    ]);

    const first = await rankWarmLeads("t1");
    expect(first).toHaveLength(1);
    // Change the mocked rows — the cache should still win.
    setRows([]);
    const second = await rankWarmLeads("t1");
    expect(second).toHaveLength(1);
    expect(second[0].contactId).toBe("c1");
  });
});
