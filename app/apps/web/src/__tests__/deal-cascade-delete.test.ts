import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the Deal (opportunity) cascade soft-delete helper. A deal's
 * related data is the polymorphic activities/notes/tasks (matched by entityId);
 * its company + contact are independent and never touched.
 */

vi.mock("@/db/schema", () => ({
  activities: { __t: "activities", id: "id", tenantId: "tenantId", entityId: "entityId", deletedAt: "deletedAt" },
  notes: { __t: "notes", id: "id", tenantId: "tenantId", entityId: "entityId", deletedAt: "deletedAt" },
  tasks: { __t: "tasks", id: "id", tenantId: "tenantId", entityId: "entityId", deletedAt: "deletedAt" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ _and: args })),
  eq: vi.fn((a, b) => ({ _eq: [a, b] })),
  isNull: vi.fn(() => "isNull"),
}));

vi.mock("@/db", () => ({ db: { update: vi.fn(), select: vi.fn() } }));

import { db } from "@/db";
import { getDealRelatedCounts, cascadeSoftDeleteDeal, DEAL_CASCADE_TYPES } from "@/lib/deals/cascade-delete";

type TableTag = "activities" | "notes" | "tasks";

function mockUpdate(map: Partial<Record<TableTag, Array<{ id: string }>>>) {
  vi.mocked(db.update).mockImplementation((table: unknown) => {
    const tag = (table as { __t: TableTag }).__t;
    const returningFn = vi.fn().mockResolvedValue(map[tag] ?? []);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    return { set: setFn } as never;
  });
}

function mockSelect(map: Partial<Record<TableTag, Array<{ id: string }>>>) {
  vi.mocked(db.select).mockImplementation(() => {
    let tag: TableTag | undefined;
    const whereFn = vi.fn().mockImplementation(() => Promise.resolve(tag ? map[tag] ?? [] : []));
    const fromFn = vi.fn().mockImplementation((t: { __t: TableTag }) => {
      tag = t.__t;
      return { where: whereFn };
    });
    return { from: fromFn } as never;
  });
}

function updatedTablesInOrder(): TableTag[] {
  return vi.mocked(db.update).mock.calls.map((c) => (c[0] as unknown as { __t: TableTag }).__t);
}

beforeEach(() => vi.clearAllMocks());

describe("DEAL_CASCADE_TYPES", () => {
  it("is activities/notes/tasks (company + contact stay)", () => {
    expect([...DEAL_CASCADE_TYPES]).toEqual(["activities", "notes", "tasks"]);
  });
});

describe("cascadeSoftDeleteDeal", () => {
  it("no-ops with an empty selection", async () => {
    mockUpdate({});
    const out = await cascadeSoftDeleteDeal("t1", "dl1", []);
    expect(out).toEqual({});
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates only the selected tables and returns per-type counts", async () => {
    mockUpdate({ notes: [{ id: "n1" }], activities: [{ id: "a1" }, { id: "a2" }, { id: "a3" }] });
    const out = await cascadeSoftDeleteDeal("t1", "dl1", ["activities", "notes"]);
    expect(out).toEqual({ activities: 3, notes: 1 });
    expect(updatedTablesInOrder().sort()).toEqual(["activities", "notes"]);
    expect(updatedTablesInOrder()).not.toContain("tasks");
  });
});

describe("getDealRelatedCounts", () => {
  it("counts activities/notes/tasks for the deal", async () => {
    mockSelect({ activities: [{ id: "a1" }], notes: [], tasks: [{ id: "tk1" }, { id: "tk2" }] });
    const counts = await getDealRelatedCounts("t1", "dl1");
    expect(counts).toEqual({ activities: 1, notes: 0, tasks: 2 });
  });
});
