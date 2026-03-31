import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies before importing the route
vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: { id: "id" },
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

// Set env before import
process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { db } from "@/db";
import { generateObject } from "ai";
import { embedEntity } from "@/lib/embeddings";

// Dynamic import to get the route handler
const { POST } = await import("@/app/api/enrich/route");

describe("POST /api/enrich", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: ["1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when companyIds missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when companyIds is empty array", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyIds: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("enriches a company successfully", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const mockCompany = {
      id: "c1",
      name: "Stripe",
      domain: "stripe.com",
      industry: null,
      description: null,
      size: null,
      revenue: null,
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

    // Mock LLM response
    vi.mocked(generateObject).mockResolvedValue({
      object: {
        industry: "Fintech",
        description: "Online payment processing platform",
        size: "1000+",
        revenue: "$100M+",
      },
    } as never);

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

    // Verify LLM was called with company name
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Stripe"),
      })
    );
  });

  it("skips already enriched companies", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const mockCompany = {
      id: "c1",
      name: "Stripe",
      domain: "stripe.com",
      industry: "Fintech",
      description: "Already enriched",
      size: "1000+",
      revenue: "$100M+",
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
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

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

    // Should only process 20
    expect(db.select).toHaveBeenCalledTimes(20);
  });

  it("counts failures for missing companies", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

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
