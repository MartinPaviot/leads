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
  },
}));

vi.mock("@/db/schema", () => ({
  outboundEmails: { tenantId: "tenantId", sentAt: "sentAt", openedAt: "openedAt", repliedAt: "repliedAt", bouncedAt: "bouncedAt", status: "status", bounceType: "bounceType", enrollmentId: "enrollmentId", stepNumber: "stepNumber", deliveredAt: "deliveredAt", clickedAt: "clickedAt" },
  sequenceEnrollments: { id: "id", sequenceId: "sequenceId", status: "status" },
  connectedMailboxes: { id: "id", tenantId: "tenantId", healthScore: "healthScore", status: "status" },
  sequences: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  isNotNull: vi.fn(),
  count: vi.fn(),
  ne: vi.fn(),
  or: vi.fn(),
  desc: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const delivModule = await import("@/app/api/deliverability/route");

function fakeReq() {
  return new Request("http://localhost/api/deliverability");
}

describe("GET /api/deliverability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await delivModule.GET(fakeReq());
    expect(res.status).toBe(401);
  });

  it("returns zero metrics when no data", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    // Build a chainable mock that handles all 4 query patterns:
    // 1. .select().from().where() → metrics
    // 2. .select().from().where() → spam
    // 3. .select().from().where() or .select().from() → enrollments (iterable)
    // 4. .select().from().where() → mailboxes (iterable)
    function makeChain(results: unknown[]) {
      let callIdx = 0;
      const chain: Record<string, any> = {};
      const resolve = () => {
        const r = results[callIdx] ?? [];
        callIdx++;
        return Promise.resolve(r);
      };
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => resolve());
      chain.groupBy = vi.fn(() => resolve());
      chain.orderBy = vi.fn(() => resolve());
      // Also make the chain itself thenable for cases like `await db.select().from()`
      chain.then = (cb: any) => resolve().then(cb);
      return chain;
    }

    vi.mocked(db.select).mockReturnValue(makeChain([
      [{ totalSent: 0, totalOpened: 0, totalReplied: 0, totalBounced: 0, totalDelivered: 0, totalClicked: 0 }], // metrics
      [{ spamCount: 0 }], // spam
      [], // enrollments
      [], // mailboxes
    ]) as never);

    const res = await delivModule.GET(fakeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalSent).toBe(0);
  });

  it("computes correct rates from outbound emails", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    function makeChain(results: unknown[]) {
      let callIdx = 0;
      const chain: Record<string, any> = {};
      const resolve = () => { const r = results[callIdx] ?? []; callIdx++; return Promise.resolve(r); };
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => resolve());
      chain.groupBy = vi.fn(() => resolve());
      chain.orderBy = vi.fn(() => resolve());
      chain.then = (cb: any) => resolve().then(cb);
      return chain;
    }

    vi.mocked(db.select).mockReturnValue(makeChain([
      [{ totalSent: 10, totalOpened: 5, totalReplied: 2, totalBounced: 1, totalDelivered: 8, totalClicked: 3 }],
      [{ spamCount: 0 }],
      [], // enrollments
      [], // mailboxes
    ]) as never);

    const res = await delivModule.GET(fakeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalSent).toBe(10);
    expect(data.openRate).toBe(50);
    expect(data.replyRate).toBe(20);
    expect(data.bounceRate).toBe(10);
  });

  it("flags high bounce rate warning", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    function makeChain(results: unknown[]) {
      let callIdx = 0;
      const chain: Record<string, any> = {};
      const resolve = () => { const r = results[callIdx] ?? []; callIdx++; return Promise.resolve(r); };
      chain.from = vi.fn(() => chain);
      chain.where = vi.fn(() => resolve());
      chain.groupBy = vi.fn(() => resolve());
      chain.orderBy = vi.fn(() => resolve());
      chain.then = (cb: any) => resolve().then(cb);
      return chain;
    }

    vi.mocked(db.select).mockReturnValue(makeChain([
      [{ totalSent: 100, totalOpened: 10, totalReplied: 1, totalBounced: 10, totalDelivered: 85, totalClicked: 2 }],
      [{ spamCount: 1 }],
      [], // enrollments
      [], // mailboxes
    ]) as never);

    const res = await delivModule.GET(fakeReq());
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.bounceRate).toBe(10);
    expect(data.warnings.length).toBeGreaterThan(0);
  });
});
