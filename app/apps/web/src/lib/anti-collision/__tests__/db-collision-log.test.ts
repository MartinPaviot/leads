import { describe, it, expect } from "vitest";
import { recordCollisionRow, getRecentCollisions, countCollisions } from "../db-collision-log";
import type { CollisionRecord } from "../collision";

const record: CollisionRecord = { contactId: "c1", blockedEnrollmentId: "seq2:c1", heldBy: "seq1:c1", atMs: 1000 };

// Stub db: recordCollisionRow does insert().values(); getRecentCollisions does
// select().from().where().orderBy().limit(); countCollisions awaits
// select().from().where() directly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { onInsert?: (v: any) => void; rows?: any[]; countRow?: any; throwInsert?: boolean } = {}): any {
  const rows = opts.rows ?? [];
  const afterWhere: any = {
    orderBy: () => ({ limit: () => Promise.resolve(rows) }),
    then: (res: any, rej: any) => Promise.resolve([opts.countRow ?? { total: 0, wouldHaveBlocked: 0, enforced: 0 }]).then(res, rej),
  };
  return {
    insert: () => ({ values: async (v: any) => { if (opts.throwInsert) throw new Error("db down"); opts.onInsert?.(v); } }),
    select: () => ({ from: () => ({ where: () => afterWhere }) }),
  };
}

describe("recordCollisionRow", () => {
  it("persists the collision with the enforced flag", async () => {
    let inserted: any;
    await recordCollisionRow("t1", record, false, stubDb({ onInsert: (v) => (inserted = v) }));
    expect(inserted).toMatchObject({
      tenantId: "t1", contactId: "c1", blockedEnrollmentId: "seq2:c1", heldBy: "seq1:c1", enforced: false,
    });
  });

  it("is best-effort — never throws on a db error", async () => {
    await expect(recordCollisionRow("t1", record, true, stubDb({ throwInsert: true }))).resolves.toBeUndefined();
  });
});

describe("getRecentCollisions", () => {
  it("returns the rows for a tenant", async () => {
    const rows = [{ id: "x", contactId: "c1", blockedEnrollmentId: "seq2:c1", heldBy: "seq1:c1", enforced: false, createdAt: null }];
    const out = await getRecentCollisions("t1", { sinceMs: 0, database: stubDb({ rows }) });
    expect(out).toEqual(rows);
  });

  it("returns [] on a db error (best-effort)", async () => {
    const bad: any = { select: () => { throw new Error("boom"); } };
    expect(await getRecentCollisions("t1", { database: bad })).toEqual([]);
  });
});

describe("countCollisions", () => {
  it("splits total into would-have-blocked vs enforced", async () => {
    const out = await countCollisions("t1", {
      sinceMs: 0,
      database: stubDb({ countRow: { total: 5, wouldHaveBlocked: 5, enforced: 0 } }),
    });
    expect(out).toEqual({ total: 5, wouldHaveBlocked: 5, enforced: 0 });
  });

  it("returns zeros on a db error (best-effort)", async () => {
    const bad: any = { select: () => { throw new Error("boom"); } };
    expect(await countCollisions("t1", { database: bad })).toEqual({ total: 0, wouldHaveBlocked: 0, enforced: 0 });
  });
});
