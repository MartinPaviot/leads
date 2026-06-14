import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => {
  // The webhook route's capture pipeline imports a growing set of schema tables
  // (activities, contacts, companies, deals, ...). Keep the columns the
  // bounce/reply assertions rely on explicit, and return a generic table
  // placeholder for any OTHER table the code imports so this mock never goes
  // stale again (the prior hand-list broke CI when `activities` was added).
  const known: Record<string, Record<string, string>> = {
    trustEvents: { id: "id", tenantId: "tenant_id", eventType: "event_type", delta: "delta", reason: "reason", createdAt: "created_at" },
    systemTrustScore: { id: "id", tenantId: "tenant_id", score: "score", components: "components", createdAt: "created_at" },
    agentActions: { id: "id", tenantId: "tenant_id", agentId: "agent_id", actionType: "action_type", entityId: "entity_id", summary: "summary", approved: "approved", metadata: "metadata", createdAt: "created_at" },
    knowledgeEntries: { id: "id", tenantId: "tenant_id", title: "title", content: "content", category: "category", metadata: "metadata", createdAt: "created_at" },
    tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
    outboundEmails: {
      id: "id", threadId: "threadId", messageId: "messageId", status: "status",
      bouncedAt: "bouncedAt", bounceType: "bounceType", errorMessage: "errorMessage",
      repliedAt: "repliedAt", replySnippet: "replySnippet", tenantId: "tenantId",
      toAddress: "toAddress", mailboxId: "mailboxId", updatedAt: "updatedAt", contactId: "contactId",
    },
    connectedMailboxes: { id: "id", bounceCount7d: "bounceCount7d", updatedAt: "updatedAt" },
    emailOptouts: { tenantId: "tenantId", emailAddress: "emailAddress", reason: "reason" },
  };
  // A column accessor: returns the property name for any column read on a table.
  const genericTable = () =>
    new Proxy({}, { get: (_t, col) => (typeof col === "string" ? col : undefined) });
  return new Proxy(known, {
    get: (target, prop) => {
      if (typeof prop !== "string" || prop === "__esModule" || prop === "default") return undefined;
      return prop in target ? (target as Record<string, unknown>)[prop] : genericTable();
    },
  });
});

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(() => "sql-fragment"),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { db } from "@/db";

const mod = await import("@/app/api/webhooks/emailengine/route");

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

/* ── HMAC helper ── */
const TEST_SECRET = "test-secret-value";

function hmacSign(body: string): string {
  return crypto.createHmac("sha256", TEST_SECRET).update(body).digest("hex");
}

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/emailengine", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: bodyStr,
  });
}

/** Build a signed request with valid x-ee-signature header. */
function makeSignedReq(payload: unknown): Request {
  const bodyStr = JSON.stringify(payload);
  const sig = hmacSign(bodyStr);
  return makeReq(bodyStr, { "x-ee-signature": sig });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMAILENGINE_WEBHOOK_SECRET", TEST_SECRET);
  // Default chains that resolve to empty arrays
  vi.mocked(db.select).mockReturnValue(createChain() as never);
  vi.mocked(db.insert).mockReturnValue(createChain() as never);
  vi.mocked(db.update).mockReturnValue(createChain() as never);
  // Block accidental fetch hits to the redis-bridge URL during tests.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network blocked in test")));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mockSelectOnce(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValueOnce(createChain(rows) as never);
}

describe("POST /api/webhooks/emailengine — signature gate", () => {
  it("signed request with valid HMAC → 200", async () => {
    const res = await mod.POST(makeSignedReq({ event: "unknown", data: {} }));
    expect(res.status).toBe(200);
  });

  it("no secret configured → 401", async () => {
    vi.stubEnv("EMAILENGINE_WEBHOOK_SECRET", "");
    const res = await mod.POST(makeReq({ event: "messageNew" }));
    expect(res.status).toBe(401);
  });

  it("secret set + missing signature header → 401", async () => {
    const res = await mod.POST(makeReq({ event: "messageNew" }));
    expect(res.status).toBe(401);
  });

  it("secret set + valid HMAC → 200", async () => {
    const body = JSON.stringify({ event: "noop" });
    const sig = hmacSign(body);
    const res = await mod.POST(makeReq(body, { "x-ee-signature": sig }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/webhooks/emailengine — messageNew (reply) handling", () => {
  it("no-op when threadId missing", async () => {
    const res = await mod.POST(
      makeSignedReq({
        event: "messageNew",
        data: { from: "bob@x.com", to: "us@x.com", subject: "hi", text: "..." },
      })
    );
    expect(res.status).toBe(200);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("no-op when threadId doesn't match any outbound email", async () => {
    // First select (inside switch) returns empty, second select (F001 block) also returns empty
    mockSelectOnce([]);
    mockSelectOnce([]);
    const res = await mod.POST(
      makeSignedReq({
        event: "messageNew",
        data: { threadId: "thread-xyz", text: "reply text" },
      })
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("falls back to direct DB update when redis-bridge fetch fails", async () => {
    // First select (inside switch) returns the outbound row
    mockSelectOnce([{ id: "outbound-1", tenantId: "t1" }]);
    // Second select (F001 block) — no contactId so reactor won't fire
    mockSelectOnce([{ id: "outbound-1", tenantId: "t1", contactId: null }]);

    const updateChain = createChain();
    const setFn = vi.fn().mockReturnValue(updateChain);
    (updateChain as Record<string, unknown>).set = setFn;
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const res = await mod.POST(
      makeSignedReq({
        event: "messageNew",
        data: {
          threadId: "thread-xyz",
          text: "Sounds great, let's chat next week",
          messageId: "<reply-1@x.com>",
          from: "bob@x.com",
        },
      })
    );
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({
        repliedAt: expect.any(Date),
        replySnippet: expect.stringContaining("Sounds great"),
      })
    );
  });
});

describe("POST /api/webhooks/emailengine — messageBounce handling", () => {
  it("no-op without messageId", async () => {
    const res = await mod.POST(makeSignedReq({ event: "messageBounce", data: {} }));
    expect(res.status).toBe(200);
    expect(db.select).not.toHaveBeenCalled();
  });

  it("no-op when messageId doesn't match outbound", async () => {
    mockSelectOnce([]);
    const res = await mod.POST(
      makeSignedReq({
        event: "messageBounce",
        data: { messageId: "msg-unknown", bounceMessage: "550 user unknown" },
      })
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("hard bounce: status update + opt-out + mailbox bump", async () => {
    mockSelectOnce([{
      id: "outbound-1",
      tenantId: "t1",
      toAddress: "bounced@x.com",
      mailboxId: "mb-1",
      contactId: null,
    }]);

    const updateChain = createChain();
    const setFn = vi.fn().mockReturnValue(updateChain);
    (updateChain as Record<string, unknown>).set = setFn;
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const insertChain = createChain();
    const valuesFn = vi.fn().mockReturnValue(insertChain);
    (insertChain as Record<string, unknown>).values = valuesFn;
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const res = await mod.POST(
      makeSignedReq({
        event: "messageBounce",
        data: { messageId: "msg-1", bounceMessage: "550 5.1.1 User unknown" },
      })
    );
    expect(res.status).toBe(200);
    // First update = outboundEmails (status=bounced, hard)
    const firstSetCall = setFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstSetCall).toMatchObject({
      status: "bounced",
      bounceType: "hard",
    });
    // Insert opt-out row
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "bounce_hard" })
    );
  });

  it("soft bounce: status update only (no opt-out)", async () => {
    mockSelectOnce([{
      id: "outbound-1",
      tenantId: "t1",
      toAddress: "bounced@x.com",
      mailboxId: null,
      contactId: null,
    }]);

    const updateChain = createChain();
    const setFn = vi.fn().mockReturnValue(updateChain);
    (updateChain as Record<string, unknown>).set = setFn;
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const res = await mod.POST(
      makeSignedReq({
        event: "messageBounce",
        data: { messageId: "msg-1", bounceMessage: "421 try again later" },
      })
    );
    expect(res.status).toBe(200);
    const firstSetCall = setFn.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(firstSetCall).toMatchObject({ bounceType: "soft" });
    expect(db.insert).not.toHaveBeenCalled();
  });
});
