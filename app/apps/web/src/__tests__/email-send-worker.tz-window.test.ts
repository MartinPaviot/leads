import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-13 T8 (item 4) — the campaign cron reads the TENANT timezone (from
 * tenant_settings) and evaluates the send window in tenant-local time, not UTC.
 * Asserts isWithinSendWindow is called with the tenant TZ and that an
 * "outside window" verdict re-queues the row (no transport). The pure
 * tenant-local correctness is covered by send-window.test.ts.
 */

interface Row {
  id: string;
  tenantId: string;
  status: string;
  holdUntil: Date | null;
  toAddress: string;
  queuedAt: Date | null;
  mailboxId: string | null;
  bodyHtml: string;
  subject: string;
  bodyText: string | null;
  contactId: string | null;
  enrollmentId: string | null;
  campaignId: string | null;
  errorMessage?: string | null;
}

let store: Row[] = [];

vi.mock("@/inngest/client", () => ({
  inngest: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createFunction: vi.fn((config: any, handler: any) => ({ config, handler })),
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: (col: any, val: any) => ({ op: "eq", col, val }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...args: any[]) => ({ op: "and", args }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  lte: (col: any, val: any) => ({ op: "lte", col, val }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: (...args: any[]) => ({ op: "sql", args }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inArray: (col: any, vals: any) => ({ op: "inArray", col, vals }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  exists: (q: any) => ({ op: "exists", q }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notExists: (q: any) => ({ op: "notExists", q }),
}));

vi.mock("@/db/schema", () => ({
  outboundEmails: { status: "status", holdUntil: "hold_until", queuedAt: "queued_at", id: "id", tenantId: "tenant_id" },
  connectedMailboxes: { tenantId: "tenant_id", status: "status", id: "id" },
  activities: {},
  emailOptouts: { tenantId: "tenant_id", emailAddress: "email_address" },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matches(pred: any, row: Row): boolean {
  if (!pred) return true;
  if (pred.op === "and") return pred.args.every((p: unknown) => matches(p, row));
  if (pred.op === "eq") {
    if (pred.col === "status") return row.status === pred.val;
    if (pred.col === "tenant_id") return row.tenantId === pred.val;
    if (pred.col === "id") return row.id === pred.val;
    return false;
  }
  if (pred.op === "inArray") {
    if (pred.col === "id") return (pred.vals as string[]).includes(row.id);
    return false;
  }
  // #231 transport routing: this tenant has NO active custom-SMTP mailbox.
  if (pred.op === "notExists") return true;
  return false;
}

const activeMailbox = {
  id: "mb1", emailAddress: "me@elevay.dev", displayName: null, dailyLimit: 50,
  sentToday: 0, status: "active", warmupStartedAt: null, createdAt: new Date(),
  bounceCount7d: 0, sendWindowStart: "08:00", sendWindowEnd: "18:00",
  sendDays: ["mon", "tue", "wed", "thu", "fri"],
};

vi.mock("@/db", () => ({
  db: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn((proj?: any) => {
      const projected = proj !== undefined;
      return {
        from: () => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where: (pred: any) => {
            if (projected) return Promise.resolve([]);
            return {
              orderBy: () => ({ limit: () => Promise.resolve(store.filter((r) => matches(pred, r))) }),
              limit: () => Promise.resolve([activeMailbox]),
            };
          },
        }),
      };
    }),
    update: vi.fn(() => ({
      set: (s: Record<string, unknown>) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: (pred: any) => {
          // Capture matched rows BEFORE mutating so the atomic claim's
          // .returning() reports the ids it owns (#231).
          const matched = store.filter((r) => matches(pred, r));
          for (const r of matched) Object.assign(r, s);
          return Object.assign(Promise.resolve(undefined), {
            returning: () => Promise.resolve(matched.map((r) => ({ id: r.id }))),
          });
        },
      }),
    })),
  },
}));

vi.mock("@/lib/emails/recipient-guardrail", () => ({
  isRecipientAllowed: () => true,
  recipientBlockReason: () => "blocked",
}));
vi.mock("@/lib/billing/plan-limits", () => ({ checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/billing/billing", () => ({ trackUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/analytics/pipeline-tracker", () => ({ trackPipeline: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/emails/unsubscribe-token", () => ({ buildUnsubscribeUrl: () => "http://u" }));
vi.mock("@/lib/emails/tracking-token", () => ({ signTrackingId: () => "tok" }));
vi.mock("@/lib/guardrails/sending-gate", () => ({ evaluateSend: vi.fn().mockResolvedValue({ send: true, reason: "ok" }) }));

// Tenant settings carry the timezone the worker must thread into the window check.
const getTenantSettings = vi.fn().mockResolvedValue({ timezone: "Europe/Zurich" });
vi.mock("@/lib/config/tenant-settings", () => ({ getTenantSettings: (...a: unknown[]) => getTenantSettings(...a) }));

// The window helper — spy to assert the worker passes the tenant TZ, and to
// drive the in/out-of-window verdict.
const isWithinSendWindow = vi.fn();
vi.mock("@/lib/emails/send-window", () => ({ isWithinSendWindow: (...a: unknown[]) => isWithinSendWindow(...a) }));

const resendSend = vi.fn().mockResolvedValue({ data: { id: "m1" }, error: null });
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: resendSend } })) }));

import { processOutboundEmails } from "@/inngest/email-send-worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (processOutboundEmails as any).handler;
const fakeStep = { run: (_n: string, fn: () => unknown) => fn() };

function row(over: Partial<Row>): Row {
  return {
    id: "r1", tenantId: "t1", status: "queued", holdUntil: null,
    toAddress: "warm@prospect.com", queuedAt: new Date(), mailboxId: "mb1",
    bodyHtml: "<p>x</p>", subject: "s", bodyText: "x",
    contactId: null, enrollmentId: null, campaignId: null, errorMessage: null,
    ...over,
  };
}

beforeEach(() => {
  store = [];
  isWithinSendWindow.mockReset();
  resendSend.mockClear();
  getTenantSettings.mockClear();
  getTenantSettings.mockResolvedValue({ timezone: "Europe/Zurich" });
});

describe("C1 send window — tenant timezone (item 4)", () => {
  it("calls isWithinSendWindow with the tenant timezone, not UTC", async () => {
    store = [row({ id: "r1" })];
    isWithinSendWindow.mockReturnValue(true);
    await handler({ step: fakeStep });
    expect(getTenantSettings).toHaveBeenCalledWith("t1");
    expect(isWithinSendWindow).toHaveBeenCalledWith(
      expect.any(Date),
      "Europe/Zurich",
      expect.objectContaining({ sendWindowStart: "08:00", sendWindowEnd: "18:00" }),
    );
  });

  it("outside the tenant-local window -> row re-queued, transport not reached", async () => {
    store = [row({ id: "r1" })];
    isWithinSendWindow.mockReturnValue(false);
    await handler({ step: fakeStep });
    expect(store[0].status).toBe("queued");
    expect(store[0].errorMessage).toBe("Outside send window, will retry");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("no tenant timezone set (EC-2) -> passes null TZ (helper falls back to default)", async () => {
    getTenantSettings.mockResolvedValue({ timezone: undefined });
    store = [row({ id: "r1" })];
    isWithinSendWindow.mockReturnValue(true);
    await handler({ step: fakeStep });
    expect(isWithinSendWindow).toHaveBeenCalledWith(expect.any(Date), null, expect.any(Object));
  });
});
