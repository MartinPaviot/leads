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
  deals: { id: "id" },
  activities: { entityId: "entity_id" },
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

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { db } from "@/db";
import { generateObject } from "ai";

const analyzeModule = await import("@/app/api/deals/analyze/route");

describe("POST /api/deals/analyze", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const req = new Request("http://localhost/api/deals/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealIds: ["d1"] }),
    });

    const res = await analyzeModule.POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when dealIds missing", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const req = new Request("http://localhost/api/deals/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await analyzeModule.POST(req);
    expect(res.status).toBe(400);
  });

  it("analyzes a deal successfully", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const mockDeal = {
      id: "d1",
      name: "Acme Partnership",
      stage: "qualification",
      value: 50000,
      companyId: null,
      properties: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Mock select: deal fetch, activity count
    const limitFn = vi.fn().mockResolvedValue([mockDeal]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    // Mock update
    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    vi.mocked(generateObject).mockResolvedValue({
      object: {
        suggestedStage: "demo",
        stageReason: "Multiple interactions suggest demo readiness",
        riskLevel: "medium",
        risks: ["Limited engagement in last 2 weeks"],
        summary: "Acme Partnership is in qualification with moderate engagement.",
        nextActions: ["Schedule demo", "Send case study"],
      },
    } as never);

    const req = new Request("http://localhost/api/deals/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealIds: ["d1"] }),
    });

    const res = await analyzeModule.POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.analyzed).toBe(1);
    expect(data.results[0].riskLevel).toBe("medium");
    expect(data.results[0].suggestedStage).toBe("demo");
  });
});
