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
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: { id: "id", name: "name", tenantId: "tenantId", domain: "domain" },
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

vi.mock("@/lib/embeddings", () => ({
  embedEntity: vi.fn(),
  companyToText: vi.fn(() => "test text"),
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

vi.mock("@/lib/tenant-settings", () => ({
  getTenantSettings: vi.fn(() => Promise.resolve({})),
  parseSizeRange: vi.fn(() => null),
}));

vi.mock("@/lib/icp-constants", () => ({
  sizesToApolloRanges: vi.fn((sizes: string[]) => sizes.map((s) => s.replace("-", ","))),
}));

vi.mock("@/lib/apollo-client", () => ({
  searchOrganizations: vi.fn(),
  enrichOrganization: vi.fn(() => Promise.resolve({
    id: "apollo-enriched-1",
    name: "Acme Inc",
    industry: "Computer Software",
    estimated_num_employees: 120,
    annual_revenue: 20000000,
    description: "B2B SaaS platform",
    linkedin_url: "https://linkedin.com/company/acme",
    technology_names: ["React", "AWS"],
    total_funding: 15000000,
    total_funding_printed: "$15M",
    latest_funding_stage: "Series A",
    founded_year: 2019,
    city: "San Francisco",
    state: "CA",
    country: "United States",
    keywords: ["saas"],
  })),
  employeeCountToRange: vi.fn((n: number) => (n > 200 ? "201-500" : "51-200")),
  revenueToRange: vi.fn(() => "$10M-$50M"),
  isApolloAvailable: vi.fn(() => true),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";
import { searchOrganizations } from "@/lib/integrations/apollo-client";

const { POST, GET } = await import("@/app/api/tam/route");

describe("POST /api/tam (generate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icp: "B2B SaaS" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when no ICP or product description provided", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industries: [], companySizes: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("generates TAM via LLM criteria + Apollo search", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });

    // Mock existing companies query (for dedup)
    const limitFn = vi.fn().mockResolvedValue([{ domain: "existing.com" }]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    // Mock insert chain
    const valuesFn = vi.fn().mockResolvedValue([]);
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    // Mock LLM: generates search strategies (not company names!)
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        strategies: [
          {
            label: "Direct ICP fit",
            reasoning: "SaaS companies in the target size range",
            filters: {
              organization_num_employees_ranges: ["51,200"],
              organization_locations: ["United States"],
              q_organization_keyword_tags: ["saas", "b2b"],
            },
          },
        ],
      },
    } as never);

    // Mock Apollo search: returns real companies
    vi.mocked(searchOrganizations).mockResolvedValue({
      organizations: [
        {
          id: "apollo-1",
          name: "Acme Inc",
          website_url: "https://acme.com",
          primary_domain: "acme.com",
          industry: "Computer Software",
          estimated_num_employees: 120,
          annual_revenue: 20000000,
          description: "B2B SaaS platform",
          linkedin_url: "https://linkedin.com/company/acme",
          logo_url: "https://logo.clearbit.com/acme.com",
          technology_names: ["React", "AWS"],
          total_funding: 15000000,
          total_funding_printed: "$15M",
          latest_funding_stage: "Series A",
          founded_year: 2019,
          city: "San Francisco",
          state: "CA",
          country: "United States",
          keywords: ["saas", "b2b"],
        },
      ],
      pagination: { page: 1, per_page: 100, total_entries: 1 },
    });

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industries: ["Computer Software"],
        companySizes: ["51-200"],
        productDescription: "B2B analytics tool",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.source).toBe("llm_criteria+apollo_search");
    expect(data.companiesCreated).toBe(1);
    expect(data.strategies).toHaveLength(1);
    expect(data.strategies[0].label).toBe("Direct ICP fit");

    // Verify LLM was called to generate criteria, not company names
    expect(generateObject).toHaveBeenCalledOnce();
    const llmCall = vi.mocked(generateObject).mock.calls[0][0];
    expect(llmCall.prompt).toContain("Apollo.io search strategies");

    // Verify Apollo search was called with the LLM-generated criteria
    expect(searchOrganizations).toHaveBeenCalledWith(
      expect.objectContaining({
        organization_num_employees_ranges: ["51,200"],
        organization_locations: ["United States"],
        q_organization_keyword_tags: ["saas", "b2b"],
      })
    );
  });

  it("skips duplicate domains from Apollo results", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({
      userId: "u1",
      tenantId: "t1",
      appUserId: "u1",
      role: "admin",
    });

    // Existing company with acme.com
    const limitFn = vi.fn().mockResolvedValue([{ domain: "acme.com" }]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const valuesFn = vi.fn().mockResolvedValue([]);
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        strategies: [
          {
            label: "Direct fit",
            reasoning: "Test",
            filters: { organization_num_employees_ranges: ["51,200"] },
          },
        ],
      },
    } as never);

    // Apollo returns a company we already have
    vi.mocked(searchOrganizations).mockResolvedValue({
      organizations: [
        {
          id: "apollo-1",
          name: "Acme Inc",
          primary_domain: "acme.com",
          website_url: "https://acme.com",
          industry: null,
          estimated_num_employees: 100,
          annual_revenue: null,
          description: null,
          linkedin_url: null,
          logo_url: null,
          technology_names: [],
          total_funding: null,
          total_funding_printed: null,
          latest_funding_stage: null,
          founded_year: null,
          city: null,
          state: null,
          country: null,
          keywords: [],
        },
      ],
      pagination: { page: 1, per_page: 100, total_entries: 1 },
    });

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        industries: ["SaaS"],
        companySizes: ["51-200"],
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.companiesCreated).toBe(0);
    expect(data.companiesSkipped).toBe(1);
  });
});

describe("GET /api/tam (status)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
