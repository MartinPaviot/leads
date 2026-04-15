import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  referralCreditEvents: {
    id: "referralCreditEvents.id",
    tenantId: "referralCreditEvents.tenantId",
    eventType: "referralCreditEvents.eventType",
    amountCents: "referralCreditEvents.amountCents",
    stripeBalanceTxnId: "referralCreditEvents.stripeBalanceTxnId",
  },
}));

vi.mock("@/db/billing-schema", () => ({
  subscriptions: {
    tenantId: "subscriptions.tenantId",
    stripeCustomerId: "subscriptions.stripeCustomerId",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  isNull: vi.fn(),
  gt: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  // Module singleton off by default; individual tests inject a client.
  stripe: null,
}));

import { db } from "@/db";
import { pushCreditToStripe, backfillPendingCredits } from "@/lib/pricing/credits";

type SelectStub = ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

/** Queue responses for select chains that end in .limit() (single-row reads). */
function queueSelectLimit(rows: unknown[]) {
  (db.select as SelectStub).mockImplementationOnce(() => ({
    from: () => ({
      where: () => ({
        limit: () => Promise.resolve(rows),
      }),
    }),
  }));
}

/** Queue a response for a select chain that ends at .where() (no limit). */
function queueSelectWhere(rows: unknown[]) {
  (db.select as SelectStub).mockImplementationOnce(() => ({
    from: () => ({
      where: () => Promise.resolve(rows),
    }),
  }));
}

function queueUpdateOk() {
  (db.update as SelectStub).mockImplementationOnce(() => ({
    set: () => ({
      where: () => Promise.resolve(),
    }),
  }));
}

function queueUpdateThrows(err: Error) {
  (db.update as SelectStub).mockImplementationOnce(() => ({
    set: () => ({
      where: () => Promise.reject(err),
    }),
  }));
}

function makeStubStripe(overrides: Partial<{
  create: (args: unknown, opts: unknown) => Promise<unknown>;
}> = {}) {
  const createSpy = vi.fn(async (..._args: unknown[]) => ({
    id: "cbtxn_test_1",
    amount: -4900,
    currency: "usd",
    description: "Elevay referral credit",
    type: "adjustment",
  }));
  if (overrides.create) createSpy.mockImplementation(overrides.create as never);
  return {
    customers: {
      createBalanceTransaction: createSpy,
    },
    _spy: createSpy,
  } as never;
}

describe("pushCreditToStripe", () => {
  it("skips when Stripe is not configured", async () => {
    const r = await pushCreditToStripe("t1", "evt1", 4900, { stripeClient: null });
    expect(r.status).toBe("skipped");
    expect(r.reason).toBe("stripe_not_configured");
  });

  it("skips on non-positive amounts (zero or negative refunds)", async () => {
    const stubbed = makeStubStripe();
    const r0 = await pushCreditToStripe("t1", "evt1", 0, { stripeClient: stubbed });
    const rNeg = await pushCreditToStripe("t1", "evt1", -100, { stripeClient: stubbed });
    expect(r0.status).toBe("skipped");
    expect(rNeg.status).toBe("skipped");
    expect(stubbed._spy).not.toHaveBeenCalled();
  });

  it("short-circuits when the event already has a Stripe txn id", async () => {
    queueSelectLimit([{ stripeBalanceTxnId: "cbtxn_existing" }]);
    const stubbed = makeStubStripe();
    const r = await pushCreditToStripe("t1", "evt1", 4900, { stripeClient: stubbed });
    expect(r.status).toBe("already_pushed");
    expect(r.stripeBalanceTxnId).toBe("cbtxn_existing");
    expect(stubbed._spy).not.toHaveBeenCalled();
  });

  it("returns 'pending' when the tenant has no Stripe customer yet", async () => {
    queueSelectLimit([{ stripeBalanceTxnId: null }]); // event row, unpushed
    queueSelectLimit([]); // subscriptions row, none
    const stubbed = makeStubStripe();
    const r = await pushCreditToStripe("t1", "evt1", 4900, { stripeClient: stubbed });
    expect(r.status).toBe("pending");
    expect(r.reason).toBe("no_stripe_customer");
    expect(stubbed._spy).not.toHaveBeenCalled();
  });

  it("calls Stripe with the right shape (negative amount, idempotency key, metadata)", async () => {
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([{ stripeCustomerId: "cus_1" }]);
    queueUpdateOk();
    const stubbed = makeStubStripe();
    const r = await pushCreditToStripe("t1", "evt1", 4900, { stripeClient: stubbed });
    expect(r.status).toBe("pushed");
    expect(r.stripeBalanceTxnId).toBe("cbtxn_test_1");
    expect(stubbed._spy).toHaveBeenCalledOnce();
    const [customerId, body, options] = stubbed._spy.mock.calls[0] as [
      string,
      Record<string, unknown>,
      Record<string, unknown>,
    ];
    expect(customerId).toBe("cus_1");
    expect(body.amount).toBe(-4900); // NEGATIVE — credit reduces balance
    expect(body.currency).toBe("usd");
    expect((body.metadata as Record<string, unknown>).tenantId).toBe("t1");
    expect((body.metadata as Record<string, unknown>).creditEventId).toBe("evt1");
    expect(options.idempotencyKey).toBe("referral_credit:evt1");
  });

  it("returns 'pending' on Stripe error (does not throw)", async () => {
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([{ stripeCustomerId: "cus_1" }]);
    const stubbed = makeStubStripe({
      create: async () => {
        throw new Error("stripe temporarily unavailable");
      },
    });
    const r = await pushCreditToStripe("t1", "evt1", 4900, { stripeClient: stubbed });
    expect(r.status).toBe("pending");
    expect(r.reason).toBe("stripe_error");
  });

  it("tolerates a unique-violation on the update (race with concurrent push)", async () => {
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([{ stripeCustomerId: "cus_1" }]);
    queueUpdateThrows(new Error("duplicate key value violates unique constraint"));
    const stubbed = makeStubStripe();
    const r = await pushCreditToStripe("t1", "evt1", 4900, { stripeClient: stubbed });
    expect(r.status).toBe("pushed");
  });

  it("rethrows non-unique DB errors on the update", async () => {
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([{ stripeCustomerId: "cus_1" }]);
    queueUpdateThrows(new Error("connection refused"));
    const stubbed = makeStubStripe();
    await expect(
      pushCreditToStripe("t1", "evt1", 4900, { stripeClient: stubbed })
    ).rejects.toThrow(/connection refused/);
  });

  it("uses rounded integer cents (defends against float inputs)", async () => {
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([{ stripeCustomerId: "cus_1" }]);
    queueUpdateOk();
    const stubbed = makeStubStripe();
    await pushCreditToStripe("t1", "evt1", 4900.9, { stripeClient: stubbed });
    const [, body] = stubbed._spy.mock.calls[0] as [string, Record<string, unknown>];
    expect(body.amount).toBe(-4900); // floor, not round
    expect(Number.isInteger(body.amount)).toBe(true);
  });
});

describe("backfillPendingCredits", () => {
  it("returns zeros when there are no pending rows", async () => {
    queueSelectWhere([]); // outer pending-events read
    const stubbed = makeStubStripe();
    const r = await backfillPendingCredits("t1", { stripeClient: stubbed });
    expect(r).toEqual({ attempted: 0, pushed: 0, pending: 0, errors: 0 });
    expect(stubbed._spy).not.toHaveBeenCalled();
  });

  it("pushes every pending event when the customer exists", async () => {
    queueSelectWhere([
      { id: "evt1", amountCents: 4900 },
      { id: "evt2", amountCents: 4900 },
    ]);
    // Per event: read event row (unpushed) + read sub + update.
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([{ stripeCustomerId: "cus_1" }]);
    queueUpdateOk();
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([{ stripeCustomerId: "cus_1" }]);
    queueUpdateOk();
    const stubbed = makeStubStripe();
    const r = await backfillPendingCredits("t1", { stripeClient: stubbed });
    expect(r).toEqual({ attempted: 2, pushed: 2, pending: 0, errors: 0 });
    expect(stubbed._spy).toHaveBeenCalledTimes(2);
  });

  it("counts pending rows separately from errors", async () => {
    queueSelectWhere([{ id: "evt1", amountCents: 4900 }]);
    queueSelectLimit([{ stripeBalanceTxnId: null }]);
    queueSelectLimit([]); // no customer yet for this tenant
    const stubbed = makeStubStripe();
    const r = await backfillPendingCredits("t1", { stripeClient: stubbed });
    expect(r).toEqual({ attempted: 1, pushed: 0, pending: 1, errors: 0 });
  });
});
