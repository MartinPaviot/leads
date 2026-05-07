/**
 * Integration tests for draftProposal skill — verifies that Knowledge entries
 * retrieved via getSkillKnowledge flow through to the LLM prompt.
 *
 * Strategy: mock DB, knowledge retrieval, and LLM, then assert the prompt
 * passed to tracedGenerateObject contains Knowledge-sourced content.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──────────────────────────────────────────────────

const {
  dbMock,
  tracedGenerateObjectMock,
  retrieveKnowledgeMock,
  searchSimilarMock,
  getTenantSettingsMock,
} = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
  tracedGenerateObjectMock: vi.fn(),
  retrieveKnowledgeMock: vi.fn(),
  searchSimilarMock: vi.fn(),
  getTenantSettingsMock: vi.fn(),
}));

vi.mock("@/db", () => ({ db: dbMock }));

vi.mock("@/db/schema", () => ({
  deals: {
    id: "id",
    tenantId: "tenant_id",
    name: "name",
    stage: "stage",
    value: "value",
    contactId: "contact_id",
    companyId: "company_id",
    properties: "properties",
    createdAt: "created_at",
    updatedAt: "updated_at",
  },
  companies: {
    id: "id",
    name: "name",
    industry: "industry",
    size: "size",
    revenue: "revenue",
    description: "description",
    properties: "properties",
    tenantId: "tenant_id",
  },
  contacts: {
    id: "id",
    firstName: "first_name",
    lastName: "last_name",
    title: "title",
    email: "email",
    companyId: "company_id",
    tenantId: "tenant_id",
  },
  activities: {
    id: "id",
    tenantId: "tenant_id",
    entityId: "entity_id",
    entityType: "entity_type",
    activityType: "activity_type",
    direction: "direction",
    summary: "summary",
    occurredAt: "occurred_at",
    rawContent: "raw_content",
  },
  notes: {
    id: "id",
    tenantId: "tenant_id",
    entityId: "entity_id",
    entityType: "entity_type",
    title: "title",
    content: "content",
    createdAt: "created_at",
  },
  knowledgeEntries: {
    id: "id",
    tenantId: "tenant_id",
    title: "title",
    category: "category",
    content: "content",
    scope: "scope",
    isActive: "is_active",
    createdBy: "created_by",
    updatedAt: "updated_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (...args: unknown[]) => ({ eq: args }),
  desc: (x: unknown) => ({ desc: x }),
  or: (...args: unknown[]) => ({ or: args }),
  ilike: (...args: unknown[]) => ({ ilike: args }),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...exprs: unknown[]) => ({
      sql: { strings, exprs },
    }),
    { join: (...a: unknown[]) => a },
  ),
}));

// Mock retrieveKnowledge but re-implement the real formatKnowledgeForPrompt
// inline, since the module factory cannot use await import.
vi.mock("@/lib/knowledge/retrieval", () => ({
  retrieveKnowledge: (...args: unknown[]) => retrieveKnowledgeMock(...args),
  formatKnowledgeForPrompt: (
    entries: Array<{
      title: string;
      category: string;
      content: string;
    }>,
  ): string => {
    if (entries.length === 0) return "";
    const sections = entries.map(
      (e) => `### ${e.title} (${e.category})\n${e.content}`,
    );
    return `## Business Knowledge\n\nThe following is knowledge that the user has defined about their business. Use it to ground your responses.\n\n${sections.join("\n\n---\n\n")}`;
  },
}));

vi.mock("@/lib/ai/traced-ai", () => ({
  tracedGenerateObject: (...args: unknown[]) =>
    tracedGenerateObjectMock(...args),
}));

vi.mock("@/lib/ai/ai-provider", () => ({
  anthropic: (model: string) => `mock-anthropic-${model}`,
}));

vi.mock("@ai-sdk/openai", () => ({
  openai: (model: string) => `mock-openai-${model}`,
}));

vi.mock("@/lib/ai/embeddings", () => ({
  embedText: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  searchSimilar: (...args: unknown[]) => searchSimilarMock(...args),
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (...args: unknown[]) => getTenantSettingsMock(...args),
}));

vi.mock("@/lib/observability/logger", () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// Dynamic import after all mocks are registered
const { draftProposalHandler } = await import(
  "@/skills/intelligence/draft-proposal/handler"
);

// ── Helpers ────────────────────────────────────────────────────────

function chainOf(rows: unknown[]): unknown {
  const self: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "limit",
    "orderBy",
    "groupBy",
    "innerJoin",
    "leftJoin",
  ];
  for (const m of methods) {
    self[m] = () => self;
  }
  self.then = (
    resolve: (v: unknown) => void,
    reject: (e: unknown) => void,
  ) => Promise.resolve(rows).then(resolve, reject);
  return self;
}

const FAKE_DEAL = {
  id: "d1",
  name: "Acme Enterprise Deal",
  stage: "proposal",
  value: 75000,
  contactId: "c1",
  companyId: "co1",
  tenantId: "t1",
  properties: {},
  createdAt: new Date("2026-01-15"),
  updatedAt: new Date("2026-04-01"),
};

const FAKE_COMPANY = {
  id: "co1",
  name: "Acme Corp",
  industry: "SaaS",
  size: "50-200",
  revenue: "$10M",
  description: "B2B SaaS platform for project management",
  properties: { technologies: ["React", "Node.js", "PostgreSQL"] },
  tenantId: "t1",
};

const FAKE_SETTINGS = {
  onboardingCompanyName: "Elevay",
  productDescription: "AI-powered autonomous GTM engine",
};

const FAKE_PROPOSAL_RESULT = {
  object: {
    executiveSummary: "A tailored proposal for Acme Corp.",
    problemStatement: "Acme struggles with manual sales processes.",
    proposedSolution: {
      overview: "Elevay automates your GTM workflow.",
      keyCapabilities: ["Auto-enrichment", "AI sequences", "Deal coaching"],
      differentiators: ["Zero config", "Full autonomy", "Built-in CRM"],
    },
    implementationPlan: {
      phases: [
        {
          name: "Phase 1",
          duration: "2 weeks",
          activities: ["Onboarding", "Data import"],
        },
      ],
      totalDuration: "4 weeks",
    },
    pricing: {
      summary: "Three tiers to fit your needs",
      tiers: [
        {
          name: "Starter",
          price: "$49/mo",
          includes: ["Basic features"],
        },
        {
          name: "Pro",
          price: "$99/mo",
          includes: ["Advanced features"],
        },
      ],
    },
    nextSteps: ["Schedule demo", "Review proposal internally"],
    closingStatement: "Looking forward to partnering with Acme.",
  },
};

function setupDefaultMocks(overrides?: {
  knowledgeEntries?: Array<{
    id: string;
    title: string;
    category: string;
    content: string;
    similarity: number;
    scope: string;
  }>;
  contacts?: Array<{
    id: string;
    firstName: string;
    lastName: string;
    title: string | null;
    email: string | null;
    companyId: string;
    tenantId: string;
  }>;
  activities?: unknown[];
  notes?: Array<{ title: string; content: string }>;
}) {
  // Set ANTHROPIC_API_KEY so getLLMModel() returns a model
  process.env.ANTHROPIC_API_KEY = "test-key";

  // Knowledge retrieval
  retrieveKnowledgeMock.mockResolvedValue(
    overrides?.knowledgeEntries ?? [
      {
        id: "k1",
        title: "Pricing",
        category: "product",
        content: "Starter: $49/mo, Pro: $99/mo, Enterprise: custom",
        similarity: 0.9,
        scope: "workspace",
      },
    ],
  );

  // Semantic search (used by getDeepConversationContext)
  searchSimilarMock.mockResolvedValue([]);

  // Tenant settings
  getTenantSettingsMock.mockResolvedValue(FAKE_SETTINGS);

  // tracedGenerateObject — capture prompt and return fake proposal
  tracedGenerateObjectMock.mockResolvedValue(FAKE_PROPOSAL_RESULT);

  // DB mock: sequential calls mirroring handler's query order
  // 1. deals query (handler line 27-30)
  // 2. companies query (handler line 35)
  // 3. activities query (skill-knowledge getDeepConversationContext)
  // 4. notes query (skill-knowledge getDeepConversationContext)
  // 5. contacts query (skill-knowledge getCompanyContacts)

  const fakeActivities = overrides?.activities ?? [];
  const fakeNotes = overrides?.notes ?? [];
  const fakeContacts = overrides?.contacts ?? [
    {
      id: "c1",
      firstName: "Sarah",
      lastName: "Chen",
      title: "VP Engineering",
      email: "sarah@acme.com",
      companyId: "co1",
      tenantId: "t1",
    },
  ];

  let callIdx = 0;
  dbMock.select.mockImplementation(() => {
    callIdx++;
    switch (callIdx) {
      case 1: // deal
        return chainOf([FAKE_DEAL]);
      case 2: // company
        return chainOf([FAKE_COMPANY]);
      case 3: // activities (getDeepConversationContext)
        return chainOf(fakeActivities);
      case 4: // notes (getDeepConversationContext)
        return chainOf(fakeNotes);
      case 5: // contacts (getCompanyContacts)
        return chainOf(fakeContacts);
      default:
        return chainOf([]);
    }
  });
}

function getCapturedPrompt(): string {
  expect(tracedGenerateObjectMock).toHaveBeenCalledTimes(1);
  const callArgs = tracedGenerateObjectMock.mock.calls[0][0];
  return callArgs.prompt as string;
}

// ── Tests ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.OPENAI_API_KEY;
});

describe("draftProposal Knowledge integration", () => {
  it("includes Knowledge content in the LLM prompt", async () => {
    setupDefaultMocks({
      knowledgeEntries: [
        {
          id: "k1",
          title: "Pricing",
          category: "product",
          content: "Starter: $49/mo, Pro: $99/mo, Enterprise: custom",
          similarity: 0.9,
          scope: "workspace",
        },
      ],
    });

    const result = await draftProposalHandler(
      { dealId: "d1", includePricing: true },
      { tenantId: "t1", dryRun: false },
    );

    const prompt = getCapturedPrompt();

    // Knowledge content must appear in the prompt
    expect(prompt).toContain("Starter: $49/mo");
    expect(prompt).toContain("Pro: $99/mo");
    expect(prompt).toContain("Enterprise: custom");

    // Knowledge section header from formatKnowledgeForPrompt
    expect(prompt).toContain("## Business Knowledge");
    expect(prompt).toContain("### Pricing (product)");

    // Result should be well-formed
    expect(result.dealId).toBe("d1");
    expect(result.dealName).toBe("Acme Enterprise Deal");
    expect(result.companyName).toBe("Acme Corp");
    expect(result.proposal.executiveSummary).toBeDefined();
  });

  it("includes notes and multi-contact context in the prompt", async () => {
    setupDefaultMocks({
      contacts: [
        {
          id: "c1",
          firstName: "Sarah",
          lastName: "Chen",
          title: "VP Engineering",
          email: "sarah@acme.com",
          companyId: "co1",
          tenantId: "t1",
        },
        {
          id: "c2",
          firstName: "James",
          lastName: "Park",
          title: "CTO",
          email: "james@acme.com",
          companyId: "co1",
          tenantId: "t1",
        },
        {
          id: "c3",
          firstName: "Lisa",
          lastName: "Nguyen",
          title: null,
          email: "lisa@acme.com",
          companyId: "co1",
          tenantId: "t1",
        },
      ],
      notes: [
        {
          title: "Budget Discussion",
          content: "CFO approved $80K budget for Q2 tooling.",
        },
        {
          title: "Technical Requirements",
          content: "Need SSO, SAML, and SOC2 compliance.",
        },
      ],
      activities: [
        {
          activityType: "email_sent",
          summary: "Sent initial pricing deck",
          rawContent: null,
          direction: "outbound",
          occurredAt: new Date("2026-03-01"),
        },
      ],
    });

    const result = await draftProposalHandler(
      { dealId: "d1", includePricing: true },
      { tenantId: "t1", dryRun: false },
    );

    const prompt = getCapturedPrompt();

    // All contacts should appear in the stakeholders block
    expect(prompt).toContain("Sarah Chen");
    expect(prompt).toContain("VP Engineering");
    expect(prompt).toContain("James Park");
    expect(prompt).toContain("CTO");
    expect(prompt).toContain("Lisa Nguyen");

    // Notes content should appear in the notes section
    expect(prompt).toContain("Budget Discussion");
    expect(prompt).toContain("CFO approved $80K budget for Q2 tooling.");
    expect(prompt).toContain("Technical Requirements");
    expect(prompt).toContain("Need SSO, SAML, and SOC2 compliance.");

    // Activity should appear in the conversation history section
    expect(prompt).toContain("Sent initial pricing deck");

    // Company context should appear
    expect(prompt).toContain("Acme Corp");
    expect(prompt).toContain("SaaS");

    expect(result.companyName).toBe("Acme Corp");
  });

  it("works without Knowledge entries (graceful degradation)", async () => {
    setupDefaultMocks({
      knowledgeEntries: [],
    });

    searchSimilarMock.mockResolvedValue([]);

    const result = await draftProposalHandler(
      { dealId: "d1", includePricing: true },
      { tenantId: "t1", dryRun: false },
    );

    const prompt = getCapturedPrompt();

    // The Knowledge section should NOT appear when no entries are returned
    expect(prompt).not.toContain("## Business Knowledge");

    // The handler should still succeed and produce a result
    expect(result.dealId).toBe("d1");
    expect(result.dealName).toBe("Acme Enterprise Deal");
    expect(result.proposal).toBeDefined();
    expect(result.proposal.executiveSummary).toBeDefined();
    expect(result.proposal.proposedSolution).toBeDefined();
  });

  it("includes multiple Knowledge categories in the prompt", async () => {
    setupDefaultMocks({
      knowledgeEntries: [
        {
          id: "k1",
          title: "Pricing",
          category: "product",
          content: "Starter: $49/mo, Pro: $99/mo, Enterprise: custom",
          similarity: 0.9,
          scope: "workspace",
        },
        {
          id: "k2",
          title: "Competitive Positioning vs HubSpot",
          category: "competitors",
          content:
            "We differentiate on zero-config setup and AI-native architecture. HubSpot requires manual CRM entry.",
          similarity: 0.85,
          scope: "workspace",
        },
        {
          id: "k3",
          title: "Common Objection: Price",
          category: "objections",
          content:
            "Respond with ROI calculation: 2 hours/day saved per rep at $50/hr = $2,200/mo value.",
          similarity: 0.8,
          scope: "workspace",
        },
      ],
    });

    const result = await draftProposalHandler(
      { dealId: "d1", includePricing: true },
      { tenantId: "t1", dryRun: false },
    );

    const prompt = getCapturedPrompt();

    // All knowledge entries should be in the prompt
    expect(prompt).toContain("### Pricing (product)");
    expect(prompt).toContain("Starter: $49/mo");
    expect(prompt).toContain("### Competitive Positioning vs HubSpot (competitors)");
    expect(prompt).toContain("zero-config setup");
    expect(prompt).toContain("### Common Objection: Price (objections)");
    expect(prompt).toContain("ROI calculation");

    // Section separators from formatKnowledgeForPrompt
    expect(prompt).toContain("---");

    expect(result.proposal).toBeDefined();
  });

  it("passes the correct trace metadata to tracedGenerateObject", async () => {
    setupDefaultMocks();

    await draftProposalHandler(
      { dealId: "d1", includePricing: true },
      { tenantId: "t1", dryRun: false },
    );

    expect(tracedGenerateObjectMock).toHaveBeenCalledTimes(1);
    const callArgs = tracedGenerateObjectMock.mock.calls[0][0];

    expect(callArgs._trace).toEqual({
      agentId: "skill-draft-proposal",
      tenantId: "t1",
    });
    expect(callArgs.model).toBeDefined();
    expect(callArgs.schema).toBeDefined();
  });

  it("throws when deal is not found", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    retrieveKnowledgeMock.mockResolvedValue([]);
    getTenantSettingsMock.mockResolvedValue(FAKE_SETTINGS);
    dbMock.select.mockReturnValue(chainOf([]));

    await expect(
      draftProposalHandler(
        { dealId: "nonexistent", includePricing: true },
        { tenantId: "t1", dryRun: false },
      ),
    ).rejects.toThrow("not found");
  });
});
