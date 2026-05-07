import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const constructEventMock = vi.fn();
const subscriptionsRetrieveMock = vi.fn();

vi.mock("@/lib/billing/stripe", () => ({
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
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
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

/**
 * Build a chainable + destructurable mock that resolves to `data`.
 * Supports both `await chain` and `const [first] = await chain`.
 */
function createChain(data: unknown[] = []) {
  const chain: any = {};
  const methods = [
    "select","from","leftJoin","innerJoin","where","groupBy",
    "orderBy","limit","offset","set","values","returning",
    "onConflictDoUpdate","onConflictDoNothing",
  ];
  for (const m of methods) chain[m] = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(data).then(resolve);
  chain[Symbol.iterator] = function* () { yield* data; };
  for (let i = 0; i < data.length; i++) chain[i] = data[i];
  chain.length = data.length;
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");
  vi.stubEnv("STRIPE_STARTER_PRICE_ID", "price_starter");
  vi.stubEnv("STRIPE_PRO_PRICE_ID", "price_pro");
  // Default chains that resolve to empty arrays
  vi.mocked(db.select).mockReturnValue(createChain() as never);
  vi.mocked(db.insert).mockReturnValue(createChain() as never);
  vi.mocked(db.update).mockReturnValue(createChain() as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function mockSelectOnce(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValueOnce(createChain(rows) as never);
}

function setupUpdate() {
  const setFn = vi.fn();
  const chain = createChain();
  chain.set = setFn;
  setFn.mockReturnValue(chain);
  vi.mocked(db.update).mockReturnValue(chain as never);
  return setFn;
}

function setupInsert() {
  const valuesFn = vi.fn();
  const chain = createChain();
  chain.values = valuesFn;
  valuesFn.mockReturnValue(chain);
  vi.mocked(db.insert).mockReturnValue(chain as never);
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
