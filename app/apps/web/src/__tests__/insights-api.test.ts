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
  deals: { id: "id" },
  contacts: { id: "id" },
  companies: { id: "id" },
  activities: { id: "id" },
  sequences: { id: "id" },
  sequenceEnrollments: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  sql: vi.fn(),
}));

import { auth } from "@/auth";
import { db } from "@/db";

const insightsModule = await import("@/app/api/insights/route");

describe("GET /api/insights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const res = await insightsModule.GET();
    expect(res.status).toBe(401);
  });

  it("returns empty insights when no data", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const fromFn = vi.fn().mockResolvedValue([]);
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.insights).toEqual([]);
  });

  it("detects stalling deals", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const oldDate = new Date(Date.now() - 20 * 86400000); // 20 days ago
    const mockDeals = [
      { id: "d1", name: "Stale Deal", stage: "qualification", value: 10000, properties: {}, createdAt: oldDate, updatedAt: oldDate },
      { id: "d2", name: "Another Stale", stage: "demo", value: 20000, properties: {}, createdAt: oldDate, updatedAt: oldDate },
    ];

    let callCount = 0;
    const fromFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockDeals); // deals
      if (callCount === 2) return Promise.resolve([]); // contacts
      if (callCount === 3) return Promise.resolve([]); // companies
      return Promise.resolve([]); // enrollments
    });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    const stallingInsight = data.insights.find((i: { title: string }) => i.title.includes("stalling"));
    expect(stallingInsight).toBeDefined();
    expect(stallingInsight.category).toBe("alert");
  });

  it("detects high-risk deals", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const now = new Date();
    const mockDeals = [
      { id: "d1", name: "Risky Deal", stage: "proposal", value: 50000, properties: { riskLevel: "high" }, createdAt: now, updatedAt: now },
    ];

    let callCount = 0;
    const fromFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockDeals);
      if (callCount === 2) return Promise.resolve([]);
      if (callCount === 3) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    const riskInsight = data.insights.find((i: { title: string }) => i.title.includes("high-risk"));
    expect(riskInsight).toBeDefined();
    expect(riskInsight.severity).toBe("high");
  });

  it("detects win rate trend", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "u1" } } as never);

    const now = new Date();
    const mockDeals = [
      { id: "d1", name: "Won 1", stage: "won", value: 10000, properties: {}, createdAt: now, updatedAt: now },
      { id: "d2", name: "Won 2", stage: "won", value: 20000, properties: {}, createdAt: now, updatedAt: now },
      { id: "d3", name: "Lost 1", stage: "lost", value: 5000, properties: {}, createdAt: now, updatedAt: now },
    ];

    let callCount = 0;
    const fromFn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.resolve(mockDeals);
      if (callCount === 2) return Promise.resolve([]);
      if (callCount === 3) return Promise.resolve([]);
      return Promise.resolve([]);
    });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await insightsModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    const winRateInsight = data.insights.find((i: { title: string }) => i.title.includes("Win rate"));
    expect(winRateInsight).toBeDefined();
    expect(winRateInsight.title).toContain("67%");
    expect(winRateInsight.category).toBe("trend");
  });
});
