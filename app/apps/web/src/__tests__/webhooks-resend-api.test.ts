import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "crypto";

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
  tenants: { id: "id", name: "name", settings: "settings", domain: "domain", stripeCustomerId: "stripe_customer_id", subscriptionId: "subscription_id", plan: "plan", createdAt: "created_at", updatedAt: "updated_at", referralCode: "referral_code" },
  outboundEmails: {
    id: "id",
    messageId: "messageId",
    status: "status",
    deliveredAt: "deliveredAt",
    openedAt: "openedAt",
    clickedAt: "clickedAt",
    bouncedAt: "bouncedAt",
    bounceType: "bounceType",
    errorMessage: "errorMessage",
    enrollmentId: "enrollmentId",
    mailboxId: "mailboxId",
    tenantId: "tenantId",
    toAddress: "toAddress",
    updatedAt: "updatedAt",
    contactId: "contactId",
    subject: "subject",
  },
  connectedMailboxes: {
    id: "id",
    bounceCount7d: "bounceCount7d",
    healthScore: "healthScore",
    updatedAt: "updatedAt",
  },
  sequenceEnrollments: {},
  emailOptouts: {
    tenantId: "tenantId",
    emailAddress: "emailAddress",
    reason: "reason",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(() => "sql-fragment"),
}));

vi.mock("@/lib/sequences/enrollment", () => ({
  pauseEnrollment: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/outcomes/resolve", () => ({
  checkEmailOutcomes: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/analytics/pipeline-tracker", () => ({
  trackPipeline: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/db";
import { pauseEnrollment } from "@/lib/sequences/enrollment";

const mod = await import("@/app/api/webhooks/resend/route");

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

/* ── Svix signature helper ── */
const TEST_SVIX_SECRET = "whsec_dGVzdC1zZWNyZXQ="; // base64-encoded "test-secret"
const TEST_SVIX_ID = "msg_test123";

function svixSign(body: string, timestamp?: number): Record<string, string> {
  const ts = timestamp ?? Math.floor(Date.now() / 1000);
  const secretBytes = Buffer.from(
    TEST_SVIX_SECRET.slice("whsec_".length),
    "base64"
  );
  const toSign = `${TEST_SVIX_ID}.${ts}.${body}`;
  const sig = createHmac("sha256", secretBytes).update(toSign).digest("base64");
  return {
    "svix-id": TEST_SVIX_ID,
    "svix-timestamp": String(ts),
    "svix-signature": `v1,${sig}`,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("RESEND_WEBHOOK_SECRET", TEST_SVIX_SECRET);
  // Default chains
  vi.mocked(db.select).mockReturnValue(createChain() as never);
  vi.mocked(db.insert).mockReturnValue(createChain() as never);
  vi.mocked(db.update).mockReturnValue(createChain() as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const emailRow = (overrides: Record<string, unknown> = {}) => ({
  id: "email-1",
  messageId: "msg_abc",
  tenantId: "t1",
  enrollmentId: "enr-1",
  mailboxId: "mb-1",
  toAddress: "Bob@Acme.com",
  openedAt: null,
  clickedAt: null,
  contactId: null,
  subject: "Test subject",
  ...overrides,
});

function mockSelectOnce(rows: unknown[]) {
  vi.mocked(db.select).mockReturnValueOnce(createChain(rows) as never);
}

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: bodyStr,
  });
}

/** Build a signed request with proper Svix headers. */
function makeSignedReq(payload: unknown): Request {
  const bodyStr = JSON.stringify(payload);
  const sigHeaders = svixSign(bodyStr);
  return makeReq(bodyStr, sigHeaders);
}

describe("POST /api/webhooks/resend — signed requests", () => {
  it("400 on payload missing type/data", async () => {
    const res = await mod.POST(makeSignedReq({ type: "x" }));
    expect(res.status).toBe(400);
  });

  it("200 ignore when message_id missing", async () => {
    const res = await mod.POST(
      makeSignedReq({ type: "email.delivered", data: {} })
    );
    expect(res.status).toBe(200);
  });

  it("200 ignore when no matching outboundEmail row", async () => {
    mockSelectOnce([]);
    const res = await mod.POST(
      makeSignedReq({ type: "email.delivered", data: { email_id: "msg_unknown" } })
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("email.delivered — updates status + deliveredAt", async () => {
    mockSelectOnce([emailRow()]);
    const updateChain = createChain();
    const setFn = vi.fn().mockReturnValue(updateChain);
    (updateChain as Record<string, unknown>).set = setFn;
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const res = await mod.POST(
      makeSignedReq({ type: "email.delivered", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered" })
    );
  });

  it("email.opened — first open updates openedAt", async () => {
    mockSelectOnce([emailRow({ openedAt: null })]);
    const updateChain = createChain();
    const setFn = vi.fn().mockReturnValue(updateChain);
    (updateChain as Record<string, unknown>).set = setFn;
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    await mod.POST(makeSignedReq({ type: "email.opened", data: { email_id: "msg_abc" } }));
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ openedAt: expect.any(Date) })
    );
  });

  it("email.opened — second open is a no-op (idempotent)", async () => {
    mockSelectOnce([emailRow({ openedAt: new Date("2026-01-01") })]);
    await mod.POST(makeSignedReq({ type: "email.opened", data: { email_id: "msg_abc" } }));
    expect(db.update).not.toHaveBeenCalled();
  });

  it("email.clicked — first click only", async () => {
    mockSelectOnce([emailRow({ clickedAt: new Date("2026-01-01") })]);
    await mod.POST(makeSignedReq({ type: "email.clicked", data: { email_id: "msg_abc" } }));
    expect(db.update).not.toHaveBeenCalled();
  });

  it("email.bounced (hard) — pauses enrollment + opt-out + mailbox bump", async () => {
    mockSelectOnce([emailRow()]);
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
        type: "email.bounced",
        data: {
          email_id: "msg_abc",
          bounce: { type: "hard", description: "550 user unknown" },
        },
      })
    );
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "bounced", bounceType: "permanent" })
    );
    expect(pauseEnrollment).toHaveBeenCalledWith("enr-1", "bounced");
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: "bob@acme.com", // lowercased
        reason: "bounce_hard",
      })
    );
  });

  it("email.bounced (soft) — status update only, no enrollment pause / opt-out", async () => {
    mockSelectOnce([emailRow()]);
    const updateChain = createChain();
    const setFn = vi.fn().mockReturnValue(updateChain);
    (updateChain as Record<string, unknown>).set = setFn;
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    await mod.POST(
      makeSignedReq({
        type: "email.bounced",
        data: { email_id: "msg_abc", bounce: { type: "soft" } },
      })
    );
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ bounceType: "temporary" })
    );
    expect(pauseEnrollment).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("email.complained — opt-out + pause + mailbox health drop", async () => {
    mockSelectOnce([emailRow()]);
    const updateChain = createChain();
    const setFn = vi.fn().mockReturnValue(updateChain);
    (updateChain as Record<string, unknown>).set = setFn;
    vi.mocked(db.update).mockReturnValue(updateChain as never);

    const insertChain = createChain();
    const valuesFn = vi.fn().mockReturnValue(insertChain);
    (insertChain as Record<string, unknown>).values = valuesFn;
    vi.mocked(db.insert).mockReturnValue(insertChain as never);

    const res = await mod.POST(
      makeSignedReq({ type: "email.complained", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(200);
    expect(pauseEnrollment).toHaveBeenCalledWith("enr-1", "complained");
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "complaint" })
    );
  });
});

describe("POST /api/webhooks/resend — signature rejection", () => {
  it("401 when no secret configured", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
    const res = await mod.POST(
      makeReq({ type: "email.delivered", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(401);
  });

  it("401 when signature headers missing despite secret set", async () => {
    // Secret is set (from beforeEach) but request has no svix-* headers
    const res = await mod.POST(
      makeReq({ type: "email.delivered", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(401);
  });
});
