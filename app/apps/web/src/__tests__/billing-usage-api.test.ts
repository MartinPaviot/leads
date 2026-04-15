import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/billing-schema", () => ({
  subscriptions: {
    tenantId: "tenantId",
    currentPeriodStart: "currentPeriodStart",
    currentPeriodEnd: "currentPeriodEnd",
  },
  usageEvents: {
    tenantId: "tenantId",
    eventType: "eventType",
    count: "count",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  gte: vi.fn(),
  sql: Object.assign(vi.fn(() => "sql-frag"), {
    raw: vi.fn(() => "sql-frag"),
  }),
}));

import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";

const mod = await import("@/app/api/billing/usage/route");

const authCtx = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "member" as const,
};

beforeEach(() => vi.clearAllMocks());

function mockSubSelect(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function mockSubSelectThrows(err: Error) {
  const limitFn = vi.fn().mockRejectedValue(err);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function mockUsageSelect(rows: unknown[]) {
  const groupBy = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ groupBy });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function mockUsageSelectThrows(err: Error) {
  const groupBy = vi.fn().mockRejectedValue(err);
  const whereFn = vi.fn().mockReturnValue({ groupBy });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

describe("GET /api/billing/usage", () => {
  it("401 when unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.GET();
    expect(res.status).toBe(401);
  });

  it("returns zeros when no sub row + no usage rows", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSubSelect([]);
    mockUsageSelect([]);

    const res = await mod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    // periodStart defaults to first day of current month
    const periodStart = new Date(body.periodStart);
    expect(periodStart.getDate()).toBe(1);
    expect(body.periodEnd).toBeNull();
    expect(body.usage).toEqual({
      api_call: 0,
      email_sent: 0,
      contact_enriched: 0,
      ai_query: 0,
    });
  });

  it("maps aggregated usage rows onto the fixed event-type keys", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSubSelect([
      {
        currentPeriodStart: new Date("2026-04-01"),
        currentPeriodEnd: new Date("2026-05-01"),
      },
    ]);
    mockUsageSelect([
      { eventType: "api_call", total: 1250 },
      { eventType: "email_sent", total: 87 },
      { eventType: "ai_query", total: 42 },
      // contact_enriched absent → should default to 0
    ]);

    const res = await mod.GET();
    const body = await res.json();
    expect(body.periodStart).toBe(new Date("2026-04-01").toISOString());
    expect(body.periodEnd).toBe(new Date("2026-05-01").toISOString());
    expect(body.usage).toEqual({
      api_call: 1250,
      email_sent: 87,
      contact_enriched: 0,
      ai_query: 42,
    });
  });

  it("ignores unknown event types not in the fixed key set", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSubSelect([]);
    mockUsageSelect([
      { eventType: "api_call", total: 10 },
      { eventType: "mystery_metric", total: 9999 }, // not in the allowed set
    ]);

    const res = await mod.GET();
    const body = await res.json();
    expect(body.usage.api_call).toBe(10);
    expect(body.usage).not.toHaveProperty("mystery_metric");
  });

  it("tolerates missing subscriptions table (falls back to current-month start)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSubSelectThrows(new Error('relation "subscriptions" does not exist'));
    mockUsageSelect([{ eventType: "api_call", total: 5 }]);

    const res = await mod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const periodStart = new Date(body.periodStart);
    expect(periodStart.getDate()).toBe(1); // fallback first-of-month
    expect(body.usage.api_call).toBe(5);
  });

  it("tolerates missing usage_events table (returns zeros, still 200)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSubSelect([
      {
        currentPeriodStart: new Date("2026-04-01"),
        currentPeriodEnd: null,
      },
    ]);
    mockUsageSelectThrows(new Error('relation "usage_events" does not exist'));

    const res = await mod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage).toEqual({
      api_call: 0,
      email_sent: 0,
      contact_enriched: 0,
      ai_query: 0,
    });
  });

  it("returns emptyUsage shape on unexpected top-level error", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    // Force db.select to throw synchronously (not a missing-table case)
    vi.mocked(db.select).mockImplementation(() => {
      throw new Error("unexpected panic");
    });

    const res = await mod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usage).toEqual({
      api_call: 0,
      email_sent: 0,
      contact_enriched: 0,
      ai_query: 0,
    });
    expect(body.periodEnd).toBeNull();
  });
});
