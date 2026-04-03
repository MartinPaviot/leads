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

vi.mock("@ai-sdk/anthropic", () => ({
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

vi.mock("@/lib/apollo-client", () => ({
  searchOrganizations: vi.fn(),
  enrichOrganization: vi.fn(),
  employeeCountToRange: vi.fn((n: number) => n > 200 ? "201-500" : "51-200"),
  revenueToRange: vi.fn(() => "$10M-$50M"),
  isApolloAvailable: vi.fn(() => true),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";
import { searchOrganizations, enrichOrganization } from "@/lib/apollo-client";

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

  it("returns 400 when industries and companySizes are empty", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industries: [], companySizes: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("generates TAM companies successfully via Apollo", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

    // Mock existing companies (for dedup check) — route: .select({name, domain}).from(companies).where(eq(...)).limit(500)
    const limitFnSelect = vi.fn().mockResolvedValue([{ name: "Existing Corp", domain: "existing.com" }]);
    const whereFnSelect = vi.fn().mockReturnValue({ limit: limitFnSelect });
    const fromFnSelect = vi.fn().mockReturnValue({ where: whereFnSelect });
    vi.mocked(db.select).mockReturnValue({ from: fromFnSelect } as never);

    // Mock insert chain (no returning in route — it uses plain insert)
    const valuesFn = vi.fn().mockResolvedValue([]);
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    // Mock LLM: generates candidate companies from structured ICP
    vi.mocked(generateObject).mockResolvedValueOnce({
      object: {
        companies: [
          {
            name: "Acme Inc",
            domain: "acme.com",
            reason: "B2B SaaS company with 100 employees",
          },
        ],
      },
    } as never);

    // Mock Apollo enrich (called per candidate with domain)
    vi.mocked(enrichOrganization).mockResolvedValue({
      id: "apollo-1",
      name: "Acme Inc",
      website_url: "https://acme.com",
      industry: "SaaS",
      estimated_num_employees: 100,
      annual_revenue: 20000000,
      description: "Cloud platform",
      linkedin_url: "https://linkedin.com/company/acme",
      technology_names: ["React"],
      total_funding: 5000000,
      founded_year: 2018,
      city: "SF",
      state: "CA",
      country: "US",
      keywords: ["saas"],
    } as never);

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ industries: ["SaaS"], companySizes: ["51-200"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.source).toBe("llm+apollo");
    expect(data.companiesCreated).toBe(1);
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
