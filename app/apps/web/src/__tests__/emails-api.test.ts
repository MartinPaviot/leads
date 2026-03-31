import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  contacts: { id: "id" },
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

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { db } from "@/db";
import { generateObject } from "ai";

const { POST } = await import("@/app/api/emails/route");

describe("POST /api/emails/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "ct1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when contactId missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when contact not found", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "nonexistent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("generates a personalized email", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1", name: "Martin" } } as never);

    const mockContact = {
      id: "ct1",
      firstName: "Sarah",
      lastName: "Chen",
      email: "sarah@meridian.com",
      title: "CTO",
      companyId: "c1",
      properties: { seniority: "C-Suite" },
    };

    const mockCompany = {
      id: "c1",
      name: "Meridian Labs",
      industry: "AI/ML",
      size: "51-200",
      revenue: "$10M-$50M",
      description: "AI research lab",
      properties: {
        signals: [
          { type: "hiring", title: "Engineering hiring", description: "Hiring senior engineers" },
        ],
      },
    };

    const limitFn = vi.fn()
      .mockResolvedValueOnce([mockContact])
      .mockResolvedValueOnce([mockCompany]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    vi.mocked(generateObject).mockResolvedValue({
      object: {
        subject: "Quick question about Meridian Labs' engineering growth",
        body: "Hi Sarah,\n\nI noticed Meridian Labs is scaling the engineering team...",
      },
    } as never);

    const req = new Request("http://localhost/api/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: "ct1" }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.subject).toContain("Meridian");
    expect(data.body).toContain("Sarah");

    // Verify LLM prompt contains contact and company info
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Sarah Chen"),
      })
    );
  });
});
