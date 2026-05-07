import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "crypto";

// ── Mocks ─────────────────────────────────────────────────────
// Drizzle / db: every chain returns a thenable that resolves to []
// or to whatever the test sets via `mockSelectResult` / `mockInsertResult`.
// Approach: each chained call returns the same object so awaiting at
// any depth resolves the same way.

let mockSelectResult: unknown[] = [];
let mockInsertReturning: unknown[] = [];

const chain: any = {
  from: vi.fn(() => chain),
  where: vi.fn(() => chain),
  limit: vi.fn(() => chain),
  set: vi.fn(() => chain),
  values: vi.fn(() => chain),
  returning: vi.fn(() => chain),
  then: (resolve: any) => resolve(mockSelectResult),
};

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
  },
}));

vi.mock("@/db/schema", () => ({
  contacts: { id: "id", tenantId: "tenant_id", email: "email", companyId: "company_id", properties: "properties" },
  companies: { id: "id", tenantId: "tenant_id", domain: "domain", name: "name" },
  activities: {},
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

const inngestSend = vi.fn().mockResolvedValue(undefined);
vi.mock("@/inngest/client", () => ({ inngest: { send: inngestSend } }));

vi.mock("@/lib/observability/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const mod = await import("@/app/api/webhooks/inbound/route");

const SECRET = "test-secret";
process.env.INBOUND_WEBHOOK_SECRET = SECRET;

function signed(body: string, ts: number = Math.floor(Date.now() / 1000)) {
  const sig = createHmac("sha256", SECRET).update(`${ts}.${body}`).digest("base64");
  return new Request("http://localhost/api/webhooks/inbound", {
    method: "POST",
    headers: {
      "x-elevay-timestamp": String(ts),
      "x-elevay-signature": `v1,${sig}`,
      "content-type": "application/json",
    },
    body,
  });
}

describe("POST /api/webhooks/inbound", () => {
  beforeEach(() => {
    mockSelectResult = [];
    mockInsertReturning = [];
    inngestSend.mockClear();
    chain.from.mockClear();
    chain.where.mockClear();
    chain.limit.mockClear();
    chain.set.mockClear();
    chain.values.mockClear();
    chain.returning.mockClear();
  });

  it("rejects when signature header is missing", async () => {
    const req = new Request("http://localhost/api/webhooks/inbound", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects when signature is wrong", async () => {
    const body = JSON.stringify({ tenantId: "t1", formProviderEventId: "evt12345", email: "j@acme.com" });
    const ts = Math.floor(Date.now() / 1000);
    const req = new Request("http://localhost/api/webhooks/inbound", {
      method: "POST",
      headers: {
        "x-elevay-timestamp": String(ts),
        "x-elevay-signature": "v1,obviously-wrong-base64",
        "content-type": "application/json",
      },
      body,
    });
    const res = await mod.POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects when timestamp is too old (replay window)", async () => {
    const body = JSON.stringify({ tenantId: "t1", formProviderEventId: "evt12345", email: "j@acme.com" });
    const oldTs = Math.floor(Date.now() / 1000) - 3600; // 1h ago
    const req = signed(body, oldTs);
    const res = await mod.POST(req);
    expect(res.status).toBe(401);
  });

  it("rejects malformed payload (400)", async () => {
    const body = JSON.stringify({ tenantId: "t1" }); // missing email + formProviderEventId
    const req = signed(body);
    const res = await mod.POST(req);
    expect(res.status).toBe(400);
  });

  it("returns idempotent response on replay of same formProviderEventId", async () => {
    // Existing contact with the same formProviderEventId stored.
    mockSelectResult = [
      {
        id: "c1",
        companyId: "co1",
        properties: { lastFormSubmissionEventId: "evt-replay-123" },
      },
    ];
    const body = JSON.stringify({
      tenantId: "t1",
      formProviderEventId: "evt-replay-123",
      email: "jane@acme.com",
    });
    const res = await mod.POST(signed(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.deduped).toBe(true);
    expect(json.contactId).toBe("c1");
    // No inngest event should be emitted on a dedupe.
    expect(inngestSend).not.toHaveBeenCalled();
  });

  it("emits contact/created on a new corporate-email submission", async () => {
    // First select (findContactByEmail) → no existing contact.
    // Second select (upsertCompanyForDomain) → no existing company.
    // First insert returning → company created with id "co-new".
    // Second insert returning → contact created with id "c-new".
    let selectCallCount = 0;
    chain.then = (resolve: any) => {
      selectCallCount++;
      if (selectCallCount === 1) return resolve([]); // contact lookup
      if (selectCallCount === 2) return resolve([]); // company lookup
      return resolve([]);
    };
    chain.returning = vi.fn(() => ({
      then: (resolve: any) => resolve([{ id: selectCallCount === 2 ? "co-new" : "c-new" }]),
    }));

    const body = JSON.stringify({
      tenantId: "t1",
      formProviderEventId: "evt-new-1",
      source: "demo_request",
      email: "jane@acme.com",
      firstName: "Jane",
      lastName: "Doe",
    });
    const res = await mod.POST(signed(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.requiresManualMatch).toBe(false);
    expect(inngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "contact/created",
        data: expect.objectContaining({ tenantId: "t1", source: "demo_request" }),
      }),
    );
  });

  it("flags free-email submissions as requiresManualMatch and skips company resolution", async () => {
    chain.then = (resolve: any) => resolve([]); // no existing contact
    chain.returning = vi.fn(() => ({
      then: (resolve: any) => resolve([{ id: "c-gmail" }]),
    }));

    const body = JSON.stringify({
      tenantId: "t1",
      formProviderEventId: "evt-gmail-1",
      email: "jane@gmail.com",
    });
    const res = await mod.POST(signed(body));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.requiresManualMatch).toBe(true);
    expect(json.companyId).toBeNull();
  });
});
