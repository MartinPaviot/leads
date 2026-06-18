/**
 * CLE-13 — the deferred sequence-enrollment executor's DB behavior (the trust
 * boundary): it enrolls ONLY contacts that belong to the tenant + aren't
 * soft-deleted (re-validated here, since sequenceEnrollments has no tenantId
 * column and the payload is replayed from approval), skips already-enrolled
 * contacts, and is tenant-scoped on the sequence. Review-found H1.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Ordered result queue the mocked db.select chain shifts from, in call order.
const selectQueue: unknown[][] = [];
const insertedValues: Array<Record<string, unknown>> = [];

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => {
          const result = selectQueue.shift() ?? [];
          // Resolves both as an awaited query (.then) and via .limit(1).
          return {
            limit: () => Promise.resolve(result),
            then: (res: (v: unknown) => void) => res(result),
          };
        },
      }),
    })),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        insertedValues.push(v);
        return Promise.resolve(undefined);
      },
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  tasks: {}, deals: {}, companies: {}, contacts: { id: "id", tenantId: "tenant_id", deletedAt: "deleted_at" },
  sequences: { id: "id", tenantId: "tenant_id" },
  sequenceEnrollments: { id: "id", sequenceId: "sequence_id", contactId: "contact_id" },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
  isNull: (...a: unknown[]) => a,
  ne: (...a: unknown[]) => a,
}));

vi.mock("@/lib/emails/deliver-interactive", () => ({ deliverInteractiveEmail: vi.fn() }));

import { executeAgentAction } from "@/lib/agents/action-executors";

const action = (payload: Record<string, unknown>) => ({
  id: "a1", userId: null, actionType: "sequence-enrollment", payload,
});

beforeEach(() => {
  selectQueue.length = 0;
  insertedValues.length = 0;
});

describe("sequence-enrollment executor — tenant/deletedAt trust boundary (H1)", () => {
  it("enrolls only tenant-valid, non-deleted, not-already-enrolled contacts", async () => {
    // 1) sequence belongs to tenant
    selectQueue.push([{ id: "seq1" }]);
    // 2) valid contacts: c2 is excluded (cross-tenant / soft-deleted)
    selectQueue.push([{ id: "c1" }, { id: "c3" }]);
    // 3) existing-enrollment check for c1 -> none; 4) for c3 -> already enrolled
    selectQueue.push([]); // c1
    selectQueue.push([{ id: "e1" }]); // c3 already enrolled

    const r = await executeAgentAction(
      "t1",
      action({ sequenceId: "seq1", sequenceName: "Hot leads", contactIds: ["c1", "c2", "c3"] }),
    );

    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detail).toBe("Enrolled 1 contact in Hot leads (2 skipped).");
    // Only c1 inserted (c2 invalid, c3 already enrolled).
    expect(insertedValues).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({ sequenceId: "seq1", contactId: "c1", status: "active", currentStep: 1 });
  });

  it("fails closed when the sequence is not the tenant's (no inserts)", async () => {
    selectQueue.push([]); // sequence lookup -> none for this tenant
    const r = await executeAgentAction("t1", action({ sequenceId: "seqX", contactIds: ["c1"] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sequence not found/);
    expect(insertedValues).toHaveLength(0);
  });

  it("enrolls nobody (ok, all skipped) when no contact survives re-validation", async () => {
    selectQueue.push([{ id: "seq1" }]); // sequence ok
    selectQueue.push([]); // no valid contacts (all cross-tenant / deleted)
    const r = await executeAgentAction("t1", action({ sequenceId: "seq1", contactIds: ["c1", "c2"] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.detail).toBe("Enrolled 0 contacts in the sequence (2 skipped).");
    expect(insertedValues).toHaveLength(0);
  });
});
