import { describe, it, expect, vi, beforeEach } from "vitest";

// The drafting flywheel intake lives on TWO handlers of this route:
//  - PUT  action:"approve"      — single approve (edited/unedited). No prod
//    caller today, but wired: edited → user_edited, unedited → user_approved.
//  - POST action:"approve_all"  — the bulk path the campaign-wizard review UI
//    ACTUALLY calls. Records each approved draft as user_approved (the UI has
//    no inline edit → a bulk approval is always an unedited accept).
// These tests pin both, and that the flywheel input carries the step so
// distinct drafts to the same contact don't collide on the input-dedup.

const h = vi.hoisted(() => ({
  rows: [
    { subject: "Subject line", bodyHtml: "<p>final body</p>", contactId: "c-1", stepNumber: 2, enrollmentId: null },
  ] as Array<{
    subject: string | null;
    bodyHtml: string | null;
    contactId: string | null;
    stepNumber: number | null;
    enrollmentId: string | null;
  }>,
}));

vi.mock("@/db", () => {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit", "set", "values", "returning"]) c[m] = () => c;
    (c as { then: unknown }).then = (res: (v: unknown) => unknown) => res(result);
    return c;
  };
  return {
    db: {
      update: () => chain(undefined),
      select: () => chain(h.rows),
    },
  };
});

vi.mock("@/db/schema", () => ({
  outboundEmails: {
    id: "outbound_emails.id",
    tenantId: "outbound_emails.tenant_id",
    subject: "outbound_emails.subject",
    bodyHtml: "outbound_emails.body_html",
    contactId: "outbound_emails.contact_id",
    stepNumber: "outbound_emails.step_number",
    enrollmentId: "outbound_emails.enrollment_id",
    status: "outbound_emails.status",
  },
  contacts: { id: "contacts.id", tenantId: "contacts.tenant_id", deletedAt: "contacts.deleted_at" },
  companies: {},
  sequenceEnrollments: { id: "seq.id", sequenceId: "seq.sequence_id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: (...a: unknown[]) => ({ _eq: a }),
  and: (...a: unknown[]) => ({ _and: a }),
  inArray: (...a: unknown[]) => ({ _in: a }),
  isNull: (...a: unknown[]) => ({ _isNull: a }),
  sql: (...a: unknown[]) => ({ _sql: a }),
}));

vi.mock("@/lib/auth/auth-utils", () => ({ getAuthContext: vi.fn() }));
vi.mock("@/lib/guardrails/trust-score", () => ({ recordAutonomyEvent: vi.fn(() => Promise.resolve()) }));
vi.mock("@/lib/evals/flywheel", () => ({ recordFlywheelCandidate: vi.fn(() => Promise.resolve({ id: "fs-1" })) }));

import { getAuthContext } from "@/lib/auth/auth-utils";
import { recordAutonomyEvent } from "@/lib/guardrails/trust-score";
import { recordFlywheelCandidate } from "@/lib/evals/flywheel";

const route = await import("@/app/api/outbound/review/route");

const fw = () => recordFlywheelCandidate as unknown as ReturnType<typeof vi.fn>;

function putReq(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/outbound/review", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
function postReq(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/outbound/review", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

describe("PUT /api/outbound/review — single approve feeds the flywheel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // interactive draft (no enrollment) → agentId "draft-email"
    h.rows = [{ subject: "Subject line", bodyHtml: "<p>final body</p>", contactId: "c-1", stepNumber: 2, enrollmentId: null }];
    (getAuthContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenantId: "tenant-1",
      userId: "user-1",
      appUserId: "app-1",
    });
  });

  it("records user_edited (with step in the input) when the founder edits", async () => {
    await route.PUT(putReq({ emailId: "e-1", action: "approve", bodyHtml: "<p>edited</p>" }));
    expect(fw()).toHaveBeenCalledTimes(1);
    const args = fw().mock.calls[0];
    expect(args[0]).toBe("draft-email");
    expect(args[1]).toContain("(step 2)");
    expect(args[3]).toBe("tenant-1");
    expect(args[4]).toBe("user_edited");
    expect(args[2]).toContain("final body");
    expect(recordAutonomyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "approved_with_edit" }),
    );
  });

  it("records user_approved when approved without edits", async () => {
    await route.PUT(putReq({ emailId: "e-2", action: "approve" }));
    expect(fw()).toHaveBeenCalledTimes(1);
    expect(fw().mock.calls[0][4]).toBe("user_approved");
    expect(recordAutonomyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "approved_no_edit" }),
    );
  });

  it("does not record on skip", async () => {
    await route.PUT(putReq({ emailId: "e-3", action: "skip" }));
    expect(fw()).not.toHaveBeenCalled();
  });
});

describe("POST /api/outbound/review — bulk approve_all (the real UI path) feeds the flywheel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenantId: "tenant-1",
      userId: "user-1",
      appUserId: "app-1",
    });
  });

  it("captures sequence drafts under the GENERATING agent (send-sequence-step), one per row", async () => {
    // campaign review rows are sequence drafts → they carry an enrollmentId.
    h.rows = [
      { subject: "S1", bodyHtml: "<p>b1</p>", contactId: "c-1", stepNumber: 1, enrollmentId: "enr-1" },
      { subject: "S2", bodyHtml: "<p>b2</p>", contactId: "c-2", stepNumber: 3, enrollmentId: "enr-2" },
    ];
    await route.POST(postReq({ emailIds: ["e-1", "e-2"], action: "approve_all" }));

    expect(fw()).toHaveBeenCalledTimes(2);
    for (const call of fw().mock.calls) {
      // NOT "draft-email": a campaign approval must feed the agent that
      // generated it (personalizeStepEmail → send-sequence-step), or the loop
      // never closes for the sequence generator.
      expect(call[0]).toBe("send-sequence-step");
      expect(call[4]).toBe("user_approved");
      expect(call[3]).toBe("tenant-1");
    }
    // distinct steps → distinct inputs (won't collide on the input dedup)
    const inputs = fw().mock.calls.map((c) => c[1]);
    expect(inputs[0]).toContain("(step 1)");
    expect(inputs[1]).toContain("(step 3)");
    expect(inputs[0]).not.toBe(inputs[1]);
  });

  it("captures a non-enrollment draft under draft-email", async () => {
    h.rows = [{ subject: "S", bodyHtml: "<p>b</p>", contactId: "c-3", stepNumber: null, enrollmentId: null }];
    await route.POST(postReq({ emailIds: ["e-3"], action: "approve_all" }));
    expect(fw()).toHaveBeenCalledTimes(1);
    expect(fw().mock.calls[0][0]).toBe("draft-email");
  });

  it("does not record for a non-approve_all bulk action", async () => {
    await route.POST(postReq({ emailIds: ["e-1"], action: "something_else" }));
    expect(fw()).not.toHaveBeenCalled();
  });

  it("omits the step suffix when stepNumber is null", async () => {
    h.rows = [{ subject: "S", bodyHtml: "<p>b</p>", contactId: "c-9", stepNumber: null, enrollmentId: null }];
    await route.POST(postReq({ emailIds: ["e-9"], action: "approve_all" }));
    expect(fw()).toHaveBeenCalledTimes(1);
    expect(fw().mock.calls[0][1]).toBe("Draft email to contact c-9");
  });
});
