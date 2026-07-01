import { describe, it, expect, vi, beforeEach } from "vitest";

// The review approval used to feed the flywheel ONLY when the founder
// approved a draft WITHOUT edits (`if (!hasEdits)`). The edited final — the
// strongest teaching signal, and the one with fuel from the very first edit —
// was dropped. These tests pin the fix: an approval always records a flywheel
// candidate, tagged "user_edited" when the founder changed the draft and
// "user_approved" when they did not. Trust scoring is unchanged (an edit is
// still weaker autonomy).

const h = vi.hoisted(() => ({
  emailRow: { subject: "Subject line", bodyHtml: "<p>final body</p>", contactId: "c-1" },
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
      select: () => chain([h.emailRow]),
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

function approveReq(payload: Record<string, unknown>) {
  return new Request("http://localhost/api/outbound/review", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

describe("PUT /api/outbound/review — approval feeds the flywheel (edited + unedited)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getAuthContext as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      tenantId: "tenant-1",
      userId: "user-1",
      appUserId: "app-1",
    });
  });

  it("records a candidate tagged user_edited when the founder edits the draft", async () => {
    await route.PUT(approveReq({ emailId: "e-1", action: "approve", bodyHtml: "<p>edited</p>" }));

    expect(recordFlywheelCandidate).toHaveBeenCalledTimes(1);
    const args = (recordFlywheelCandidate as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[0]).toBe("draft-email");
    expect(args[3]).toBe("tenant-1");
    expect(args[4]).toBe("user_edited");
    // the output captured is the (edited) final row, not a placeholder
    expect(args[2]).toContain("final body");

    expect(recordAutonomyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "approved_with_edit" }),
    );
  });

  it("records a candidate tagged user_approved when approved without edits", async () => {
    await route.PUT(approveReq({ emailId: "e-2", action: "approve" }));

    expect(recordFlywheelCandidate).toHaveBeenCalledTimes(1);
    const args = (recordFlywheelCandidate as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(args[4]).toBe("user_approved");

    expect(recordAutonomyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "approved_no_edit" }),
    );
  });

  it("does not record a candidate on skip", async () => {
    await route.PUT(approveReq({ emailId: "e-3", action: "skip" }));
    expect(recordFlywheelCandidate).not.toHaveBeenCalled();
  });
});
