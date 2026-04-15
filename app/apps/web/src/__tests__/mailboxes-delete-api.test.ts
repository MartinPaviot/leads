import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  connectedMailboxes: { id: "id", tenantId: "tenantId", createdAt: "createdAt" },
  outboundEmails: { mailboxId: "mailboxId" },
  warmupEmails: { mailboxId: "mailboxId", targetMailboxId: "targetMailboxId" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
}));

const loggerError = vi.fn();
const loggerWarn = vi.fn();
vi.mock("@/lib/logger", () => ({
  logger: { error: loggerError, warn: loggerWarn, info: vi.fn(), debug: vi.fn() },
}));

import { getAuthContext } from "@/lib/auth-utils";
import { db } from "@/db";

const mod = await import("@/app/api/settings/mailboxes/route");

const authCtx = {
  userId: "auth-1",
  tenantId: "t1",
  appUserId: "u1",
  role: "admin" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EMAILENGINE_URL", "http://ee.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function mockSelectMailbox(rows: unknown[]) {
  const limitFn = vi.fn().mockResolvedValue(rows);
  const whereFn = vi.fn().mockReturnValue({ limit: limitFn });
  const fromFn = vi.fn().mockReturnValue({ where: whereFn });
  vi.mocked(db.select).mockReturnValueOnce({ from: fromFn } as never);
}

function setupDeleteOk() {
  const whereFn = vi.fn().mockResolvedValue(undefined);
  vi.mocked(db.delete).mockReturnValue({ where: whereFn } as never);
  return whereFn;
}

function makeReq(query?: string) {
  return new Request(`http://localhost/api/settings/mailboxes${query ?? ""}`, {
    method: "DELETE",
  });
}

describe("DELETE /api/settings/mailboxes — auth + input gates", () => {
  it("401 unauthenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await mod.DELETE(makeReq("?id=mb-1"));
    expect(res.status).toBe(401);
  });

  it("400 when id missing", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    const res = await mod.DELETE(makeReq());
    expect(res.status).toBe(400);
  });

  it("404 when mailbox not found in caller's tenant", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectMailbox([]);
    const res = await mod.DELETE(makeReq("?id=mb-other-tenant"));
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/settings/mailboxes — happy path with EE up", () => {
  it("calls EE DELETE, clears warmup + outbound, deletes mailbox row, no orphan", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectMailbox([{ id: "mb-1", tenantId: "t1", eeAccountId: "ee-acct-1" }]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    setupDeleteOk();

    const res = await mod.DELETE(makeReq("?id=mb-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.eeOrphaned).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://ee.test/v1/account/ee-acct-1",
      expect.objectContaining({ method: "DELETE" })
    );
    // 3 deletes: warmup, outbound, mailbox
    expect(db.delete).toHaveBeenCalledTimes(3);
    expect(loggerError).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/settings/mailboxes — EE 404 = already gone", () => {
  it("treats 404 as success without retry, does not orphan", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectMailbox([{ id: "mb-1", tenantId: "t1", eeAccountId: "ee-acct-1" }]);
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    vi.stubGlobal("fetch", fetchMock);
    setupDeleteOk();

    const res = await mod.DELETE(makeReq("?id=mb-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).eeOrphaned).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/settings/mailboxes — EE retry behaviour", () => {
  it("retries up to 3 times on 5xx, succeeds on the third", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectMailbox([{ id: "mb-1", tenantId: "t1", eeAccountId: "ee-acct-1" }]);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    setupDeleteOk();

    const res = await mod.DELETE(makeReq("?id=mb-1"));
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((await res.json()).eeOrphaned).toBe(false);
    expect(loggerError).not.toHaveBeenCalled();
  }, 10_000);

  it("logs to Sentry + flips eeOrphaned=true after retries exhausted", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectMailbox([{ id: "mb-1", tenantId: "t1", eeAccountId: "ee-acct-1" }]);
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);
    setupDeleteOk();

    const res = await mod.DELETE(makeReq("?id=mb-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Local cleanup still completes so the user is unblocked.
    expect(body.success).toBe(true);
    expect(body.eeOrphaned).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // logger.error fires once with structured context — Sentry alert path.
    expect(loggerError).toHaveBeenCalledWith(
      "mailboxes DELETE: EmailEngine remote delete failed after retries",
      expect.objectContaining({
        tenantId: "t1",
        mailboxId: "mb-1",
        eeAccountId: "ee-acct-1",
      })
    );
  }, 10_000);
});

describe("DELETE /api/settings/mailboxes — DB failure paths", () => {
  it("500 + Sentry alert when dependent-row cleanup fails", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectMailbox([{ id: "mb-1", tenantId: "t1", eeAccountId: "ee-acct-1" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const failingWhere = vi.fn().mockRejectedValue(new Error("FK violation"));
    vi.mocked(db.delete).mockReturnValue({ where: failingWhere } as never);

    const res = await mod.DELETE(makeReq("?id=mb-1"));
    expect(res.status).toBe(500);
    expect(loggerError).toHaveBeenCalledWith(
      "mailboxes DELETE: failed to clear dependent rows",
      expect.objectContaining({ tenantId: "t1", mailboxId: "mb-1" })
    );
  });

  it("500 + Sentry alert when mailbox-row delete fails", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(authCtx);
    mockSelectMailbox([{ id: "mb-1", tenantId: "t1", eeAccountId: "ee-acct-1" }]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    let call = 0;
    const where = vi.fn().mockImplementation(() => {
      call += 1;
      // First two calls = warmup, outbound — succeed. Third = mailbox, fail.
      if (call < 3) return Promise.resolve(undefined);
      return Promise.reject(new Error("mailbox delete blew up"));
    });
    vi.mocked(db.delete).mockReturnValue({ where } as never);

    const res = await mod.DELETE(makeReq("?id=mb-1"));
    expect(res.status).toBe(500);
    expect(loggerError).toHaveBeenCalledWith(
      "mailboxes DELETE: failed to delete mailbox row",
      expect.objectContaining({ tenantId: "t1", mailboxId: "mb-1" })
    );
  });
});
