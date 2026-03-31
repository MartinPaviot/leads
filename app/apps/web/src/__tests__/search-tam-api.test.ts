import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/embeddings", () => ({
  searchSimilar: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  companies: { id: "id" },
  contacts: { id: "id" },
  deals: { id: "id" },
}));

import { auth } from "@/auth";
import { searchSimilar } from "@/lib/embeddings";
import { db } from "@/db";

const { POST } = await import("@/app/api/search/tam/route");

describe("POST /api/search/tam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/search/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "fintech" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when query is empty", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/search/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns hydrated search results", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    vi.mocked(searchSimilar).mockResolvedValue([
      {
        entityType: "company",
        entityId: "c1",
        content: "Stripe. Fintech. Payment platform.",
        similarity: 0.85,
      },
    ]);

    const mockCompany = {
      name: "Stripe",
      domain: "stripe.com",
      industry: "Fintech",
      size: "1000+",
      revenue: "$100M+",
      score: 85,
      description: "Payment platform",
    };

    const limitFn = vi.fn().mockResolvedValue([mockCompany]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/search/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "fintech companies" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.results).toHaveLength(1);
    expect(data.results[0].entityType).toBe("company");
    expect(data.results[0].entity.name).toBe("Stripe");
    expect(data.results[0].similarity).toBe(0.85);
  });

  it("filters by entity type", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    vi.mocked(searchSimilar).mockResolvedValue([
      { entityType: "company", entityId: "c1", content: "Stripe", similarity: 0.8 },
      { entityType: "contact", entityId: "ct1", content: "Sarah Chen", similarity: 0.7 },
    ]);

    const limitFn = vi.fn().mockResolvedValue([{ name: "Stripe" }]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/search/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "fintech", entityType: "company" }),
    });

    const res = await POST(req);
    const data = await res.json();

    // Should only return company results
    expect(data.results).toHaveLength(1);
    expect(data.results[0].entityType).toBe("company");
  });

  it("returns empty results for no matches", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);
    vi.mocked(searchSimilar).mockResolvedValue([]);

    const req = new Request("http://localhost/api/search/tam", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "nonexistent industry" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.results).toHaveLength(0);
  });
});
