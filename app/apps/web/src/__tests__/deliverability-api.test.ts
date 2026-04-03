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
  },
}));

vi.mock("@/db/schema", () => ({
  activities: { id: "id" },
  sequenceEnrollments: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(),
}));

import { auth } from "@/auth";
import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";

const delivModule = await import("@/app/api/deliverability/route");

describe("GET /api/deliverability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);

    const res = await delivModule.GET();
    expect(res.status).toBe(401);
  });

  it("returns zero metrics when no data", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const whereFn = vi.fn().mockResolvedValue([]);
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // activities query (has .where)
      .mockResolvedValueOnce([]);                 // sequenceEnrollments query (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await delivModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalSent).toBe(0);
    expect(data.healthScore).toBe(0);
    expect(data.warnings).toEqual([]);
  });

  it("computes correct rates from activities", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    const mockActivities = [
      { id: "a1", activityType: "email_sent", metadata: {} },
      { id: "a2", activityType: "email_sent", metadata: {} },
      { id: "a3", activityType: "email_sent", metadata: {} },
      { id: "a4", activityType: "email_sent", metadata: {} },
      { id: "a5", activityType: "email_opened", metadata: {} },
      { id: "a6", activityType: "email_opened", metadata: {} },
      { id: "a7", activityType: "email_replied", metadata: {} },
      { id: "a8", activityType: "email_bounced", metadata: {} },
    ];

    const whereFn = vi.fn().mockResolvedValue(mockActivities);
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // activities query (has .where)
      .mockResolvedValueOnce([]);                 // sequenceEnrollments query (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await delivModule.GET();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.totalSent).toBe(4);
    expect(data.totalOpened).toBe(2);
    expect(data.totalReplied).toBe(1);
    expect(data.totalBounced).toBe(1);
    expect(data.openRate).toBe(50); // 2/4
    expect(data.replyRate).toBe(25); // 1/4
    expect(data.bounceRate).toBe(25); // 1/4
    expect(data.healthScore).toBeLessThan(100); // bounce penalized
  });

  it("flags high bounce rate warning", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" });

    // 10 sent, 1 bounced = 10% bounce
    const mockActivities = [
      ...Array(10).fill(null).map((_, i) => ({ id: `s${i}`, activityType: "email_sent", metadata: {} })),
      { id: "b1", activityType: "email_bounced", metadata: {} },
    ];

    const whereFn = vi.fn().mockResolvedValue(mockActivities);
    const fromFn = vi.fn()
      .mockReturnValueOnce({ where: whereFn })   // activities query (has .where)
      .mockResolvedValueOnce([]);                 // sequenceEnrollments query (no .where)
    vi.mocked(db.select).mockReturnValue({ from: fromFn } as never);

    const res = await delivModule.GET();
    const data = await res.json();

    expect(data.bounceRate).toBe(10);
    expect(data.warnings.some((w: string) => w.includes("Bounce rate"))).toBe(true);
  });
});
