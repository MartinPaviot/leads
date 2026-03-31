import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: { id: "id", name: "name" },
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
  eq: vi.fn(),
  sql: vi.fn(),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { db } from "@/db";
import { generateObject } from "ai";

const { POST, GET } = await import("@/app/api/tam/route");

describe("POST /api/tam (generate)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icp: "B2B SaaS" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when ICP is empty", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icp: "" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when ICP is missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("generates TAM companies successfully", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    // Mock existing companies (for dedup check)
    const limitFnSelect = vi.fn().mockResolvedValue([{ name: "Existing Corp" }]);
    const fromFnSelect = vi.fn().mockReturnValue({ limit: limitFnSelect });
    vi.mocked(db.select).mockReturnValue({ from: fromFnSelect } as never);

    // Mock insert chain
    const returningFn = vi.fn().mockResolvedValue([{ id: "new-1" }]);
    const valuesFn = vi.fn().mockReturnValue({ returning: returningFn });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    // Mock update chain (for scoring)
    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    // Mock LLM: TAM generation
    vi.mocked(generateObject)
      .mockResolvedValueOnce({
        object: {
          companies: [
            {
              name: "Acme Inc",
              domain: "acme.com",
              industry: "SaaS",
              size: "51-200",
              revenue: "$10M-$50M",
              description: "Cloud platform",
              whyItFits: "B2B SaaS, right size",
            },
          ],
        },
      } as never)
      // Mock LLM: scoring
      .mockResolvedValueOnce({
        object: {
          score: 85,
          reasons: ["Great fit"],
        },
      } as never);

    const req = new Request("http://localhost/api/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ icp: "B2B SaaS companies, 50-200 employees" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.companiesCreated).toBe(1);

    // Verify LLM was called with ICP
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("B2B SaaS companies"),
      })
    );
  });
});

describe("GET /api/tam (status)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await GET();
    expect(res.status).toBe(401);
  });
});
