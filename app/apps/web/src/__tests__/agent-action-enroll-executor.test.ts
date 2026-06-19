/**
 * CLE-13 — the deferred sequence-enrollment executor's DB behavior (the trust
 * boundary): it enrolls ONLY contacts that belong to the tenant + aren't
 * soft-deleted (re-validated here, since sequenceEnrollments has no tenantId
 * column and the payload is replayed from approval), skips already-enrolled
 * contacts, and is tenant-scoped on the sequence. Review-found H1.
 *
 * The drizzle predicates are NOT stubbed to identity — eq/inArray/isNull return
 * structured ops and every WHERE is captured, so the test PROVES the contacts
 * re-validation query actually carries eq(contacts.tenantId), isNull(deletedAt),
 * and inArray(contacts.id) — a future edit dropping the tenant scope fails here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Ordered result queue the mocked db.select chain shifts from, in call order.
const selectQueue: unknown[][] = [];
const insertedValues: Array<Record<string, unknown>> = [];
// Every WHERE predicate the executor builds, in call order, for assertion.
const wherePredicates: unknown[] = [];

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        // generic select: .from().where()  (resolves as awaited or via .limit)
        where: (cond: unknown) => {
          wherePredicates.push(cond);
          const result = selectQueue.shift() ?? [];
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
  tasks: {}, deals: {}, companies: {},
  contacts: { id: "contacts.id", tenantId: "contacts.tenantId", deletedAt: "contacts.deletedAt" },
  sequences: { id: "sequences.id", tenantId: "sequences.tenantId" },
  sequenceEnrollments: { id: "se.id", sequenceId: "se.sequenceId", contactId: "se.contactId" },
}));

// Structured ops (NOT identity) so the captured predicate is introspectable.
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ op: "and", args }),
  eq: (col: unknown, val: unknown) => ({ op: "eq", col, val }),
  inArray: (col: unknown, vals: unknown) => ({ op: "inArray", col, vals }),
  isNull: (col: unknown) => ({ op: "isNull", col }),
  ne: (col: unknown, val: unknown) => ({ op: "ne", col, val }),
}));

vi.mock("@/lib/emails/deliver-interactive", () => ({ deliverInteractiveEmail: vi.fn() }));

import { executeAgentAction } from "@/lib/agents/action-executors";

const action = (payload: Record<string, unknown>) => ({
  id: "a1", userId: null, actionType: "sequence-enrollment", payload,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const flatten = (p: any): any[] => (p && p.op === "and" ? p.args.flatMap(flatten) : [p]);

beforeEach(() => {
  selectQueue.length = 0;
  insertedValues.length = 0;
  wherePredicates.length = 0;
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

    // PROVE the contacts re-validation query is genuinely tenant+deletedAt scoped.
    const contactsPred = wherePredicates
      .map(flatten)
      .find((terms) => terms.some((t: { op?: string; col?: unknown }) => t?.op === "inArray" && t.col === "contacts.id"));
    expect(contactsPred, "contacts re-validation predicate must exist").toBeDefined();
    expect(contactsPred).toEqual(
      expect.arrayContaining([
        { op: "inArray", col: "contacts.id", vals: ["c1", "c2", "c3"] },
        { op: "eq", col: "contacts.tenantId", val: "t1" },
        { op: "isNull", col: "contacts.deletedAt" },
      ]),
    );
  });

  it("fails closed when the sequence is not the tenant's (no inserts)", async () => {
    selectQueue.push([]); // sequence lookup -> none for this tenant
    const r = await executeAgentAction("t1", action({ sequenceId: "seqX", contactIds: ["c1"] }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/sequence not found/);
    expect(insertedValues).toHaveLength(0);
    // The sequence lookup itself is tenant-scoped.
    const seqPred = wherePredicates
      .map(flatten)
      .find((terms) => terms.some((t: { op?: string; col?: unknown }) => t?.col === "sequences.id"));
    expect(seqPred).toEqual(
      expect.arrayContaining([
        { op: "eq", col: "sequences.id", val: "seqX" },
        { op: "eq", col: "sequences.tenantId", val: "t1" },
      ]),
    );
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
