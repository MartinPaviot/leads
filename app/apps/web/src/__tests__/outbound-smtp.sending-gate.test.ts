import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-13 T4c / T7 (C3) — the SMTP cron `dispatchOutboundSmtp` now runs the
 * shared gate, which closes the opt-out/suppression gap (this path had NO
 * opt-out check before) and applies the sending-identity rail. Opt-out (incl.
 * bounce_hard via the same lookup) and cold blocks -> row failed, sendViaSmtp
 * never called. Cap -> row left queued (skipped). (AC-3.1/3.3, AC-1.6 for C3.)
 */

interface Row {
  id: string;
  tenantId: string;
  status: string;
  toAddress: string;
  subject: string;
  bodyHtml: string;
  bodyText: string | null;
  inReplyTo: string | null;
  errorMessage?: string | null;
}

let store: Row[] = [];

vi.mock("@/inngest/client", () => ({
  inngest: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createFunction: vi.fn((config: any, handler: any) => ({ config, handler })),
  },
}));

vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: (col: any, val: any) => ({ op: "eq", col, val }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...args: any[]) => ({ op: "and", args }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: (...args: any[]) => ({ op: "sql", args }),
}));

vi.mock("@/db/schema", () => ({
  outboundEmails: { status: "status", id: "id" },
  connectedMailboxes: { tenantId: "tenant_id", provider: "provider", status: "status", id: "id" },
}));

// One active smtp_custom mailbox so the row reaches the gate.
const smtpMailbox = {
  id: "mb1", tenantId: "t1", provider: "smtp_custom", status: "active",
  smtpHost: "smtp.host", smtpPort: 587, secretEncrypted: "enc",
  emailAddress: "me@own.com", displayName: null, sentToday: 0, dailyLimit: 50,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matchesRow(pred: any, row: Row): boolean {
  if (!pred) return true;
  if (pred.op === "and") return pred.args.every((p: unknown) => matchesRow(p, row));
  if (pred.op === "eq") {
    if (pred.col === "status") return row.status === pred.val;
    if (pred.col === "id") return row.id === pred.val;
    return false;
  }
  return false;
}

vi.mock("@/db", () => ({
  db: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn((proj?: any) => ({
      from: () => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: (pred: any) => ({
          limit: () => {
            // The mailbox resolve is the only projected-less select with an
            // and(tenant,provider,status) predicate; the queued fetch is the
            // bare find-queued select on status=queued.
            const isMailboxQuery =
              pred?.op === "and" &&
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              pred.args.some((a: any) => a.col === "provider");
            if (isMailboxQuery) return Promise.resolve([smtpMailbox]);
            return Promise.resolve(store.filter((r) => matchesRow(pred, r)));
          },
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (s: Record<string, unknown>) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: (pred: any) => {
          const matched = store.filter((r) => matchesRow(pred, r));
          for (const r of matched) Object.assign(r, s);
          // Awaitable for plain `.where()` consumers AND `.returning()` for the
          // atomic claim (returns the rows it actually flipped).
          const ids = matched.map((r) => ({ id: r.id }));
          return Object.assign(Promise.resolve(ids), { returning: () => Promise.resolve(ids) });
        },
      }),
    })),
  },
}));

vi.mock("@/lib/emails/recipient-guardrail", () => ({
  isRecipientAllowed: () => true,
  recipientBlockReason: () => "blocked",
}));
vi.mock("@/lib/crypto/settings-encryption", () => ({ decryptSecret: () => "pw" }));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const sendViaSmtp = vi.fn().mockResolvedValue({ messageId: "smtp-1" });
vi.mock("@/lib/integrations/smtp-send", () => ({ sendViaSmtp: (...a: unknown[]) => sendViaSmtp(...a) }));

const evaluateSend = vi.fn();
vi.mock("@/lib/guardrails/sending-gate", () => ({ evaluateSend: (...a: unknown[]) => evaluateSend(...a) }));

const isWithinSendWindowMock = vi.fn();
vi.mock("@/lib/emails/send-window", () => ({ isWithinSendWindow: (...a: unknown[]) => isWithinSendWindowMock(...a) }));
vi.mock("@/lib/config/tenant-settings", () => ({ getTenantSettings: vi.fn(async () => ({ timezone: "Europe/Paris" })) }));

import { dispatchOutboundSmtp } from "@/inngest/outbound-smtp-send";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (dispatchOutboundSmtp as any).handler;
const fakeStep = { run: (_n: string, fn: () => unknown) => fn() };

function row(over: Partial<Row>): Row {
  return {
    id: "o1", tenantId: "t1", status: "queued", toAddress: "x@prospect.com",
    subject: "s", bodyHtml: "<p>x</p>", bodyText: "x", inReplyTo: null, errorMessage: null,
    ...over,
  };
}

beforeEach(() => {
  store = [];
  evaluateSend.mockReset();
  sendViaSmtp.mockClear();
  smtpMailbox.sentToday = 0;
  isWithinSendWindowMock.mockReturnValue(true);
});

describe("C3 dispatchOutboundSmtp — opt-out gap closed + gate wired", () => {
  it("opted_out (unsubscribe) -> row failed, sendViaSmtp never called", async () => {
    store = [row({ id: "o1" })];
    evaluateSend.mockResolvedValue({ send: false, code: "opted_out", reason: "Recipient is on the opt-out list" });
    const res = await handler({ step: fakeStep });
    expect(evaluateSend).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", toAddress: "x@prospect.com" }),
    );
    expect(store[0].status).toBe("failed");
    expect(store[0].errorMessage).toBe("Recipient is on the opt-out list");
    expect(sendViaSmtp).not.toHaveBeenCalled();
    expect(res.failed).toBe(1);
  });

  it("opted_out (bounce_hard, same lookup) -> row failed, no send (AC-3.3)", async () => {
    store = [row({ id: "o1", toAddress: "bounced@prospect.com" })];
    // A hard bounce is an email_optouts row -> the gate returns opted_out too.
    evaluateSend.mockResolvedValue({ send: false, code: "opted_out", reason: "Recipient is on the opt-out list" });
    await handler({ step: fakeStep });
    expect(store[0].status).toBe("failed");
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });

  it("cold-on-primary-blocked -> row failed, no send", async () => {
    store = [row({ id: "o1" })];
    evaluateSend.mockResolvedValue({ send: false, code: "cold-on-primary-blocked", reason: "cold blocked" });
    await handler({ step: fakeStep });
    expect(store[0].status).toBe("failed");
    expect(sendViaSmtp).not.toHaveBeenCalled();
  });

  it("primary-cap-hit -> left queued (skipped), no send", async () => {
    store = [row({ id: "o1" })];
    evaluateSend.mockResolvedValue({ send: false, code: "primary-cap-hit", reason: "cap" });
    const res = await handler({ step: fakeStep });
    expect(store[0].status).toBe("queued");
    expect(sendViaSmtp).not.toHaveBeenCalled();
    expect(res.skipped).toBe(1);
  });

  it("allowed -> sends via SMTP (gate on the path)", async () => {
    store = [row({ id: "o1" })];
    evaluateSend.mockResolvedValue({ send: true, reason: "ok" });
    const res = await handler({ step: fakeStep });
    expect(evaluateSend).toHaveBeenCalled();
    expect(sendViaSmtp).toHaveBeenCalledTimes(1);
    expect(store[0].status).toBe("sent");
    expect(res.sent).toBe(1);
  });

  it("atomic claim: sends ONCE across a re-run / concurrent cron (no double-send)", async () => {
    store = [row({ id: "o1" })];
    evaluateSend.mockResolvedValue({ send: true, reason: "ok" });

    const first = await handler({ step: fakeStep });
    expect(sendViaSmtp).toHaveBeenCalledTimes(1);
    expect(store[0].status).toBe("sent");
    expect(first.sent).toBe(1);

    // A retry / the campaign-worker cron re-runs over the same store: the row has
    // left "queued", so the claim (and the find-queued select) match nothing and
    // the prospect is NOT mailed a second time.
    const second = await handler({ step: fakeStep });
    expect(sendViaSmtp).toHaveBeenCalledTimes(1); // STILL one
    expect(second.sent).toBe(0);
  });

  it("a row that is no longer queued at claim time is skipped, not sent", async () => {
    // Simulate the dual-cron race: the row was fetched as queued, but another worker
    // claimed it (now 'sending') before this worker's claim ran.
    store = [row({ id: "o1", status: "sending" })];
    evaluateSend.mockResolvedValue({ send: true, reason: "ok" });
    // Force the find-queued select to still surface it (as if read a tick earlier).
    const stepEarlyRead = { run: (n: string, fn: () => unknown) => (n === "find-queued" ? [store[0]] : fn()) };
    const res = await handler({ step: stepEarlyRead });
    expect(sendViaSmtp).not.toHaveBeenCalled(); // claim matched 0 ('sending' != 'queued') -> skipped
    expect(res.skipped).toBe(1);
  });

  it("outside the 08-18 send window -> row stays queued (skipped), no send", async () => {
    store = [row({ id: "o1" })];
    evaluateSend.mockResolvedValue({ send: true, reason: "ok" });
    isWithinSendWindowMock.mockReturnValue(false); // e.g. 3am in the tenant tz
    const res = await handler({ step: fakeStep });
    expect(sendViaSmtp).not.toHaveBeenCalled();
    expect(store[0].status).toBe("queued"); // left for a later tick, not failed
    expect(res.skipped).toBe(1);
  });
});
