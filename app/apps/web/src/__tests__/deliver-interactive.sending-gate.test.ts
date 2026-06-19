import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-13 T4d (C4) — `deliverInteractiveEmail` runs the shared gate after its
 * opt-out check. A gate block returns a typed refusal ({ ok:false }) and never
 * reaches transport; opt-out keeps its own code. (AC-1.6 for C4.)
 */

vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq: (col: any, val: any) => ({ op: "eq", col, val }),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...args: any[]) => ({ op: "and", args }),
}));

vi.mock("@/db/schema", () => ({
  activities: {},
  connectedMailboxes: { tenantId: "tenant_id", status: "status", userId: "user_id" },
  emailOptouts: { id: "id", tenantId: "tenant_id", emailAddress: "email_address" },
  outboundEmails: {},
}));

// Control the opt-out lookup result per test.
let optoutPresent = false;

vi.mock("@/db", () => ({
  db: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: vi.fn((proj?: any) => ({
      from: () => ({
        where: () => ({
          limit: () => {
            const keys = proj ? Object.keys(proj) : [];
            // opt-out lookup
            if (keys.includes("id") && keys.length === 1) {
              return Promise.resolve(optoutPresent ? [{ id: "o1" }] : []);
            }
            // owner mailbox resolve -> none (FALLBACK_FROM, sentToday 0)
            return Promise.resolve([]);
          },
        }),
      }),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue(undefined) })),
  },
}));

vi.mock("@/lib/auth/user-id", () => ({ appToAuthUserId: vi.fn().mockResolvedValue("auth1") }));
vi.mock("@/lib/crypto/settings-encryption", () => ({ decryptSecret: () => "pw" }));
vi.mock("@/lib/integrations/smtp-send", () => ({ sendViaSmtp: vi.fn() }));
vi.mock("@/lib/emails/unsubscribe-token", () => ({ buildUnsubscribeUrl: () => "http://u" }));
vi.mock("@/lib/emails/owner-smtp-decision", () => ({ shouldUseOwnerSmtp: () => false }));
vi.mock("@/lib/billing/plan-limits", () => ({ checkPlanLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock("@/lib/billing/billing", () => ({ trackUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/observability/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/emails/recipient-guardrail", () => ({
  isRecipientAllowed: () => true,
  recipientBlockReason: () => "blocked",
}));

const evaluateSend = vi.fn();
vi.mock("@/lib/guardrails/sending-gate", () => ({ evaluateSend: (...a: unknown[]) => evaluateSend(...a) }));

const resendSend = vi.fn().mockResolvedValue({ data: { id: "m1" }, error: null });
vi.mock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send: resendSend } })) }));

import { deliverInteractiveEmail } from "@/lib/emails/deliver-interactive";

beforeEach(() => {
  optoutPresent = false;
  evaluateSend.mockReset();
  resendSend.mockClear();
});

const baseInput = {
  tenantId: "t1",
  ownerAppUserId: "u1",
  to: "cold@prospect.com",
  subject: "s",
  body: "b",
};

describe("C4 deliverInteractiveEmail — sending gate wired", () => {
  it("gate block (cold/cap) -> { ok:false, code:'blocked' }, no transport", async () => {
    evaluateSend.mockResolvedValue({ send: false, code: "cold-on-primary-blocked", reason: "cold blocked" });
    const r = await deliverInteractiveEmail(baseInput);
    expect(evaluateSend).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", toAddress: "cold@prospect.com" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe("blocked");
      expect(r.error).toBe("cold blocked");
    }
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("gate opted_out -> keeps opted_out code", async () => {
    evaluateSend.mockResolvedValue({ send: false, code: "opted_out", reason: "Recipient is on the opt-out list" });
    const r = await deliverInteractiveEmail(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("opted_out");
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("existing opt-out block still short-circuits before the gate", async () => {
    optoutPresent = true;
    evaluateSend.mockResolvedValue({ send: true, reason: "ok" });
    const r = await deliverInteractiveEmail(baseInput);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("opted_out");
    // The pre-existing opt-out branch returns before the gate is consulted.
    expect(evaluateSend).not.toHaveBeenCalled();
  });

  it("allowed -> proceeds to transport (gate on the path)", async () => {
    evaluateSend.mockResolvedValue({ send: true, reason: "warm under cap" });
    const r = await deliverInteractiveEmail(baseInput);
    expect(evaluateSend).toHaveBeenCalled();
    // resend is null in test env -> not_configured; proves it passed the gate.
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("not_configured");
  });
});
