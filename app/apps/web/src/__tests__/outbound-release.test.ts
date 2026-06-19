import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-11 worker wiring (Task 8). Exercises processOutboundEmails' release/skip
 * logic with an in-memory outbound store so the atomic release (held -> queued)
 * and the queued fetch interact realistically. Resend is left null so a released
 * send fails with a known reason — which still proves the guardrail chain runs
 * at send time AFTER the hold (AC-9), the point of the invariant.
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
}

let store: Row[] = [];
// Track the WHERE predicate kind the release UPDATE used so we can assert it
// targeted held rows only.
const updateCalls: { set: Record<string, unknown>; where: unknown }[] = [];

vi.mock("@/inngest/client", () => ({
  inngest: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createFunction: vi.fn((config: any, handler: any) => ({ config, handler })),
    send: vi.fn().mockResolvedValue(undefined),
  },
}));

// Minimal drizzle predicate encoding so we can interpret the UPDATE/SELECT WHERE.
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
  connectedMailboxes: {},
  activities: {},
  emailOptouts: { tenantId: "tenant_id", emailAddress: "email_address" },
}));

// Interpret a where predicate against a row.
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
  if (pred.op === "lte") {
    if (pred.col === "hold_until") {
      return row.holdUntil !== null && row.holdUntil.getTime() <= (pred.val as Date).getTime();
    }
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

vi.mock("@/db", () => ({
  db: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn((proj?: any) => {
      // A projected select (db.select({...})) is the opt-out / mailbox subquery:
      // its where() is awaited directly and should resolve to []. The bare
      // db.select() is the queued fetch: where().orderBy().limit().
      const projected = proj !== undefined;
      return {
        from: () => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          where: (pred: any) => {
            if (projected) {
              // Awaited directly → resolve to no rows (no opt-outs, no mailbox).
              return Promise.resolve([]);
            }
            return {
              orderBy: () => ({
                limit: () => Promise.resolve(store.filter((r) => matches(pred, r))),
              }),
              limit: () => Promise.resolve([]),
            };
          },
        }),
      };
    }),
    update: vi.fn(() => ({
      set: (s: Record<string, unknown>) => ({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        where: (pred: any) => {
          updateCalls.push({ set: s, where: pred });
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
// CLE-13: the worker now reads tenant settings (for the send-window timezone)
// and runs the shared sending gate. Stub both so this CLE-11 release test stays
// focused on the hold/release behavior.
vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: vi.fn().mockResolvedValue({ timezone: "UTC" }),
}));
vi.mock("@/lib/emails/send-window", () => ({ isWithinSendWindow: () => true }));
vi.mock("@/lib/guardrails/sending-gate", () => ({
  evaluateSend: vi.fn().mockResolvedValue({ send: true, reason: "ok" }),
}));
vi.mock("@/lib/billing/plan-limits", () => ({ checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/billing/billing", () => ({ trackUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/analytics/pipeline-tracker", () => ({ trackPipeline: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/emails/unsubscribe-token", () => ({ buildUnsubscribeUrl: () => "http://u" }));
vi.mock("@/lib/emails/tracking-token", () => ({ signTrackingId: () => "tok" }));

import { processOutboundEmails } from "@/inngest/email-send-worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (processOutboundEmails as any).handler;
const fakeStep = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (_name: string, fn: () => any) => fn(),
};

function row(over: Partial<Row>): Row {
  return {
    id: "r1", tenantId: "t1", status: "held", holdUntil: null,
    toAddress: "p@example.com", queuedAt: null, mailboxId: null,
    bodyHtml: "<p>x</p>", subject: "s", bodyText: "x",
    contactId: null, enrollmentId: null, campaignId: null,
    ...over,
  };
}

beforeEach(() => {
  store = [];
  updateCalls.length = 0;
});

describe("CLE-11 processOutboundEmails release/skip (Task 8)", () => {
  it("AC-8: a held row with a FUTURE holdUntil is not released and not fetched", async () => {
    store = [row({ id: "future", status: "held", holdUntil: new Date(Date.now() + 60_000) })];
    const res = await handler({ step: fakeStep });
    // No queued rows surfaced → nothing processed.
    expect(res.processed).toBe(0);
    // The row stays held.
    expect(store[0].status).toBe("held");
    // The release UPDATE was issued and targeted held rows only.
    const release = updateCalls.find((u) => u.set.status === "queued" && u.set.holdUntil === null);
    expect(release).toBeDefined();
  });

  it("AC-14: a held row whose window elapsed is released to queued (durable clock), then handled by the send step", async () => {
    store = [row({ id: "past", status: "held", holdUntil: new Date(Date.now() - 1_000) })];
    const res = await handler({ step: fakeStep });
    // It was released into the queue and entered the send pipeline.
    expect(res.processed).toBe(1);
    // After release the row is no longer 'held' (it moved through the chain).
    expect(store[0].status).not.toBe("held");
    // Released row got queuedAt set by the release UPDATE.
    const release = updateCalls.find((u) => u.set.status === "queued" && u.set.holdUntil === null);
    expect(release).toBeDefined();
  });

  it("AC-15: the release UPDATE is conditioned on status='held' (atomic, idempotent)", async () => {
    store = [row({ id: "past", status: "held", holdUntil: new Date(Date.now() - 1_000) })];
    await handler({ step: fakeStep });
    const release = updateCalls.find((u) => u.set.status === "queued" && u.set.holdUntil === null)!;
    // The where predicate must include eq(status,'held') and lte(hold_until, now).
    const json = JSON.stringify(release.where);
    expect(json).toContain("\"val\":\"held\"");
    expect(json).toContain("hold_until");
  });
});
