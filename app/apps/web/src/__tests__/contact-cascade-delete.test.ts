import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the Contact cascade soft-delete helper. A contact's related
 * data is the polymorphic activities/notes/tasks (matched by entityId); deals
 * are intentionally out of scope (they belong to the company).
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
import { getContactRelatedCounts, cascadeSoftDeleteContact, CONTACT_CASCADE_TYPES } from "@/lib/contacts/cascade-delete";

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

describe("CONTACT_CASCADE_TYPES", () => {
  it("is activities/notes/tasks (no deals)", () => {
    expect([...CONTACT_CASCADE_TYPES]).toEqual(["activities", "notes", "tasks"]);
  });
});

describe("cascadeSoftDeleteContact", () => {
  it("no-ops with an empty selection", async () => {
    mockUpdate({});
    const out = await cascadeSoftDeleteContact("t1", "ct1", []);
    expect(out).toEqual({});
    expect(db.update).not.toHaveBeenCalled();
  });

  it("updates only the selected tables and returns per-type counts", async () => {
    mockUpdate({ activities: [{ id: "a1" }, { id: "a2" }], tasks: [{ id: "tk1" }] });
    const out = await cascadeSoftDeleteContact("t1", "ct1", ["activities", "tasks"]);
    expect(out).toEqual({ activities: 2, tasks: 1 });
    expect(updatedTablesInOrder().sort()).toEqual(["activities", "tasks"]);
    // notes was not selected → not touched.
    expect(updatedTablesInOrder()).not.toContain("notes");
  });
});

describe("getContactRelatedCounts", () => {
  it("counts activities/notes/tasks for the contact", async () => {
    mockSelect({
      activities: [{ id: "a1" }, { id: "a2" }],
      notes: [{ id: "n1" }],
      tasks: [],
    });
    const counts = await getContactRelatedCounts("t1", "ct1");
    expect(counts).toEqual({ activities: 2, notes: 1, tasks: 0 });
  });
});
