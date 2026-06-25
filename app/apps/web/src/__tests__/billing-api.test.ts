import { describe, it, expect, vi, beforeEach } from "vitest";

const customersCreate = vi.fn();
const checkoutCreate = vi.fn();
const portalCreate = vi.fn();

vi.mock("@/lib/billing/stripe", () => ({
  get stripe() {
    return _stripeHandle;
  },
}));

let _stripeHandle: unknown = {
  customers: { create: customersCreate },
  checkout: { sessions: { create: checkoutCreate } },
  billingPortal: { sessions: { create: portalCreate } },
};

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
  withAuthRLS: vi.fn(async (handler) => { const ctx = await (await import("@/lib/auth/auth-utils")).getAuthContext(); if (!ctx) return Response.json({ error: "Unauthorized" }, { status: 401 }); return handler(ctx); }),
  requireAdmin: (ctx: { role?: string } | null) => (ctx?.role === "admin" ? null : Response.json({ error: "Admin only" }, { status: 403 })),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
  systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
  agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
  knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
  users: { clerkId: "clerkId", tenantId: "tenantId", email: "email" },
  tenants: { id: "id", plan: "plan" },
}));

vi.mock("@/db/billing-schema", () => ({
  subscriptions: {
    tenantId: "tenantId",
    stripeCustomerId: "stripeCustomerId",
    status: "status",
    stripePriceId: "stripePriceId",
    currentPeriodEnd: "currentPeriodEnd",
    trialEnd: "trialEnd",
    cancelAtPeriodEnd: "cancelAtPeriodEnd",
    createdAt: "createdAt",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(() => "sql-frag"),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const checkoutMod = await import("@/app/api/billing/checkout/route");
const portalMod = await import("@/app/api/billing/portal/route");
const subMod = await import("@/app/api/billing/subscription/route");

const authCtx = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "admin" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");
  // Reset default stripe handle to the working mock set
  _stripeHandle = {
    customers: { create: customersCreate },
    checkout: { sessions: { create: checkoutCreate } },
    billingPortal: { sessions: { create: portalCreate } },
  };
});

function mockSelectOnce(rows: unknown[], opts: { orderedLimit?: boolean } = {}) {
  const terminator = vi.fn().mockResolvedValue(rows);
  if (opts.orderedLimit) {
    const orderFn = vi.fn().mockReturnValue({ limit: terminator });
    const whereFn = vi.fn().mockReturnValue({ orderBy: orderFn });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
  } else {
    const limitFn = vi.fn().mockReturnValue(terminator());
    // When no .limit() is called (tenants lookup), terminator resolves directly
    const whereFn = vi.fn().mockImplementation(() => {
      // Expose both: support both paths (with .limit() or without).
      return { limit: limitFn, then: terminator().then.bind(terminator()) };
    });
    const fromFn = vi.fn().mockReturnValue({ where: whereFn });
    vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
  }
}

function mockSelectWithLimit(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function mockSelectNoLimit(rows: unknown[]) {
  const whereFn = vi.fn().mockResolvedValue(rows);
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function mockSelectOrderedLimit(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const orderFn = vi.fn().mockReturnValue({ limit: limitFn });
  const whereFn = vi.fn().mockReturnValue({ orderBy: orderFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function jsonReq(url: string, body?: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// ============================================================
// POST /api/billing/checkout
// ============================================================

describe("POST /api/billing/checkout", () => {
  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await checkoutMod.POST(
      jsonReq("http://localhost/api/billing/checkout", { priceId: "price_x" })
    );
    expect(res.status).toBe(401);
  });

  it("503 when Stripe is not configured", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    _stripeHandle = null;
    const res = await checkoutMod.POST(
      jsonReq("http://localhost/api/billing/checkout", { priceId: "price_x" })
    );
    expect(res.status).toBe(503);
  });

  it("400 when priceId missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await checkoutMod.POST(
      jsonReq("http://localhost/api/billing/checkout", {})
    );
    expect(res.status).toBe(400);
  });

  it("404 when user row not found", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectNoLimit([]); // users lookup returns []
    const res = await checkoutMod.POST(
      jsonReq("http://localhost/api/billing/checkout", { priceId: "price_x" })
    );
    expect(res.status).toBe(404);
  });

  it("reuses existing Stripe customer from subscriptions row", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectNoLimit([{ id: "u1", email: "bob@acme.com" }]);
    mockSelectWithLimit([{ stripeCustomerId: "cus_existing" }]);
    checkoutCreate.mockResolvedValue({ url: "https://checkout.test/x" });

    const res = await checkoutMod.POST(
      jsonReq("http://localhost/api/billing/checkout", { priceId: "price_pro" })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).url).toBe("https://checkout.test/x");
    expect(customersCreate).not.toHaveBeenCalled();
    expect(checkoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_existing",
        line_items: [{ price: "price_pro", quantity: 1 }],
        subscription_data: expect.objectContaining({
          trial_period_days: 14,
          metadata: { tenantId: "t1" },
        }),
      })
    );
  });

  it("creates new customer + subscription row when none exists", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectNoLimit([{ id: "u1", email: "alice@acme.com" }]);
    mockSelectWithLimit([]); // no existing sub
    customersCreate.mockResolvedValue({ id: "cus_new" });
    checkoutCreate.mockResolvedValue({ url: "https://checkout.test/new" });

    const insertValues = vi.fn().mockResolvedValue(undefined);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never);

    const res = await checkoutMod.POST(
      jsonReq("http://localhost/api/billing/checkout", { priceId: "price_pro" })
    );
    expect(res.status).toBe(200);
    expect(customersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: "alice@acme.com", metadata: { tenantId: "t1" } })
    );
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        stripeCustomerId: "cus_new",
        status: "trialing",
      })
    );
  });

  it("500 when Stripe checkout creation throws", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectNoLimit([{ id: "u1", email: "bob@acme.com" }]);
    mockSelectWithLimit([{ stripeCustomerId: "cus_existing" }]);
    checkoutCreate.mockRejectedValue(new Error("Stripe API down"));

    const res = await checkoutMod.POST(
      jsonReq("http://localhost/api/billing/checkout", { priceId: "price_x" })
    );
    expect(res.status).toBe(500);
  });
});

// ============================================================
// POST /api/billing/portal
// ============================================================

describe("POST /api/billing/portal", () => {
  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await portalMod.POST();
    expect(res.status).toBe(401);
  });

  it("503 when Stripe not configured", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    _stripeHandle = null;
    const res = await portalMod.POST();
    expect(res.status).toBe(503);
  });

  it("404 when no subscription row exists", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectWithLimit([]);
    const res = await portalMod.POST();
    expect(res.status).toBe(404);
  });

  it("404 when subscription row has no stripeCustomerId", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectWithLimit([{ stripeCustomerId: null }]);
    const res = await portalMod.POST();
    expect(res.status).toBe(404);
  });

  it("returns portal url from Stripe billingPortal.sessions.create", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectWithLimit([{ stripeCustomerId: "cus_abc" }]);
    portalCreate.mockResolvedValue({ url: "https://billing.stripe.test/portal/abc" });

    const res = await portalMod.POST();
    expect(res.status).toBe(200);
    expect((await res.json()).url).toContain("portal");
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_abc",
        return_url: "https://app.test/settings/billing",
      })
    );
  });
});

// ============================================================
// GET /api/billing/subscription
// ============================================================

describe("GET /api/billing/subscription", () => {
  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await subMod.GET();
    expect(res.status).toBe(401);
  });

  it("returns trial shape for a tenant with no subscription row", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectNoLimit([{ plan: "trial" }]);
    mockSelectOrderedLimit([]); // no sub

    const res = await subMod.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      plan: "trial",
      status: null,
      stripeCustomerId: null,
      cancelAtPeriodEnd: false,
    });
  });

  it("surfaces subscription status + period + trial dates when present", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectNoLimit([{ plan: "pro" }]);
    const trialEnd = new Date("2026-05-01");
    const periodEnd = new Date("2026-06-01");
    mockSelectOrderedLimit([
      {
        status: "active",
        stripePriceId: "price_pro",
        stripeCustomerId: "cus_xyz",
        currentPeriodEnd: periodEnd,
        trialEnd,
        cancelAtPeriodEnd: true,
      },
    ]);

    const res = await subMod.GET();
    const body = await res.json();
    expect(body).toMatchObject({
      plan: "pro",
      status: "active",
      stripePriceId: "price_pro",
      stripeCustomerId: "cus_xyz",
      cancelAtPeriodEnd: true,
      currentPeriodEnd: periodEnd.toISOString(),
      trialEnd: trialEnd.toISOString(),
    });
  });
});
