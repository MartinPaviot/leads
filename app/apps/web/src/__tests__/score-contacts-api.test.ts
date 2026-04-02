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
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  contacts: { id: "id", tenantId: "tenantId" },
  companies: { id: "id", tenantId: "tenantId" },
  activities: { id: "id", tenantId: "tenantId", entityType: "entityType", entityId: "entityId", occurredAt: "occurredAt" },
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
  and: vi.fn(),
  eq: vi.fn(),
  gte: vi.fn(),
  sql: vi.fn(),
}));

process.env.ANTHROPIC_API_KEY = "test-key";

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";
import { generateObject } from "ai";

const { POST } = await import("@/app/api/score-contacts/route");

describe("POST /api/score-contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["1"] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when contactIds missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("scores a contact successfully", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

    const mockContact = {
      id: "ct1",
      firstName: "Sarah",
      lastName: "Chen",
      email: "sarah@meridian.com",
      title: "CTO",
      companyId: null,
      properties: { seniority: "C-Suite", department: "Engineering" },
    };

    // Route does: 1) contact lookup with .where().limit(), 2) activity count with .where() (no limit)
    const limitFn = vi.fn().mockResolvedValue([mockContact]);
    const activityCountResult = [{ count: 0 }];
    const whereFn = vi.fn()
      .mockReturnValueOnce({ limit: limitFn })                         // contact lookup (has .limit)
      .mockResolvedValueOnce(activityCountResult);                     // activity count (no .limit)
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const updateWhereFn = vi.fn().mockResolvedValue([]);
    const updateSetFn = vi.fn().mockReturnValue({ where: updateWhereFn });
    vi.mocked(db.update).mockReturnValue({ set: updateSetFn } as never);

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["ct1"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.scored).toBe(1);
  });

  it("handles missing contacts gracefully", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1" });

    const limitFn = vi.fn().mockResolvedValue([]); // empty = not found
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const req = new Request("http://localhost/api/score-contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactIds: ["nonexistent"] }),
    });

    const res = await POST(req);
    const data = await res.json();

    expect(data.scored).toBe(0);
  });
});
