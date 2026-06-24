import { describe, it, expect } from "vitest";
import { notifyTenant, regressionAlertCopy, optimizerProposalsCopy } from "../db-notify";
import type { Alert } from "@/lib/analytics/alerts/alerts";

// Stub db: notifyTenant does select({id,role}).from(users).where() then
// insert(notifications).values(rows).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { users?: any[]; onInsert?: (rows: any[]) => void } = {}) {
  return {
    select: () => ({ from: () => ({ where: () => Promise.resolve(opts.users ?? []) }) }),
    insert: () => ({ values: async (rows: any[]) => { opts.onInsert?.(rows); } }),
  } as any;
}

const alert = (over: Partial<Alert> = {}): Alert => ({
  key: "c1:replyRate", scope: "c1", metric: "replyRate", current: 0.01, baseline: 0.03, magnitude: 0.66,
  cause: "content", route: "weekly", ...over,
});

describe("notifyTenant", () => {
  it("inserts one system notification per admin recipient", async () => {
    let inserted: any[] = [];
    const res = await notifyTenant("t1", { title: "T", body: "B" }, {
      database: stubDb({ users: [{ id: "u1", role: "admin" }, { id: "u2", role: "member" }], onInsert: (r) => (inserted = r) }),
    });
    expect(res).toEqual({ delivered: 1, source: "admin", slack: false });
    expect(inserted).toHaveLength(1);
    expect(inserted[0]).toMatchObject({ tenantId: "t1", userId: "u1", type: "system", title: "T", body: "B" });
  });

  it("falls back to all users when there is no admin", async () => {
    const res = await notifyTenant("t1", { title: "T", body: "B" }, {
      database: stubDb({ users: [{ id: "u1", role: "member" }, { id: "u2", role: "member" }] }),
    });
    expect(res).toEqual({ delivered: 2, source: "all_users", slack: false });
  });

  it("is a no-op for a tenant with no users", async () => {
    let called = false;
    const res = await notifyTenant("t1", { title: "T", body: "B" }, {
      database: stubDb({ users: [], onInsert: () => (called = true) }),
    });
    expect(res).toEqual({ delivered: 0, source: "none", slack: false });
    expect(called).toBe(false);
  });
});

describe("copy helpers", () => {
  it("regressionAlertCopy renders metric, rates, and route", () => {
    const c = regressionAlertCopy(alert());
    expect(c.title).toContain("replyRate on c1");
    expect(c.body).toContain("1.0%");
    expect(c.body).toContain("3.0%");
    expect(c.body).toContain("66% worse");
    expect(c.body).toContain("weekly");
  });

  it("optimizerProposalsCopy pluralizes correctly", () => {
    expect(optimizerProposalsCopy(1, "2026-06-22").title).toContain("1 optimization proposal ");
    expect(optimizerProposalsCopy(3, "2026-06-22").title).toContain("3 optimization proposals ");
  });
});
