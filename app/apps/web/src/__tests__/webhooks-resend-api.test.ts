import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
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

vi.mock("@/lib/enrollment", () => ({
  pauseEnrollment: vi.fn().mockResolvedValue(undefined),
}));

import { db } from "@/db";
import { pauseEnrollment } from "@/lib/enrollment";

const mod = await import("@/app/api/webhooks/resend/route");

const origNodeEnv = process.env.NODE_ENV;
const origSecret = process.env.RESEND_WEBHOOK_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  // Force dev mode + no secret so verifyResendSignature accepts everything.
  // The signature path itself isn't tested here; the prod-locked branch is
  // exercised separately below.
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("RESEND_WEBHOOK_SECRET", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  // Belt-and-braces in case the runtime ignored unstub for some keys.
  if (origNodeEnv !== undefined) vi.stubEnv("NODE_ENV", origNodeEnv);
  if (origSecret !== undefined) vi.stubEnv("RESEND_WEBHOOK_SECRET", origSecret);
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
  ...overrides,
});

function mockSelectOnce(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/webhooks/resend", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/webhooks/resend — dev mode (no secret)", () => {
  it("400 on payload missing type/data", async () => {
    const res = await mod.POST(makeReq({ type: "x" }));
    expect(res.status).toBe(400);
  });

  it("200 ignore when message_id missing", async () => {
    const res = await mod.POST(
      makeReq({ type: "email.delivered", data: {} })
    );
    expect(res.status).toBe(200);
  });

  it("200 ignore when no matching outboundEmail row", async () => {
    mockSelectOnce([]);
    const res = await mod.POST(
      makeReq({ type: "email.delivered", data: { email_id: "msg_unknown" } })
    );
    expect(res.status).toBe(200);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("email.delivered → updates status + deliveredAt", async () => {
    mockSelectOnce([emailRow()]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const res = await mod.POST(
      makeReq({ type: "email.delivered", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(200);
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: "delivered" })
    );
  });

  it("email.opened — first open updates openedAt", async () => {
    mockSelectOnce([emailRow({ openedAt: null })]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    await mod.POST(makeReq({ type: "email.opened", data: { email_id: "msg_abc" } }));
    expect(setFn).toHaveBeenCalledWith(
      expect.objectContaining({ openedAt: expect.any(Date) })
    );
  });

  it("email.opened — second open is a no-op (idempotent)", async () => {
    mockSelectOnce([emailRow({ openedAt: new Date("2026-01-01") })]);
    await mod.POST(makeReq({ type: "email.opened", data: { email_id: "msg_abc" } }));
    expect(db.update).not.toHaveBeenCalled();
  });

  it("email.clicked — first click only", async () => {
    mockSelectOnce([emailRow({ clickedAt: new Date("2026-01-01") })]);
    await mod.POST(makeReq({ type: "email.clicked", data: { email_id: "msg_abc" } }));
    expect(db.update).not.toHaveBeenCalled();
  });

  it("email.bounced (hard) → pauses enrollment + opt-out + mailbox bump", async () => {
    mockSelectOnce([emailRow()]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const insertOnConflict = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    const res = await mod.POST(
      makeReq({
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

  it("email.bounced (soft) → status update only, no enrollment pause / opt-out", async () => {
    mockSelectOnce([emailRow()]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    await mod.POST(
      makeReq({
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

  it("email.complained → opt-out + pause + mailbox health drop", async () => {
    mockSelectOnce([emailRow()]);
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const setFn = vi.fn().mockReturnValue({ where: updateWhere });
    vi.mocked(db.update).mockReturnValue({ set: setFn } as never);

    const insertOnConflict = vi.fn().mockResolvedValue(undefined);
    const valuesFn = vi.fn().mockReturnValue({ onConflictDoNothing: insertOnConflict });
    vi.mocked(db.insert).mockReturnValue({ values: valuesFn } as never);

    const res = await mod.POST(
      makeReq({ type: "email.complained", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(200);
    expect(pauseEnrollment).toHaveBeenCalledWith("enr-1", "complained");
    expect(valuesFn).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "unsubscribe" })
    );
  });
});

describe("POST /api/webhooks/resend — prod mode (signature required)", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_WEBHOOK_SECRET", ""); // prod + no secret → reject
  });

  it("401 in prod when no secret configured", async () => {
    const res = await mod.POST(
      makeReq({ type: "email.delivered", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(401);
  });

  it("401 in prod when signature headers missing despite secret set", async () => {
    vi.stubEnv("RESEND_WEBHOOK_SECRET", "whsec_dGVzdC1zZWNyZXQ=");
    const res = await mod.POST(
      makeReq({ type: "email.delivered", data: { email_id: "msg_abc" } })
    );
    expect(res.status).toBe(401);
  });
});
