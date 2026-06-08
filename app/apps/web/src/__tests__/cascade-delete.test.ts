import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for the Account cascade soft-delete helper.
 *
 * The DB is mocked so we assert behaviour, not rows: which tables get updated
 * for a given selection, the ordering invariant (contacts deleted LAST so the
 * polymorphic activities/notes/tasks sweep still sees their ids), and the
 * per-type counts returned from `.returning()`.
 */

// Each schema table carries a `__t` tag so the mock can tell which table a
// db.update(table) / .from(table) call targeted.
vi.mock("@/db/schema", () => ({
  contacts: { __t: "contacts", id: "id", tenantId: "tenantId", companyId: "companyId", deletedAt: "deletedAt" },
  deals: { __t: "deals", id: "id", tenantId: "tenantId", companyId: "companyId", deletedAt: "deletedAt" },
  activities: { __t: "activities", id: "id", tenantId: "tenantId", entityId: "entityId", deletedAt: "deletedAt" },
  notes: { __t: "notes", id: "id", tenantId: "tenantId", entityId: "entityId", deletedAt: "deletedAt" },
  tasks: { __t: "tasks", id: "id", tenantId: "tenantId", entityId: "entityId", deletedAt: "deletedAt" },
}));

vi.mock("drizzle-orm", () => ({
  and: vi.fn((...args) => ({ _and: args })),
  eq: vi.fn((a, b) => ({ _eq: [a, b] })),
  isNull: vi.fn(() => "isNull"),
  inArray: vi.fn((col, vals) => ({ _inArray: [col, vals] })),
}));

vi.mock("@/db", () => ({ db: { update: vi.fn(), select: vi.fn() } }));

import { db } from "@/db";
import { getCompanyRelatedCounts, cascadeSoftDeleteCompany, CASCADE_TYPES } from "@/lib/accounts/cascade-delete";

type TableTag = "contacts" | "deals" | "activities" | "notes" | "tasks";

/** db.update(table).set().where().returning() resolves to `map[table]` (default []). */
function mockUpdate(map: Partial<Record<TableTag, Array<{ id: string }>>>) {
  vi.mocked(db.update).mockImplementation((table: unknown) => {
    const tag = (table as { __t: TableTag }).__t;
    const returningFn = vi.fn().mockResolvedValue(map[tag] ?? []);
    const whereFn = vi.fn().mockReturnValue({ returning: returningFn });
    const setFn = vi.fn().mockReturnValue({ where: whereFn });
    return { set: setFn } as never;
  });
}

/** db.select().from(table).where() resolves to `map[table]` (default []). */
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

/** The tables that db.update() was called against, in call order. */
function updatedTablesInOrder(): TableTag[] {
  return vi.mocked(db.update).mock.calls.map((c) => (c[0] as unknown as { __t: TableTag }).__t);
}

beforeEach(() => vi.clearAllMocks());

describe("CASCADE_TYPES", () => {
  it("covers the five related sets", () => {
    expect([...CASCADE_TYPES]).toEqual(["contacts", "deals", "activities", "notes", "tasks"]);
  });
});

describe("cascadeSoftDeleteCompany", () => {
  it("no-ops with an empty selection (no db writes)", async () => {
    mockUpdate({});
    mockSelect({});
    const out = await cascadeSoftDeleteCompany("t1", "co1", []);
    expect(out).toEqual({});
    expect(db.update).not.toHaveBeenCalled();
    expect(db.select).not.toHaveBeenCalled();
  });

  it("deals-only: updates just the deals table, no contact lookup", async () => {
    mockUpdate({ deals: [{ id: "d1" }, { id: "d2" }] });
    mockSelect({});
    const out = await cascadeSoftDeleteCompany("t1", "co1", ["deals"]);
    expect(out).toEqual({ deals: 2 });
    expect(updatedTablesInOrder()).toEqual(["deals"]);
    // No polymorphic types selected → no contact-id lookup needed.
    expect(db.select).not.toHaveBeenCalled();
  });

  it("activities require a contact-id lookup (polymorphic scope)", async () => {
    mockUpdate({ activities: [{ id: "a1" }] });
    mockSelect({ contacts: [{ id: "ct1" }, { id: "ct2" }] });
    const out = await cascadeSoftDeleteCompany("t1", "co1", ["activities"]);
    expect(out).toEqual({ activities: 1 });
    expect(db.select).toHaveBeenCalledTimes(1); // companyContactIds
    expect(updatedTablesInOrder()).toEqual(["activities"]);
  });

  it("deletes contacts LAST so the polymorphic sweep still sees their ids", async () => {
    mockUpdate({
      contacts: [{ id: "ct1" }],
      activities: [{ id: "a1" }],
      notes: [{ id: "n1" }],
      tasks: [{ id: "tk1" }],
    });
    mockSelect({ contacts: [{ id: "ct1" }] });
    const out = await cascadeSoftDeleteCompany("t1", "co1", ["contacts", "activities", "notes", "tasks"]);
    expect(out).toEqual({ contacts: 1, activities: 1, notes: 1, tasks: 1 });
    const order = updatedTablesInOrder();
    expect(order[order.length - 1]).toBe("contacts");
    expect(order).toEqual(["activities", "notes", "tasks", "contacts"]);
  });

  it("returns a count per selected type from .returning()", async () => {
    mockUpdate({ contacts: [{ id: "ct1" }, { id: "ct2" }], deals: [{ id: "d1" }] });
    mockSelect({ contacts: [{ id: "ct1" }, { id: "ct2" }] });
    const out = await cascadeSoftDeleteCompany("t1", "co1", ["contacts", "deals"]);
    expect(out).toEqual({ contacts: 2, deals: 1 });
  });
});

describe("getCompanyRelatedCounts", () => {
  it("counts each related set (live, non-deleted)", async () => {
    mockSelect({
      contacts: [{ id: "ct1" }, { id: "ct2" }],
      deals: [{ id: "d1" }],
      activities: [{ id: "a1" }, { id: "a2" }, { id: "a3" }],
      notes: [],
      tasks: [{ id: "tk1" }],
    });
    const counts = await getCompanyRelatedCounts("t1", "co1");
    expect(counts).toEqual({ contacts: 2, deals: 1, activities: 3, notes: 0, tasks: 1 });
  });
});
