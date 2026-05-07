import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  sequences: { id: "id", tenantId: "tenantId", status: "status", campaignConfig: "campaignConfig", updatedAt: "updatedAt" },
  sequenceSteps: { sequenceId: "sequenceId", stepNumber: "stepNumber" },
  companies: { id: "id", tenantId: "tenantId", industry: "industry", size: "size", score: "score", properties: "properties" },
  outboundEmails: { tenantId: "tenantId", campaignId: "campaignId", status: "status", queuedAt: "queuedAt", updatedAt: "updatedAt" },
  sequenceEnrollments: { sequenceId: "sequenceId", contactId: "contactId" },
  contacts: { id: "id", tenantId: "tenantId", email: "email", firstName: "firstName", lastName: "lastName", title: "title", score: "score", companyId: "companyId" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  sql: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
  isNotNull: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(() => null),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn(() => Promise.resolve()) },
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";
import { inngest } from "@/inngest/client";

// ── Prepare Route ──

describe("POST /api/campaigns/prepare", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const { POST } = await import("@/app/api/campaigns/prepare/route");

    const req = new Request("http://localhost/api/campaigns/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequenceId: "seq-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when sequenceId is missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });
    const { POST } = await import("@/app/api/campaigns/prepare/route");

    const req = new Request("http://localhost/api/campaigns/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 404 when sequence not found", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    // Mock: sequence query returns empty
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const { POST } = await import("@/app/api/campaigns/prepare/route");

    const req = new Request("http://localhost/api/campaigns/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequenceId: "nonexistent" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 400 when sequence has no steps", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    // First select: sequence found. Second select: step count = 0.
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "seq-1", name: "Test", tenantId: "t1", status: "draft" }]),
          }),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 0 }]),
        }),
      } as never);

    const { POST } = await import("@/app/api/campaigns/prepare/route");

    const req = new Request("http://localhost/api/campaigns/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sequenceId: "seq-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("no steps");
  });

  it("returns 202 and fires inngest event on success", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    // First select: sequence found. Second select: step count = 2.
    vi.mocked(db.select)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([{ id: "seq-1", name: "Test", tenantId: "t1", status: "draft" }]),
          }),
        }),
      } as never)
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 2 }]),
        }),
      } as never);

    // Mock update
    const setFn = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const { POST } = await import("@/app/api/campaigns/prepare/route");

    const req = new Request("http://localhost/api/campaigns/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sequenceId: "seq-1",
        targetRoles: ["CEO", "CTO"],
        maxCompanies: 25,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const data = await res.json();
    expect(data.accepted).toBe(true);

    // Verify inngest event was fired
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "campaign/prepare",
        data: expect.objectContaining({
          sequenceId: "seq-1",
          tenantId: "t1",
        }),
      })
    );
  });
});
