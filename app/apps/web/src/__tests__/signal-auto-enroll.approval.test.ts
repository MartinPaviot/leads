import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CLE-13 T6 (item 2) — `signalAutoEnroll` is gated by the single approval
 * authority. `sequence-enrollment` is outbound + confirm:always in CLE-10's
 * metadata, so decideAction returns confirm/queue under EVERY mode — the loop
 * NEVER auto-enrolls inline. A non-execute disposition defers (records a pending
 * agent action) and skips enroll/deal/notify. The execute branch (only reachable
 * if the authority ever returns allowed) still fires the existing side effects.
 * (AC-2.1-2.5.)
 */

// ── Spies for the decision authority + deferral lane ──
const enforceAgentApprovalMode = vi.fn();
const recordAgentAction = vi.fn().mockResolvedValue({ id: "act1" });
const getTenantSettings = vi.fn().mockResolvedValue({ agentApprovalMode: "review-each" });

vi.mock("@/lib/config/tenant-settings", () => ({ getTenantSettings: (...a: unknown[]) => getTenantSettings(...a) }));
vi.mock("@/lib/guardrails/approval-mode", () => ({
  enforceAgentApprovalMode: (...a: unknown[]) => enforceAgentApprovalMode(...a),
  readApprovalMode: (s: { agentApprovalMode?: string }) => s.agentApprovalMode ?? "review-each",
}));
vi.mock("@/lib/agents/agent-actions", () => ({ recordAgentAction: (...a: unknown[]) => recordAgentAction(...a) }));

vi.mock("@/inngest/client", () => ({
  inngest: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    createFunction: vi.fn((config: any, handler: any) => ({ config, handler })),
  },
}));

vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...args: any[]) => ({ op: "and", args }),
  eq: () => ({ op: "eq" }),
  notInArray: () => ({ op: "notInArray" }),
  inArray: () => ({ op: "inArray" }),
  desc: () => ({ op: "desc" }),
  sql: () => ({ op: "sql" }),
}));

vi.mock("@/db/schema", () => ({
  contacts: {}, companies: {}, deals: {}, sequences: {},
  sequenceEnrollments: { contactId: "contact_id", sequenceId: "sequence_id" },
  notifications: {}, users: {},
  emailOptouts: { emailAddress: "email_address", tenantId: "tenant_id" },
}));

vi.mock("@/lib/analytics/pipeline-tracker", () => ({ trackPipeline: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/sequences/enrollment-eligibility", () => ({ isCompanyEligible: () => true }));
vi.mock("@/lib/icp/enrollment-routing", () => ({ pickIcpScopedSequence: () => ({ reason: "no_match", sequenceId: null }) }));
vi.mock("@/lib/sequences/triggers", () => ({ pickSequenceForSignal: () => ({ id: "seq1", name: "Default" }) }));

// ── Track DB writes so we can assert NO enroll / NO deal on deferral ──
const inserted: string[] = [];

// Sequenced db.select returns by call order:
//  1 check-existing-deal      -> [] (no open deal)
//  2 check-company-eligibility-> [{ excludedReason:null, deletedAt:null }]
//  3 find-contacts            -> 1 contact with email
//  4 find-sequence: sequences -> [{ id:seq1 }]
//  5 find-sequence: companies -> [{ properties:null }]
//  6 check-enrolled           -> [] (none)
//  7 notify: users            -> [{ id:u1 }]
let selectCall = 0;
function selectResultFor(call: number): unknown[] {
  switch (call) {
    case 1: return [];
    case 2: return [{ excludedReason: null, deletedAt: null }];
    case 3: return [{ id: "c1", email: "x@a.com", firstName: "X" }];
    case 4: return []; // P0-5 loadSuppressedEmails — none suppressed
    case 5: return [{ id: "seq1", name: "Default", icpId: null, campaignConfig: null }];
    case 6: return [{ properties: null }];
    case 7: return [];
    default: return [{ id: "u1" }];
  }
}

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      selectCall += 1;
      const call = selectCall;
      const result = selectResultFor(call);
      // Chainable: .from().where()[.limit()|.orderBy().[...]] — all resolve to result.
      const thenable = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        then: (resolve: (v: unknown) => void) => resolve(result),
        limit: () => Promise.resolve(result),
        orderBy: () => Promise.resolve(result),
      };
      return { from: () => ({ where: () => thenable }) };
    }),
    insert: vi.fn((table: unknown) => ({
      values: () => {
        // Identify the table by reference identity against the schema mock.
        inserted.push(JSON.stringify(table) === "{}" ? "unknown" : "row");
        return {
          returning: () => Promise.resolve([{ id: "new1" }]),
          // bare insert (sequenceEnrollments / notifications) is awaited
          then: (resolve: (v: unknown) => void) => resolve(undefined),
        };
      },
    })),
  },
}));

import { signalAutoEnroll } from "@/inngest/signal-to-sequence";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const handler = (signalAutoEnroll as any).handler;
const fakeStep = { run: (_n: string, fn: () => unknown) => fn() };

const event = {
  data: { tenantId: "t1", companyId: "co1", companyName: "Acme", signalType: "hiring", signalTitle: "New role" },
};

// Distinguish enroll vs deal inserts by counting db.insert calls per step. We
// track via a fresh spy each test.
import { db } from "@/db";
const insertSpy = db.insert as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  selectCall = 0;
  inserted.length = 0;
  enforceAgentApprovalMode.mockReset();
  recordAgentAction.mockClear();
  getTenantSettings.mockClear();
  insertSpy.mockClear();
});

describe("signalAutoEnroll — approval gate (item 2)", () => {
  it("review-each -> deferred: no enroll insert, no deal insert, recordAgentAction called", async () => {
    enforceAgentApprovalMode.mockReturnValue({ allowed: false, queueAs: "pending-per-item", reason: "review-each" });
    const res = await handler({ event, step: fakeStep });
    expect(res).toMatchObject({ skipped: true, deferred: true });
    expect(getTenantSettings).toHaveBeenCalled();
    expect(recordAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", actionType: "sequence-enrollment", awaitingApproval: true }),
    );
    // No writes at all (no enroll, no deal, no notify).
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it("auto-high-confidence -> still deferred (outbound->confirm, AC-2.3)", async () => {
    getTenantSettings.mockResolvedValue({ agentApprovalMode: "auto-high-confidence" });
    // The real enforceAgentApprovalMode returns confirm for sequence-enrollment
    // under auto-high-confidence (CLE-10 design §6.1); we encode that here.
    enforceAgentApprovalMode.mockReturnValue({ allowed: false, queueAs: "pending-per-item", reason: "outbound always confirm" });
    const res = await handler({ event, step: fakeStep });
    expect(res).toMatchObject({ skipped: true, deferred: true });
    expect(insertSpy).not.toHaveBeenCalled();
    expect(recordAgentAction).toHaveBeenCalled();
  });

  it("gate allowed (execute) -> existing enroll + deal + notify fire", async () => {
    enforceAgentApprovalMode.mockReturnValue({ allowed: true, queueAs: null, reason: "execute" });
    const res = await handler({ event, step: fakeStep });
    expect(res).toMatchObject({ enrolled: 1, companyId: "co1" });
    expect(recordAgentAction).not.toHaveBeenCalled();
    // enroll-contacts (1) + create-deal (1) + notify (1) = 3 inserts.
    expect(insertSpy).toHaveBeenCalledTimes(3);
  });

  it("ineligible signal (open deal) short-circuits BEFORE the gate (AC-2.5)", async () => {
    // First select (check-existing-deal) returns an open deal -> early return.
    selectCall = 0;
    vi.mocked(db.select).mockImplementationOnce(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([{ id: "d1" }]) }) }) }) as any,
    );
    const res = await handler({ event, step: fakeStep });
    expect(res).toMatchObject({ skipped: true });
    // The gate was never consulted (ordering proof).
    expect(getTenantSettings).not.toHaveBeenCalled();
    expect(enforceAgentApprovalMode).not.toHaveBeenCalled();
  });
});
