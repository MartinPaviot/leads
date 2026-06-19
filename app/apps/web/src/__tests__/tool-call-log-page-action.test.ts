import { describe, it, expect, vi, beforeEach } from "vitest";

// ── DB + schema mocks ──
// We capture the rows passed to insert and the set/where used by update so we
// can assert the audit row shape and the reversal transitions without a real DB.

interface InsertCapture {
  values: Record<string, unknown>;
}
interface UpdateCapture {
  set: Record<string, unknown>;
}

const inserts: InsertCapture[] = [];
const updates: UpdateCapture[] = [];
const deletes: unknown[] = [];
let nextInsertId = "evt-1";
// The single event row reverseToolCall/getLastReversibleCall read back.
let selectRows: Record<string, unknown>[] = [];
// What the sequence_step tenant-confinement join (innerJoin) returns — [] means
// the step's parent sequence is NOT owned by the acting tenant.
let stepOwnedRows: Record<string, unknown>[] = [];

vi.mock("@/db", () => ({
  db: {
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserts.push({ values: v });
        return { returning: () => Promise.resolve([{ id: nextInsertId }]) };
      },
    })),
    update: vi.fn(() => ({
      set: (s: Record<string, unknown>) => {
        updates.push({ set: s });
        return {
          where: () => ({ returning: () => Promise.resolve([{ id: "evt-1" }]) }),
        };
      },
    })),
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({ limit: () => Promise.resolve(selectRows) }),
          limit: () => Promise.resolve(selectRows),
        }),
        // sequence_step confinement: select(...).from(sequenceSteps).innerJoin(sequences,...).where(...).limit(1)
        innerJoin: () => ({
          where: () => ({ limit: () => Promise.resolve(stepOwnedRows) }),
        }),
      }),
    })),
    delete: vi.fn((tbl: unknown) => ({
      where: () => {
        deletes.push(tbl);
        return Promise.resolve(undefined);
      },
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  activities: {}, comments: {}, companies: {}, contacts: {}, deals: {},
  notes: {}, sequenceEnrollments: {}, sequenceSteps: {}, sequences: {},
  sharedPrompts: {}, tasks: {},
  toolCallEvents: {
    id: "id", tenantId: "tenant_id", userId: "user_id",
    status: "status", revertedAt: "reverted_at", executedAt: "executed_at",
    toolName: "tool_name",
  },
}));

vi.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a, desc: (x: unknown) => x, eq: (...a: unknown[]) => a,
  isNull: (x: unknown) => x,
}));

// cancelHeldOutbound is exercised by the outbound_send reverse arm; mock it.
const cancelHeldOutbound = vi.fn();
vi.mock("@/lib/emails/outbound-hold", () => ({
  cancelHeldOutbound: (...args: unknown[]) => cancelHeldOutbound(...args),
}));

import {
  logPageActionCall,
  reverseToolCall,
  reopenEvent,
  getLastReversibleCall,
  type ReversibleSnapshot,
} from "@/lib/chat/tool-call-log";

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  selectRows = [];
  stepOwnedRows = [];
  nextInsertId = "evt-1";
  cancelHeldOutbound.mockReset();
});

describe("CLE-11 logPageActionCall (scope a)", () => {
  it("AC-1/AC-3: a mutating action with a page_action inverse writes one executed row", async () => {
    const snapshot: ReversibleSnapshot = {
      type: "page_action",
      actionId: "opportunities.moveStage",
      inverse: { actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "qualified" } },
    };
    await logPageActionCall({
      tenantId: "t1", userId: "u1",
      actionId: "opportunities.moveStage",
      params: { dealId: "d1", stage: "won" },
      ok: true, summary: "Moved Acme to Won", surfaceType: "opportunities",
      snapshot,
    });

    expect(inserts).toHaveLength(1);
    const row = inserts[0].values;
    expect(row.toolName).toBe("invokePageAction:opportunities.moveStage");
    expect(row.args).toEqual({ actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "won" } });
    expect(row.status).toBe("executed");
    expect(row.surfaceType).toBe("opportunities");
    expect(row.snapshot).toEqual(snapshot);
    expect((row.snapshot as ReversibleSnapshot).type).toBe("page_action");
  });

  it("AC-4: ok:false writes a failed row with null snapshot + errorMessage", async () => {
    await logPageActionCall({
      tenantId: "t1", userId: "u1",
      actionId: "opportunities.moveStage",
      params: { dealId: "d1" },
      ok: false, error: "stage not found",
      // Even if a snapshot were supplied, a failed action is never reversible:
      snapshot: { type: "page_action", actionId: "x", inverse: { actionId: "x", params: {} } },
    });
    expect(inserts).toHaveLength(1);
    const row = inserts[0].values;
    expect(row.status).toBe("failed");
    // logToolCall coerces a null snapshot to undefined (drizzle then stores
    // NULL); the point is the row carries NO reversible snapshot.
    expect(row.snapshot ?? null).toBeNull();
    expect(row.errorMessage).toBe("stage not found");
  });

  it("E-1: reversible-declared but no usable undo descriptor → snapshot null", async () => {
    await logPageActionCall({
      tenantId: "t1", userId: "u1",
      actionId: "list.applyFilter",
      params: { sector: "fintech" },
      ok: true, summary: "Filtered",
      snapshot: null,
    });
    expect(inserts[0].values.snapshot ?? null).toBeNull();
  });
});

describe("CLE-11 reverseToolCall page_action arm (scope b)", () => {
  it("AC-5: returns an invokeAction directive for the inverse + marks reverted", async () => {
    selectRows = [{
      id: "evt-1", tenantId: "t1", userId: "u1", revertedAt: null,
      toolName: "invokePageAction:opportunities.moveStage",
      snapshot: {
        type: "page_action", actionId: "opportunities.moveStage",
        inverse: { actionId: "opportunities.moveStage", params: { dealId: "d1", stage: "qualified" } },
      },
    }];

    const res = await reverseToolCall("t1", "u1", "evt-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.directive).toBeDefined();
    const dir = (res.directive as Record<string, Record<string, unknown>>)._uiDirective;
    expect(dir.kind).toBe("invokeAction");
    expect(dir.actionId).toBe("opportunities.moveStage");
    expect(dir.params).toEqual({ dealId: "d1", stage: "qualified" });
    expect(dir.requireConfirm).toBe(false);
    expect(dir.reconcileEventId).toBe("evt-1");
    expect(res.reconcileEventId).toBe("evt-1");
    // optimistic reverted mark
    expect(updates.some((u) => u.set.status === "reverted")).toBe(true);
  });

  it("AC-6: a server-owned update snapshot restores server-side with NO directive", async () => {
    selectRows = [{
      id: "evt-1", tenantId: "t1", userId: "u1", revertedAt: null,
      toolName: "invokePageAction:opportunities.setField",
      snapshot: { type: "update", entity: "deal", id: "d1", before: { stage: "qualified" } },
    }];

    const res = await reverseToolCall("t1", "u1", "evt-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.directive).toBeUndefined();
    expect(updates.some((u) => u.set.status === "reverted")).toBe(true);
  });
});

describe("CLE-11 reverseToolCall outbound_send arm (scope c)", () => {
  const snap: ReversibleSnapshot = {
    type: "outbound_send", outboundEmailId: "oe-1",
    holdUntil: "2026-06-18T10:00:00.000Z", channel: "email",
  };

  it("AC-10: cancel within window → reverts the event", async () => {
    cancelHeldOutbound.mockResolvedValue({ canceled: true });
    selectRows = [{ id: "evt-1", tenantId: "t1", userId: "u1", revertedAt: null, toolName: "outbound", snapshot: snap }];

    const res = await reverseToolCall("t1", "u1", "evt-1");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(cancelHeldOutbound).toHaveBeenCalledWith("t1", "oe-1");
    expect(res.reversedAction).toContain("canceled");
    expect(updates.some((u) => u.set.status === "reverted")).toBe(true);
  });

  it("AC-11/E-5: after the window → refuses, does NOT revert the event", async () => {
    cancelHeldOutbound.mockResolvedValue({ canceled: false, reason: "already_sending_or_sent" });
    selectRows = [{ id: "evt-1", tenantId: "t1", userId: "u1", revertedAt: null, toolName: "outbound", snapshot: snap }];

    const res = await reverseToolCall("t1", "u1", "evt-1");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toContain("already sent");
    expect(res.error).toContain("2026-06-18T10:00:00.000Z");
    expect(updates.some((u) => u.set.status === "reverted")).toBe(false);
  });
});

describe("CLE-11 reverseToolCall create/sequence_step arm — tenant confinement (review H1)", () => {
  const forged = (id: string) => [{
    id: "evt-1", tenantId: "t1", userId: "u1", revertedAt: null,
    toolName: "invokePageAction:sequences.addStep",
    snapshot: { type: "create", entity: "sequence_step", id },
  }];

  it("does NOT delete a sequence_step whose parent sequence is not the tenant's (forged id)", async () => {
    selectRows = forged("foreign-step");
    stepOwnedRows = []; // parent sequence NOT owned by t1 → confinement check fails
    const res = await reverseToolCall("t1", "u1", "evt-1");
    expect(res.ok).toBe(true); // the attacker only reverts their own bogus event
    // CRITICAL: no DELETE was issued against the foreign step.
    expect(deletes).toHaveLength(0);
  });

  it("deletes a sequence_step the tenant DOES own (legit create-undo still works)", async () => {
    selectRows = forged("my-step");
    stepOwnedRows = [{ id: "my-step" }]; // parent sequence owned by t1
    const res = await reverseToolCall("t1", "u1", "evt-1");
    expect(res.ok).toBe(true);
    expect(deletes).toHaveLength(1);
  });
});

describe("CLE-11 reopenEvent + getLastReversibleCall (E-3 / AC-7)", () => {
  it("E-3: reopenEvent sets status executed + clears revertedAt", async () => {
    const ok = await reopenEvent("t1", "u1", "evt-1");
    expect(ok).toBe(true);
    const last = updates[updates.length - 1];
    expect(last.set.status).toBe("executed");
    expect(last.set.revertedAt).toBeNull();
  });

  it("AC-7: getLastReversibleCall skips a null-snapshot row and returns the next reversible one", async () => {
    selectRows = [
      { id: "evt-2", snapshot: null }, // a non-reversible PAR row
      { id: "evt-1", snapshot: { type: "page_action", actionId: "a", inverse: { actionId: "a", params: {} } } },
    ];
    const row = await getLastReversibleCall("t1", "u1");
    expect(row?.id).toBe("evt-1");
  });

  it("AC-16: reverseToolCall refuses an event not found for this tenant/user", async () => {
    selectRows = []; // scoped query returns nothing
    const res = await reverseToolCall("t1", "u1", "evt-x");
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("Event not found");
  });
});
