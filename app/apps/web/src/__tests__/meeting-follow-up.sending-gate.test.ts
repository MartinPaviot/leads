import { describe, it, expect, vi, beforeEach } from "vitest";

// MUST be set before the route module loads — it reads RESEND_API_KEY at module
// init to construct the Resend client (unset -> the route 400s "not configured").
// ESM imports hoist above plain statements, so use vi.hoisted (which runs before
// the route import) to set it in time.
vi.hoisted(() => {
  process.env.RESEND_API_KEY = "re_test";
});

/**
 * CLE-13 T4e / T7 (C5) — the meeting follow-up route filters recipients through
 * the shared gate, closing the opt-out gap (this route had NO opt-out check
 * before). Suppressed/blocked recipients are dropped; if every recipient is
 * blocked -> 403, no follow-up dispatched. (AC-3.2/3.3, AC-1.6 for C5.)
 */

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({ requireCapabilityForRequest: vi.fn(() => null) }));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/recording/cta", () => ({
  buildCtaFootersForActivity: vi.fn().mockResolvedValue({ footerByRecipient: new Map(), footerCount: 0 }),
  appendFooterIfExternal: (b: string) => b,
}));
vi.mock("@/lib/emails/recipient-guardrail", () => ({
  isRecipientAllowed: () => true,
  recipientBlockReason: () => "blocked",
}));

vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  isNull: () => ({ op: "isNull" }),
}));

vi.mock("@/db/schema", () => ({ activities: {}, contacts: { email: "email" } }));

// The route does: select activity (limit 1), select contacts (no limit), update activity.
const activityRow = {
  id: "m1",
  tenantId: "t1",
  metadata: {
    followUpEmailDraft: { subject: "Thanks", body: "Great meeting" },
    matchedContacts: [{ email: "a@prospect.com" }, { email: "b@prospect.com" }],
  },
};
let contactRows: Array<{ email: string }> = [];
let updatedMeta: Record<string, unknown> | null = null;
let selectCalls = 0;

vi.mock("@/db", () => ({
  db: {
    // 1st select = the meeting activity (consumed via .limit(1)); 2nd = the
    // contacts query (awaited directly on .where()).
    select: vi.fn(() => {
      selectCalls += 1;
      const isActivityQuery = selectCalls === 1;
      return {
        from: () => ({
          where: () =>
            isActivityQuery
              ? { limit: () => Promise.resolve([activityRow]) }
              : Promise.resolve(contactRows),
        }),
      };
    }),
    update: vi.fn(() => ({
      set: (s: { metadata?: Record<string, unknown> }) => ({
        where: () => {
          updatedMeta = s.metadata ?? null;
          return Promise.resolve(undefined);
        },
      }),
    })),
  },
}));

const evaluateSend = vi.fn();
vi.mock("@/lib/guardrails/sending-gate", () => ({ evaluateSend: (...a: unknown[]) => evaluateSend(...a) }));

const resendSend = vi.fn().mockResolvedValue({ data: { id: "m1" }, error: null });
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...a: unknown[]) => resendSend(...a) };
  },
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { POST } from "@/app/api/meetings/[id]/notes/send-follow-up/route";

beforeEach(() => {
  evaluateSend.mockReset();
  resendSend.mockClear();
  updatedMeta = null;
  contactRows = [];
  selectCalls = 0;
  activityRow.metadata = {
    followUpEmailDraft: { subject: "Thanks", body: "Great meeting" },
    matchedContacts: [{ email: "a@prospect.com" }, { email: "b@prospect.com" }],
  };
  (getAuthContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    tenantId: "t1",
    appUserId: "u1",
  });
});

function makeReq() {
  return new Request("http://x/api/meetings/m1/notes/send-follow-up", { method: "POST" });
}
const ctx = { params: Promise.resolve({ id: "m1" }) };

describe("C5 meeting follow-up — opt-out gap closed + gate wired", () => {
  it("all recipients suppressed -> 403, no send, followUpSentAt unset", async () => {
    evaluateSend.mockResolvedValue({ send: false, code: "opted_out", reason: "Recipient is on the opt-out list" });
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(403);
    expect(evaluateSend).toHaveBeenCalled();
    expect(resendSend).not.toHaveBeenCalled();
    expect(updatedMeta).toBeNull();
  });

  it("one suppressed, one allowed -> drops the suppressed, sends to the rest", async () => {
    evaluateSend.mockImplementation(async (args: { toAddress: string }) =>
      args.toAddress === "a@prospect.com"
        ? { send: false, code: "opted_out", reason: "opted out" }
        : { send: true, reason: "ok" },
    );
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipients).toEqual(["b@prospect.com"]);
    expect(resendSend).toHaveBeenCalledTimes(1);
  });

  it("all allowed -> sends to all", async () => {
    evaluateSend.mockResolvedValue({ send: true, reason: "ok" });
    const res = await POST(makeReq(), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipients.sort()).toEqual(["a@prospect.com", "b@prospect.com"]);
  });
});
