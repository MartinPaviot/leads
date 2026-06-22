// @vitest-environment node
//
// Live integration for the Postgres meter store (spec 02, AC1/AC4). Proves the
// real atomic decrement + ref idempotency against Postgres. Gated: runs only
// when METERING_DB_TEST=1 with DATABASE_URL pointing at a dev DB. Creates and
// deletes a throwaway tenant.
//
//   METERING_DB_TEST=1 DATABASE_URL=<localdev> pnpm test db-store.integration
import { describe, it, expect } from "vitest";
import { db } from "@/db";
import { tenants, creditLedger, workspaceBudgets } from "@/db/schema";
import { eq } from "drizzle-orm";
import { meter, type MeterOp } from "../meter";
import { dbMeterStore } from "../db-store";
import { BudgetExhausted } from "../budget";

const RUN = process.env.METERING_DB_TEST === "1";

describe.runIf(RUN)("DbMeterStore (live)", () => {
  it("decrements atomically, blocks at zero, and never double-charges on retry", async () => {
    const [t] = await db.insert(tenants).values({ name: "metering-test" }).returning({ id: tenants.id });
    const ws = t.id;
    const op = (over: Partial<MeterOp> = {}): MeterOp => ({ workspace: ws, kind: "enrich", provider: "apollo", amount: 10, ref: "ref-a", ...over });

    try {
      await db.insert(workspaceBudgets).values({ tenantId: ws, scopeKey: "ws", limitAmount: 25, remainingAmount: 25 });

      // First charge.
      const r1 = await meter(dbMeterStore, op(), async () => ({ n: 1 }));
      expect(r1).toEqual({ n: 1 });

      // Retry same ref -> prior result, no second charge.
      let calls = 0;
      const r2 = await meter(dbMeterStore, op(), async () => { calls++; return { n: 2 }; });
      expect(r2).toEqual({ n: 1 });
      expect(calls).toBe(0);

      const ledgerRows = await db.select({ id: creditLedger.id }).from(creditLedger).where(eq(creditLedger.tenantId, ws));
      expect(ledgerRows.length).toBe(1);

      let [b] = await db.select({ remaining: workspaceBudgets.remainingAmount }).from(workspaceBudgets).where(eq(workspaceBudgets.tenantId, ws));
      expect(b.remaining).toBe(15); // charged once

      // Concurrent fresh refs draining the budget: only one of the last pair fits.
      await meter(dbMeterStore, op({ ref: "ref-b" }), async () => "b"); // 15 -> 5
      await expect(meter(dbMeterStore, op({ ref: "ref-c", amount: 10 }), async () => "c")).rejects.toBeInstanceOf(BudgetExhausted);

      [b] = await db.select({ remaining: workspaceBudgets.remainingAmount }).from(workspaceBudgets).where(eq(workspaceBudgets.tenantId, ws));
      expect(b.remaining).toBe(5); // exhausted call left it untouched
    } finally {
      await db.delete(creditLedger).where(eq(creditLedger.tenantId, ws));
      await db.delete(workspaceBudgets).where(eq(workspaceBudgets.tenantId, ws));
      await db.delete(tenants).where(eq(tenants.id, ws));
    }
  });
});
