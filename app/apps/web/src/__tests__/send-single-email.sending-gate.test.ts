import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-13 T4b (C2) — the event-driven single send `sendSingleEmail` runs the
 * shared sending gate. Blocked -> row failed (or re-queued for cap), transport
 * never reached. (AC-1.6 for C2.)
 */

interface Row {
  id: string;
  tenantId: string;
  status: string;
  holdUntil: Date | null;
  toAddress: string;
  fromAddress: string | null;
  bodyHtml: string;
  subject: string;
  bodyText: string | null;
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
}));

vi.mock("@/db/schema", () => ({
  outboundEmails: { status: "status", id: "id", tenantId: "tenant_id" },
  connectedMailboxes: { tenantId: "tenant_id", status: "status", sentToday: "sent_today" },
  activities: {},
  emailOptouts: { id: "id", tenantId: "tenant_id", emailAddress: "email_address" },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function matches(pred: any, row: Row): boolean {
  if (!pred) return true;
  if (pred.op === "and") return pred.args.every((p: unknown) => matches(p, row));
  if (pred.op === "eq") {
    if (pred.col === "id") return row.id === pred.val;
    if (pred.col === "tenant_id") return row.tenantId === pred.val;
    if (pred.col === "status") return row.status === pred.val;
    return false;
  }
  return false;
}

vi.mock("@/db", () => ({
  db: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn((proj?: any) => {
      const projected = proj !== undefined;
      return {
        from: () => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where: (pred: any) => ({
            limit: () => {
              if (projected) {
                const keys = Object.keys(proj);
                // opt-out lookup (id proj on emailOptouts) -> none
                if (keys.includes("id")) return Promise.resolve([]);
                // gate-primary-count (sentToday proj on mailbox) -> one mailbox
                if (keys.includes("sentToday")) return Promise.resolve([{ sentToday: 0 }]);
                return Promise.resolve([]);
              }
              // bare fetch-email select()
              return Promise.resolve(store.filter((r) => matches(pred, r)));
            },
          }),
        }),
      };
    }),
    update: vi.fn(() => ({
      set: (s: Record<string, unknown>) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: (pred: any) => {
          for (const r of store) if (matches(pred, r)) Object.assign(r, s);
          return Promise.resolve(undefined);
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
vi.mock("@/lib/config/tenant-settings", () => ({ getTenantSettings: vi.fn().mockResolvedValue({ timezone: "UTC" }) }));
vi.mock("@/lib/emails/send-window", () => ({ isWithinSendWindow: () => true }));

const evaluateSend = vi.fn();
vi.mock("@/lib/guardrails/sending-gate", () => ({ evaluateSend: (...a: unknown[]) => evaluateSend(...a) }));

const resendSend = vi.fn().mockResolvedValue({ data: { id: "m1" }, error: null });
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: resendSend } })) }));

import { sendSingleEmail } from "@/inngest/email-send-worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (sendSingleEmail as any).handler;
const fakeStep = { run: (_n: string, fn: () => unknown) => fn() };

function row(over: Partial<Row>): Row {
  return {
    id: "e1", tenantId: "t1", status: "queued", holdUntil: null,
    toAddress: "cold@prospect.com", fromAddress: "me@elevay.dev",
    bodyHtml: "<p>x</p>", subject: "s", bodyText: "x", errorMessage: null,
    ...over,
  };
}

beforeEach(() => {
  store = [];
  evaluateSend.mockReset();
  resendSend.mockClear();
});

describe("C2 sendSingleEmail — sending gate wired", () => {
  it("cold-on-primary-blocked -> failed, no transport", async () => {
    store = [row({ id: "e1" })];
    evaluateSend.mockResolvedValue({ send: false, code: "cold-on-primary-blocked", reason: "cold blocked" });
    const res = await handler({ event: { data: { emailId: "e1" } }, step: fakeStep });
    expect(evaluateSend).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", toAddress: "cold@prospect.com" }),
    );
    expect(store[0].status).toBe("failed");
    expect(store[0].errorMessage).toBe("cold blocked");
    expect(res.sent).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("primary-cap-hit -> re-queued, no transport", async () => {
    store = [row({ id: "e1" })];
    evaluateSend.mockResolvedValue({ send: false, code: "primary-cap-hit", reason: "cap hit" });
    await handler({ event: { data: { emailId: "e1" } }, step: fakeStep });
    expect(store[0].status).toBe("queued");
    expect(store[0].errorMessage).toBe("cap hit");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("allowed -> proceeds past the gate", async () => {
    store = [row({ id: "e1" })];
    evaluateSend.mockResolvedValue({ send: true, reason: "warm under cap" });
    const res = await handler({ event: { data: { emailId: "e1" } }, step: fakeStep });
    expect(evaluateSend).toHaveBeenCalled();
    // Not stopped at the gate.
    expect(store[0].status).not.toBe("failed");
    // resend is null in the test env -> returns the not-configured reason, proving
    // it passed the gate and reached the transport stage.
    expect(res.reason).toMatch(/RESEND_API_KEY/);
  });
});
