import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * P0-1 — autopilot enrollment must (a) enforce the anti-ICP `excluded_reason`
 * gate (it auto-SELECTS contacts the founder never vetted) and (b) route
 * sequence-enrollment through the HITL approval authority, which defers it
 * (outbound + confirm:always) instead of bulk-inserting active enrollments.
 *
 * `checkContactEligibility` is imported REAL (pure fn) so the eligibility
 * filtering is genuinely exercised; the guardrail decision + the deferral lane
 * are mocked to assert wiring.
 */

const enforceAgentApprovalMode = vi.fn();
const recordAgentAction = vi.fn().mockResolvedValue({ id: "act1" });
const getTenantSettings = vi.fn().mockResolvedValue({ agentApprovalMode: "review-each" });

vi.mock("@/lib/auth/auth-utils", () => ({
  getAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  // admin passes the sequences:execute gate — return no denial.
  requirePermission: () => undefined,
}));

vi.mock("@/lib/config/tenant-settings", () => ({
  getTenantSettings: (...a: unknown[]) => getTenantSettings(...a),
}));

vi.mock("@/lib/guardrails/approval-mode", () => ({
  enforceAgentApprovalMode: (...a: unknown[]) => enforceAgentApprovalMode(...a),
  readApprovalMode: (s: { agentApprovalMode?: string }) => s.agentApprovalMode ?? "review-each",
}));

vi.mock("@/lib/agents/agent-actions", () => ({
  recordAgentAction: (...a: unknown[]) => recordAgentAction(...a),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
  },
}));

vi.mock("@/db/schema", () => ({
  sequences: { id: "id", tenantId: "tenant_id", name: "name" },
  sequenceSteps: { sequenceId: "sequence_id", stepNumber: "step_number" },
  sequenceEnrollments: { sequenceId: "sequence_id", contactId: "contact_id" },
  contacts: { id: "id", email: "email", score: "score", deletedAt: "deleted_at", companyId: "company_id", tenantId: "tenant_id" },
  companies: { id: "id", excludedReason: "excluded_reason" },
  emailOptouts: { emailAddress: "email_address", tenantId: "tenant_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  sql: vi.fn(() => ({ op: "sql" })),
  and: vi.fn(),
  isNotNull: vi.fn(),
  isNull: vi.fn(),
  gte: vi.fn(),
  inArray: vi.fn(),
}));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { db } from "@/db";

const { POST } = await import("@/app/api/sequences/[id]/autopilot/route");

// ── Sequenced, chain-agnostic db.select mock ──
// Every chain method returns the same thenable; awaiting at any depth (.where,
// .limit, .orderBy) resolves to the per-call result, so the route's mixed query
// shapes (with/without .limit, with .leftJoin) all work off one definition.
let selectResults: unknown[][] = [];
let selectCall = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: unknown[]): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {
    from: () => c,
    leftJoin: () => c,
    where: () => c,
    orderBy: () => c,
    limit: () => Promise.resolve(result),
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return c;
}

const insertValues = vi.fn().mockResolvedValue(undefined);

function req() {
  return new Request("http://localhost/api/sequences/seq1/autopilot", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ minScore: 50, maxEnroll: 20 }),
  });
}

describe("POST /api/sequences/[id]/autopilot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults = [];
    selectCall = 0;
    recordAgentAction.mockResolvedValue({ id: "act1" });
    getTenantSettings.mockResolvedValue({ agentApprovalMode: "review-each" });
    vi.mocked(db.select).mockImplementation(((): unknown => chain(selectResults[selectCall++] ?? [])) as never);
    vi.mocked(db.insert).mockReturnValue({ values: insertValues } as never);
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(getAuthContext).mockResolvedValue(null);
    const res = await POST(req(), { params: Promise.resolve({ id: "seq1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 404 when sequence not found", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    selectResults = [[]]; // sequence lookup → empty
    const res = await POST(req(), { params: Promise.resolve({ id: "seq1" }) });
    expect(res.status).toBe(404);
  });

  it("skips anti-ICP-excluded contacts and DEFERS the eligible set (no active enroll)", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    enforceAgentApprovalMode.mockReturnValue({ allowed: false, queueAs: "pending-per-item", reason: "review-each" });
    selectResults = [
      [{ id: "seq1", name: "Q2 Outbound" }], // sequence
      [{ count: 1 }], // stepCount
      [], // already-enrolled
      [
        { id: "c-ok", email: "a@x.com", deletedAt: null, companyExcludedReason: null },
        { id: "c-bad", email: "b@y.com", deletedAt: null, companyExcludedReason: "competitor" },
      ], // candidates (leftJoin companies)
      [], // P0-5 loadSuppressedEmails — none suppressed
    ];

    const res = await POST(req(), { params: Promise.resolve({ id: "seq1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ deferred: true, queued: 1, enrolled: 0, skipped: 1, eligible: 2 });
    // The excluded company's contact is NOT in the deferred payload.
    expect(recordAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        actionType: "sequence-enrollment",
        awaitingApproval: true,
        payload: expect.objectContaining({ sequenceId: "seq1", contactIds: ["c-ok"] }),
      }),
    );
    // Defer path performs ZERO active enrollment.
    expect(insertValues).not.toHaveBeenCalled();
  });

  it("even if the authority ever allows execute, only the eligible set is enrolled", async () => {
    vi.mocked(getAuthContext).mockResolvedValue({ userId: "u1", tenantId: "t1", appUserId: "u1", role: "admin" } as never);
    enforceAgentApprovalMode.mockReturnValue({ allowed: true, queueAs: null, reason: "execute" });
    selectResults = [
      [{ id: "seq1", name: "Q2" }], // sequence
      [{ count: 1 }], // stepCount
      [], // already-enrolled
      [
        { id: "c-ok", email: "a@x.com", deletedAt: null, companyExcludedReason: null },
        { id: "c-bad", email: "b@y.com", deletedAt: null, companyExcludedReason: "competitor" },
      ], // candidates
      [], // P0-5 loadSuppressedEmails — none suppressed
      [{ delayDays: 0 }], // first step (allowed path only)
    ];

    const res = await POST(req(), { params: Promise.resolve({ id: "seq1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toMatchObject({ enrolled: 1, queued: 0, skipped: 1 });
    expect(recordAgentAction).not.toHaveBeenCalled();
    // Exactly one insert — the excluded contact was filtered before enrollment.
    expect(insertValues).toHaveBeenCalledTimes(1);
  });
});
