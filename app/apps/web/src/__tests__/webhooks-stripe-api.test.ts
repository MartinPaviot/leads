import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const constructEventMock = vi.fn();
const subscriptionsRetrieveMock = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    webhooks: { constructEvent: constructEventMock },
    subscriptions: { retrieve: subscriptionsRetrieveMock },
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  tenants: { id: "id", plan: "plan", updatedAt: "updatedAt" },
}));

vi.mock("@/db/billing-schema", () => ({
  subscriptions: {
    tenantId: "tenantId",
    stripeSubscriptionId: "stripeSubscriptionId",
    stripeCustomerId: "stripeCustomerId",
    stripePriceId: "stripePriceId",
    status: "status",
    currentPeriodStart: "currentPeriodStart",
    currentPeriodEnd: "currentPeriodEnd",
    cancelAtPeriodEnd: "cancelAtPeriodEnd",
    trialStart: "trialStart",
    trialEnd: "trialEnd",
    updatedAt: "updatedAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
}));

import { db } from "@/db";

const mod = await import("@/app/api/webhooks/stripe/route");

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function mockSelectOnce(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function setupUpdate() {
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const setFn = vi.fn().mockReturnValue({ where: updateWhere });
  vi.mocked(db.update).mockReturnValue({ set: setFn } as never);
  return setFn;
}

function setupInsert() {
  const valuesFn = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);
  return valuesFn;
}

function makeReq(body: string, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

const subscriptionFixture = (overrides: Record<string, unknown> = {}) => ({
  id: "sub_123",
  customer: "cus_456",
  status: "active",
  billing_cycle_anchor: 1_700_000_000,
  cancel_at_period_end: false,
  trial_start: null,
  trial_end: null,
  metadata: { tenantId: "t1" },
  items: {
    data: [{ price: { id: "price_pro", recurring: { interval: "month", interval_count: 1 } } }],
  },
  ...overrides,
});

describe("POST /api/webhooks/stripe — config gates", () => {
  it("400 when stripe-signature header missing", async () => {
    const res = await mod.POST(makeReq('{"x":1}'));
    expect(res.status).toBe(400);
  });

  it("503 when STRIPE_WEBHOOK_SECRET is unset", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    const res = await mod.POST(makeReq('{"x":1}', { "stripe-signature": "sig" }));
    expect(res.status).toBe(503);
  });

  it("400 when constructEvent throws (signature verify failed)", async () => {
    constructEventMock.mockImplementation(() => {
      throw new Error("Bad signature");
    });
    const res = await mod.POST(makeReq('{"x":1}', { "stripe-signature": "sig" }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/stripe — checkout.session.completed", () => {
  it("creates a new subscription row + flips tenant plan to pro", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: {
          metadata: { tenantId: "t1" },
          subscription: "sub_123",
        },
      },
    });
    subscriptionsRetrieveMock.mockResolvedValue(subscriptionFixture());
    mockSelectOnce([]); // no existing subscription row
    const insertValues = setupInsert();
    const updateSet = setupUpdate();

    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        stripeSubscriptionId: "sub_123",
        stripeCustomerId: "cus_456",
        stripePriceId: "price_pro",
        status: "active",
      })
    );
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "pro" })
    );
  });

  it("updates existing subscription row instead of inserting", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: { metadata: { tenantId: "t1" }, subscription: "sub_123" },
      },
    });
    subscriptionsRetrieveMock.mockResolvedValue(subscriptionFixture());
    mockSelectOnce([{ tenantId: "t1" }]); // existing
    const insertValues = setupInsert();
    const updateSet = setupUpdate();

    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(insertValues).not.toHaveBeenCalled();
    // updateSet called twice: subscriptions row + tenants plan
    expect(updateSet).toHaveBeenCalledTimes(2);
  });

  it("no-op when tenantId metadata missing", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { metadata: {}, subscription: "sub_123" } },
    });
    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(subscriptionsRetrieveMock).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });

  it("maps starter price ID → tenant plan 'starter'", async () => {
    constructEventMock.mockReturnValue({
      type: "checkout.session.completed",
      data: { object: { metadata: { tenantId: "t1" }, subscription: "sub_x" } },
    });
    subscriptionsRetrieveMock.mockResolvedValue(
      subscriptionFixture({
        items: { data: [{ price: { id: "price_starter", recurring: { interval: "month", interval_count: 1 } } }] },
      })
    );
    mockSelectOnce([]);
    setupInsert();
    const updateSet = setupUpdate();

    await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ plan: "starter" })
    );
  });
});

describe("POST /api/webhooks/stripe — customer.subscription.updated/deleted", () => {
  it("updated: refreshes subscription + tenant plan", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: subscriptionFixture({ status: "trialing" }) },
    });
    const updateSet = setupUpdate();

    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    // Two updates: subscriptions + tenants
    expect(updateSet).toHaveBeenCalledTimes(2);
    expect(updateSet.mock.calls[0]?.[0]).toMatchObject({ status: "trialing" });
  });

  it("deleted: marks canceled + flips tenant plan to canceled", async () => {
    constructEventMock.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: subscriptionFixture() },
    });
    const updateSet = setupUpdate();

    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(updateSet.mock.calls[0]?.[0]).toMatchObject({ status: "canceled" });
    expect(updateSet.mock.calls[1]?.[0]).toMatchObject({ plan: "canceled" });
  });
});

describe("POST /api/webhooks/stripe — invoice events", () => {
  it("invoice.payment_failed → past_due", async () => {
    constructEventMock.mockReturnValue({
      type: "invoice.payment_failed",
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_123" } },
        },
      },
    });
    const updateSet = setupUpdate();

    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "past_due" })
    );
  });

  it("invoice.paid → active", async () => {
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: {
        object: {
          parent: { subscription_details: { subscription: "sub_123" } },
        },
      },
    });
    const updateSet = setupUpdate();

    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({ status: "active" })
    );
  });

  it("invoice.paid with no subscription → no DB write", async () => {
    constructEventMock.mockReturnValue({
      type: "invoice.paid",
      data: { object: { parent: null } },
    });
    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("ignores unknown event types (no handler)", async () => {
    constructEventMock.mockReturnValue({
      type: "ping",
      data: { object: {} },
    });
    const res = await mod.POST(makeReq("{}", { "stripe-signature": "sig" }));
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });
});
