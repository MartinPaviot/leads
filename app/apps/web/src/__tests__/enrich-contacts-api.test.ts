import { describe, it, expect, vi, beforeEach } from "vitest";

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
  contacts: { id: "id" },
  companies: { name: "name" },
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
  contactToText: vi.fn(() => "test text"),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { db } from "@/db";
import { generateObject } from "ai";

const { POST } = await import("@/app/api/enrich-contacts/route");

describe("POST /api/enrich-contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when contactIds missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when contactIds is empty", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/enrich-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("enriches a contact successfully", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

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

    // Mock select chain (used twice: once for contact, once for company lookup)
    const limitFn = vi.fn()
      .mockResolvedValueOnce([mockContact])  // contact lookup
      .mockResolvedValueOnce([]);             // company lookup (not found)
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    // Mock update chain
    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    vi.mocked(generateObject).mockResolvedValue({
      object: {
        title: "CTO",
        seniority: "C-Suite",
        department: "Engineering",
        linkedinUrl: "https://linkedin.com/in/sarahchen",
        phone: null,
        companyName: "Meridian Labs",
      },
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

    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining("Sarah Chen"),
      })
    );
  });

  it("skips already enriched contacts", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const mockContact = {
      id: "ct1",
      firstName: "Sarah",
      lastName: "Chen",
      email: "sarah@meridian.com",
      title: "CTO",
      linkedinUrl: "https://linkedin.com/in/sarahchen",
      companyId: "c1",
      properties: { seniority: "C-Suite" },
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
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

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
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const ids = Array.from({ length: 25 }, (_, i) => `ct${i}`);

    const mockContact = {
      id: "ct1",
      firstName: "Test",
      lastName: "User",
      title: "CTO",
      linkedinUrl: "url",
      properties: { seniority: "IC" },
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
