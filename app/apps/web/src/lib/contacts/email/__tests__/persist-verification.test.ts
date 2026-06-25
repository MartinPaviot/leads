import { describe, it, expect } from "vitest";
import { verifyAndPersistEmailStatus } from "../persist-verification";
import type { VerifyProvider, VerifySignal } from "../verify-email";
import type { db as realDb } from "@/db";

/** Minimal drizzle-shaped fake covering the two chains persist-verification uses. */
function fakeDb(email: string | null) {
  const writes: Record<string, unknown>[] = [];
  const db = {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => (email ? [{ email }] : []) }) }) }),
    update: () => ({ set: (v: Record<string, unknown>) => ({ where: async () => { writes.push(v); } }) }),
  } as unknown as typeof realDb;
  return { db, writes };
}

const provider = (signal: VerifySignal | null): VerifyProvider => ({ name: "stub", cost: 0, verify: async () => signal });

describe("verifyAndPersistEmailStatus", () => {
  it("persists 'invalid' for a dead-domain contact", async () => {
    const { db, writes } = fakeDb("ceo@dead.com");
    const r = await verifyAndPersistEmailStatus("t1", "c1", { database: db, provider: provider({ domainOk: false }) });
    expect(r?.status).toBe("invalid");
    expect(writes).toEqual([{ emailStatus: "invalid" }]);
  });

  it("does NOT write when the verdict is 'unknown' (never clobber an existing signal)", async () => {
    const { db, writes } = fakeDb("ceo@maybe.com");
    const r = await verifyAndPersistEmailStatus("t1", "c1", { database: db, provider: provider({ domainOk: true }) });
    expect(r?.status).toBe("unknown");
    expect(writes).toEqual([]);
  });

  it("persists 'risky' for a disposable signal", async () => {
    const { db, writes } = fakeDb("x@temp.com");
    await verifyAndPersistEmailStatus("t1", "c1", { database: db, provider: provider({ disposable: true, domainOk: true }) });
    expect(writes).toEqual([{ emailStatus: "risky" }]);
  });

  it("returns null and writes nothing when the contact has no email", async () => {
    const { db, writes } = fakeDb(null);
    const r = await verifyAndPersistEmailStatus("t1", "c1", { database: db, provider: provider({ domainOk: false }) });
    expect(r).toBeNull();
    expect(writes).toEqual([]);
  });
});
