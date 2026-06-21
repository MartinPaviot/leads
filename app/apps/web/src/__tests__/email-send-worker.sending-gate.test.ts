import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-13 T4a (C1) — the campaign cron `processOutboundEmails` runs the shared
 * sending gate at send time. A blocked outcome leaves the row unsent with the
 * reason; the transport (resend) is never reached. Removing the evaluateSend
 * call makes the "blocked -> unsent" assertion fail (AC-1.6, the orphan stays
 * wired).
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
  connectedMailboxes: { tenantId: "tenant_id", status: "status", id: "id", sentToday: "sent_today" },
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
  if (pred.op === "lte") return false;
  if (pred.op === "inArray") {
    if (pred.col === "id") return (pred.vals as string[]).includes(row.id);
    return false;
  }
  // #231 transport routing: this tenant has NO active custom-SMTP mailbox.
  if (pred.op === "notExists") return true;
  return false;
}

// A mailbox is loaded via the worker's load-mailboxes step (projected: false,
// status=active). Return one active mailbox so resolution + window pass.
const activeMailbox = {
  id: "mb1", emailAddress: "me@elevay.dev", displayName: null, dailyLimit: 50,
  sentToday: 0, status: "active", warmupStartedAt: null, createdAt: new Date(),
  bounceCount7d: 0, sendWindowStart: "00:00", sendWindowEnd: "23:59",
  sendDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
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
            if (projected) {
              // opt-out batch pre-filter -> no opt-outs.
              return Promise.resolve([]);
            }
            return {
              orderBy: () => ({
                limit: () => Promise.resolve(store.filter((r) => matches(pred, r))),
              }),
              // load-mailboxes path: bare select().from().where().limit()
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
          // Capture matched rows BEFORE mutating so the atomic batch-claim's
          // .returning() reports the ids it owns (#231). The claim predicate
          // includes status='queued', so an already-'sending' row isn't reclaimed.
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
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: vi.fn().mockResolvedValue({ timezone: "UTC" }),
}));
vi.mock("@/lib/emails/send-window", () => ({ isWithinSendWindow: () => true }));

// THE gate under test — spy so we can assert it ran and control the outcome.
const evaluateSend = vi.fn();
vi.mock("@/lib/guardrails/sending-gate", () => ({ evaluateSend: (...a: unknown[]) => evaluateSend(...a) }));

// resend transport — assert it is never called when the gate blocks.
const resendSend = vi.fn().mockResolvedValue({ data: { id: "m1" }, error: null });
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: resendSend } })) }));

import { processOutboundEmails } from "@/inngest/email-send-worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (processOutboundEmails as any).handler;
const fakeStep = { run: (_n: string, fn: () => unknown) => fn() };

function row(over: Partial<Row>): Row {
  return {
    id: "r1", tenantId: "t1", status: "queued", holdUntil: null,
    toAddress: "cold@prospect.com", queuedAt: new Date(), mailboxId: "mb1",
    bodyHtml: "<p>x</p>", subject: "s", bodyText: "x",
    contactId: null, enrollmentId: null, campaignId: null, errorMessage: null,
    ...over,
  };
}

beforeEach(() => {
  store = [];
  evaluateSend.mockReset();
  resendSend.mockClear();
  activeMailbox.sentToday = 0;
});

describe("C1 processOutboundEmails — sending gate wired", () => {
  it("cold-on-primary-blocked -> row failed with reason, resend never called", async () => {
    store = [row({ id: "r1" })];
    evaluateSend.mockResolvedValue({ send: false, code: "cold-on-primary-blocked", reason: "cold blocked" });
    const res = await handler({ step: fakeStep });
    expect(evaluateSend).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", toAddress: "cold@prospect.com" }),
    );
    expect(store[0].status).toBe("failed");
    expect(store[0].errorMessage).toBe("cold blocked");
    expect(resendSend).not.toHaveBeenCalled();
    expect(res.failed).toBeGreaterThanOrEqual(1);
  });

  it("primary-cap-hit -> row re-queued (recoverable), resend never called", async () => {
    store = [row({ id: "r1" })];
    evaluateSend.mockResolvedValue({ send: false, code: "primary-cap-hit", reason: "cap hit" });
    await handler({ step: fakeStep });
    expect(store[0].status).toBe("queued");
    expect(store[0].errorMessage).toBe("cap hit");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("allowed -> proceeds PAST the gate (not blocked by cold/cap)", async () => {
    // The module-level `resend` is null when RESEND_API_KEY is unset in the test
    // env, so an allowed send fails at the transport stage with that reason — which
    // proves the gate let it through (it is on the path, AC-1.6) rather than
    // short-circuiting on cold/cap.
    store = [row({ id: "r1" })];
    evaluateSend.mockResolvedValue({ send: true, reason: "warm under cap" });
    await handler({ step: fakeStep });
    expect(evaluateSend).toHaveBeenCalled();
    // It did NOT stop at the gate (errorMessage is not the gate's block reason).
    expect(store[0].errorMessage).not.toBe("cold blocked");
    expect(store[0].errorMessage).toMatch(/RESEND_API_KEY/);
  });
});
