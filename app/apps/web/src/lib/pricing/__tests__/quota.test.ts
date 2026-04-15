import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db before importing the module under test.
vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  contacts: { tenantId: "contacts.tenantId" },
  tenants: {
    id: "tenants.id",
    plan: "tenants.plan",
    quotaOverrides: "tenants.quota_overrides",
  },
}));

vi.mock("@/db/billing-schema", () => ({
  subscriptions: {
    tenantId: "subscriptions.tenantId",
    createdAt: "subscriptions.createdAt",
    currentPeriodStart: "subscriptions.currentPeriodStart",
    currentPeriodEnd: "subscriptions.currentPeriodEnd",
    stripePriceId: "subscriptions.stripePriceId",
    status: "subscriptions.status",
  },
  usageEvents: {
    tenantId: "usageEvents.tenantId",
    eventType: "usageEvents.eventType",
    count: "usageEvents.count",
    createdAt: "usageEvents.createdAt",
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

import { db } from "@/db";
import {
  assertResource,
  assertMetered,
  readUsage,
  QuotaExceededError,
} from "@/lib/pricing/quota";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
  process.env.STRIPE_PRO_PRICE_ID = "price_pro";
});

/**
 * Queue the responses the module expects in order:
 *   1. subscriptions .select.from.where.orderBy.limit  → [sub | undefined]
 *   2. tenants       .select.from.where.limit          → [tenant | undefined]
 *   3. <resource or metered read>                      → [row]
 *
 * readUsage() issues both a contacts count AND a grouped usage_events read,
 * so it needs 4 queued responses total.
 */
function queueQueries(...responses: unknown[][]) {
  const mock = vi.mocked(db.select);
  for (const rows of responses) {
    mock.mockImplementationOnce(
      () =>
        ({
          from: () => ({
            where: (...args: unknown[]) => {
              // Subscriptions read has .orderBy().limit(); tenants read has
              // .limit() directly; the contacts count and usage_events grouped
              // read resolve to the array as-is. Support all shapes.
              void args;
              const leaf = Promise.resolve(rows);
              return Object.assign(leaf, {
                orderBy: () => ({ limit: () => Promise.resolve(rows) }),
                limit: () => Promise.resolve(rows),
                groupBy: () => Promise.resolve(rows),
              });
            },
          }),
        }) as never
    );
  }
}

describe("assertMetered", () => {
  it("resolves when usage is below limit", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date("2026-04-01") }], // sub
      [{ plan: "trial", overrides: {} }], // tenant
      [{ total: 49 }] // usage_events sum
    );
    await expect(assertMetered("t1", "emails")).resolves.toBeUndefined();
  });

  it("throws QuotaExceededError at exactly the limit", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date("2026-04-01") }],
      [{ plan: "trial", overrides: {} }],
      [{ total: 50 }]
    );
    await expect(assertMetered("t1", "emails")).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });

  it("throws with feature / current / limit / plan fields populated", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date("2026-04-01") }],
      [{ plan: "trial", overrides: {} }],
      [{ total: 60 }]
    );
    try {
      await assertMetered("t1", "emails");
      throw new Error("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(QuotaExceededError);
      const err = e as QuotaExceededError;
      expect(err.code).toBe("quota_exceeded");
      expect(err.feature).toBe("emails");
      expect(err.current).toBe(60);
      expect(err.limit).toBe(50);
      expect(err.plan).toBe("trial");
    }
  });

  it("pro plan with Infinity ai_queries never throws even at large usage", async () => {
    queueQueries(
      [{ status: "active", stripePriceId: "price_pro", currentPeriodStart: new Date("2026-04-01") }],
      [{ plan: "pro", overrides: {} }]
      // Third read never happens because Infinity limit short-circuits.
    );
    await expect(assertMetered("t1", "ai_queries")).resolves.toBeUndefined();
  });

  it("override of 0 blocks everything immediately", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date("2026-04-01") }],
      [{ plan: "trial", overrides: { emailsPerMonth: 0 } }],
      [{ total: 0 }]
    );
    await expect(assertMetered("t1", "emails")).rejects.toMatchObject({
      feature: "emails",
      current: 0,
      limit: 0,
    });
  });

  it("override above plan default increases headroom", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date("2026-04-01") }],
      [{ plan: "trial", overrides: { emailsPerMonth: 200 } }],
      [{ total: 150 }]
    );
    await expect(assertMetered("t1", "emails")).resolves.toBeUndefined();
  });

  it("canceled subscription uses canceled tier (== trial quotas)", async () => {
    queueQueries(
      [{ status: "canceled", stripePriceId: "price_pro", currentPeriodStart: null }],
      [{ plan: "pro", overrides: {} }], // tenants.plan is stale but we use sub.status
      [{ total: 51 }]
    );
    await expect(assertMetered("t1", "emails")).rejects.toMatchObject({
      plan: "canceled",
      limit: 50,
    });
  });

  it("no subscription row falls back to tenants.plan", async () => {
    queueQueries(
      [], // no sub
      [{ plan: "pro", overrides: {} }],
      [{ total: 3000 }]
    );
    // 3000 < 5000 pro email limit
    await expect(assertMetered("t1", "emails")).resolves.toBeUndefined();
  });

  it("no subscription + unknown tenants.plan → trial", async () => {
    queueQueries(
      [],
      [{ plan: "enterprise", overrides: {} }],
      [{ total: 51 }]
    );
    await expect(assertMetered("t1", "emails")).rejects.toMatchObject({
      plan: "trial",
      limit: 50,
    });
  });
});

describe("assertResource", () => {
  it("resolves when current + 1 is within limit", async () => {
    queueQueries(
      [{ status: "active", stripePriceId: "price_starter", currentPeriodStart: new Date() }],
      [{ plan: "starter", overrides: {} }],
      [{ n: 999 }]
    );
    await expect(assertResource("t1", "contacts")).resolves.toBeUndefined();
  });

  it("rejects when current + 1 exceeds limit (off-by-one check)", async () => {
    queueQueries(
      [{ status: "active", stripePriceId: "price_starter", currentPeriodStart: new Date() }],
      [{ plan: "starter", overrides: {} }],
      [{ n: 1000 }]
    );
    await expect(assertResource("t1", "contacts")).rejects.toBeInstanceOf(
      QuotaExceededError
    );
  });

  it("addingCount checks batch atomically", async () => {
    // trial limit = 100. Adding 101 from zero → reject before any insert.
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date() }],
      [{ plan: "trial", overrides: {} }],
      [{ n: 0 }]
    );
    await expect(
      assertResource("t1", "contacts", { addingCount: 101 })
    ).rejects.toMatchObject({ current: 0, limit: 100 });
  });

  it("addingCount fits exactly → allowed", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date() }],
      [{ plan: "trial", overrides: {} }],
      [{ n: 50 }]
    );
    await expect(
      assertResource("t1", "contacts", { addingCount: 50 })
    ).resolves.toBeUndefined();
  });

  it("override 0 blocks even zero-row tenants", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date() }],
      [{ plan: "trial", overrides: { contacts: 0 } }],
      [{ n: 0 }]
    );
    await expect(assertResource("t1", "contacts")).rejects.toMatchObject({
      limit: 0,
    });
  });
});

describe("readUsage", () => {
  it("returns plan + limits + usage across all kinds", async () => {
    queueQueries(
      [{ status: "active", stripePriceId: "price_pro", currentPeriodStart: new Date("2026-04-01"), currentPeriodEnd: new Date("2026-05-01") }],
      [{ plan: "pro", overrides: {} }],
      [{ n: 4200 }], // contacts count
      [
        { eventType: "email_sent", total: 300 },
        { eventType: "ai_query", total: 1500 },
      ]
    );
    const r = await readUsage("t1");
    expect(r.plan).toBe("pro");
    expect(r.limits.contacts).toBe(10_000);
    expect(r.limits.aiQueriesPerMonth).toBe(Number.POSITIVE_INFINITY);
    expect(r.usage).toEqual({
      contacts: 4200,
      emails: 300,
      ai_queries: 1500,
    });
  });

  it("usage kinds absent from usage_events default to 0", async () => {
    queueQueries(
      [{ status: "trialing", stripePriceId: null, currentPeriodStart: new Date("2026-04-01"), currentPeriodEnd: null }],
      [{ plan: "trial", overrides: {} }],
      [{ n: 0 }],
      [] // no usage events at all
    );
    const r = await readUsage("t1");
    expect(r.usage).toEqual({ contacts: 0, emails: 0, ai_queries: 0 });
  });
});
