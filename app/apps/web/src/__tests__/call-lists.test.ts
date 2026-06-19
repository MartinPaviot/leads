/**
 * Call lists repository — tenant-scoping guard + pure helpers.
 *
 * The repo is thin DB plumbing, so the meaningful unit test is that EVERY
 * read/write is constrained by tenantId (the app-layer isolation boundary): a
 * future edit that drops the filter would leak across tenants. We mock the
 * drizzle chain + operators so the test inspects the WHERE condition each
 * function builds, rather than the real SQL (the live binding is exercised by
 * the verify harness — same doctrine as call-sprint.test.ts).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let lastWhere: unknown = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const chain: any = {
  from: () => chain,
  where: (c: unknown) => {
    lastWhere = c;
    return chain;
  },
  orderBy: () => Promise.resolve([]),
  limit: () => Promise.resolve([]),
  set: () => chain,
  values: () => chain,
  returning: () => Promise.resolve([]),
};

vi.mock("@/db", () => ({
  db: {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
  },
}));
vi.mock("@/db/schema", () => ({
  callLists: {
    id: "col:id",
    tenantId: "col:tenant_id",
    campaignId: "col:campaign_id",
    ownerId: "col:owner_id",
    name: "col:name",
    kind: "col:kind",
    segment: "col:segment",
    sort: "col:sort",
    createdAt: "col:created_at",
    updatedAt: "col:updated_at",
  },
}));
vi.mock("drizzle-orm", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  and: (...xs: any[]) => ({ and: xs }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  desc: (col: unknown) => ({ desc: col }),
}));

import {
  listCallLists,
  getCallList,
  updateCallList,
  deleteCallList,
  coerceSort,
} from "@/lib/voice/call-lists";

/** Flatten the captured WHERE into its eq() pairs. */
function eqPairs(where: unknown): Array<[unknown, unknown]> {
  const w = where as { and?: Array<{ eq?: [unknown, unknown] }> } | { eq?: [unknown, unknown] };
  const parts = "and" in w && Array.isArray(w.and) ? w.and : [w];
  return parts
    .filter((p): p is { eq: [unknown, unknown] } => !!(p as { eq?: unknown }).eq)
    .map((p) => p.eq);
}

beforeEach(() => {
  lastWhere = null;
});

describe("call-lists repo tenant scoping", () => {
  it("listCallLists filters by tenantId + campaignId", async () => {
    await listCallLists("t1", "camp1");
    const eqs = eqPairs(lastWhere);
    expect(eqs).toContainEqual(["col:tenant_id", "t1"]);
    expect(eqs).toContainEqual(["col:campaign_id", "camp1"]);
  });

  it("getCallList filters by tenantId + id", async () => {
    await getCallList("t1", "L1");
    const eqs = eqPairs(lastWhere);
    expect(eqs).toContainEqual(["col:tenant_id", "t1"]);
    expect(eqs).toContainEqual(["col:id", "L1"]);
  });

  it("updateCallList scopes the write to tenantId + id", async () => {
    await updateCallList({ tenantId: "t1", id: "L1", name: "x" });
    const eqs = eqPairs(lastWhere);
    expect(eqs).toContainEqual(["col:tenant_id", "t1"]);
    expect(eqs).toContainEqual(["col:id", "L1"]);
  });

  it("deleteCallList scopes the delete to tenantId + id", async () => {
    await deleteCallList("t1", "L1");
    const eqs = eqPairs(lastWhere);
    expect(eqs).toContainEqual(["col:tenant_id", "t1"]);
    expect(eqs).toContainEqual(["col:id", "L1"]);
  });
});

describe("coerceSort", () => {
  it("keeps known keys and defaults anything else to fit", () => {
    expect(coerceSort("intent")).toBe("intent");
    expect(coerceSort("local_time")).toBe("local_time");
    expect(coerceSort("oldest_callback")).toBe("oldest_callback");
    expect(coerceSort("garbage")).toBe("fit");
    expect(coerceSort(undefined)).toBe("fit");
    expect(coerceSort(42)).toBe("fit");
  });
});
