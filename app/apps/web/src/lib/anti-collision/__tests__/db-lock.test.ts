import { describe, it, expect, vi } from "vitest";
import { DbCollisionLock } from "../db-lock";

/**
 * Spec 14 — JS glue of the Postgres lock. The atomic one-winner property is a
 * SQL property (PK + ON CONFLICT ... setWhere) verified live against the DB;
 * here we pin the return-value mapping: a RETURNING row -> held; none -> lost.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function stubDb(opts: { returningRows?: any[]; selectRows?: any[] } = {}) {
  const deleteWhere = vi.fn(async () => {});
  const db = {
    insert: () => ({
      values: () => ({
        onConflictDoUpdate: () => ({
          returning: async () => opts.returningRows ?? [],
        }),
      }),
    }),
    select: () => ({ from: () => ({ where: () => ({ limit: async () => opts.selectRows ?? [] }) }) }),
    delete: () => ({ where: deleteWhere }),
    _deleteWhere: deleteWhere,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return db;
}

describe("DbCollisionLock", () => {
  it("acquire -> true when the upsert RETURNs a row (free / reclaimed / same holder)", async () => {
    const lock = new DbCollisionLock("t1", stubDb({ returningRows: [{ enrollmentId: "e1" }] }));
    expect(await lock.acquire("c1", "e1", 1000)).toBe(true);
  });

  it("acquire -> false when the upsert RETURNs nothing (held by another, not expired)", async () => {
    const lock = new DbCollisionLock("t1", stubDb({ returningRows: [] }));
    expect(await lock.acquire("c1", "e2", 1000)).toBe(false);
  });

  it("holder -> the live enrollment id, or null", async () => {
    expect(await new DbCollisionLock("t1", stubDb({ selectRows: [{ e: "e1" }] })).holder("c1")).toBe("e1");
    expect(await new DbCollisionLock("t1", stubDb({ selectRows: [] })).holder("c1")).toBeNull();
  });

  it("release issues a delete", async () => {
    const db = stubDb();
    await new DbCollisionLock("t1", db).release("c1");
    expect(db._deleteWhere).toHaveBeenCalledOnce();
  });
});
