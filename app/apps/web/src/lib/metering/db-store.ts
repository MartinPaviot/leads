/**
 * Postgres MeterStore (spec 02, AC1/AC4). The atomic budget decrement is a
 * single conditional UPDATE per scope (`SET remaining = remaining - amt WHERE
 * remaining >= amt RETURNING`) inside one transaction, so concurrent callers
 * can't both pass an exhausted budget (no check-then-act race). The ledger
 * insert is idempotent on (tenant_id, ref).
 */
import { db } from "@/db";
import { creditLedger, workspaceBudgets } from "@/db/schema";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { MeterStore, MeterCharge } from "./store";
import { BudgetExhausted, scopeKeys, type BudgetScope } from "./budget";

export class DbMeterStore implements MeterStore {
  async findCharge(workspace: string, ref: string) {
    const [row] = await db
      .select({ result: creditLedger.result })
      .from(creditLedger)
      .where(and(eq(creditLedger.tenantId, workspace), eq(creditLedger.ref, ref)))
      .limit(1);
    return row ? { result: row.result } : null;
  }

  async decrementBudgets(scope: BudgetScope, amount: number): Promise<number | null> {
    const keys = scopeKeys(scope);
    return db.transaction(async (tx) => {
      // Which scopes have a configured budget (and their current remaining).
      const present = await tx
        .select({ scopeKey: workspaceBudgets.scopeKey, remaining: workspaceBudgets.remainingAmount })
        .from(workspaceBudgets)
        .where(and(eq(workspaceBudgets.tenantId, scope.workspace), inArray(workspaceBudgets.scopeKey, keys)));

      let wsRemaining: number | null = null;
      for (const b of present) {
        const updated = await tx
          .update(workspaceBudgets)
          .set({ remainingAmount: sql`${workspaceBudgets.remainingAmount} - ${amount}`, updatedAt: sql`now()` })
          .where(
            and(
              eq(workspaceBudgets.tenantId, scope.workspace),
              eq(workspaceBudgets.scopeKey, b.scopeKey),
              gte(workspaceBudgets.remainingAmount, amount),
            ),
          )
          .returning({ remaining: workspaceBudgets.remainingAmount });
        if (updated.length === 0) {
          // Exists but can't cover -> exhausted; throwing rolls back earlier decrements.
          throw new BudgetExhausted(scope, b.scopeKey, amount, b.remaining);
        }
        if (b.scopeKey === "ws") wsRemaining = updated[0].remaining;
      }
      return wsRemaining;
    });
  }

  async refundBudgets(scope: BudgetScope, amount: number): Promise<void> {
    const keys = scopeKeys(scope);
    await db
      .update(workspaceBudgets)
      .set({
        remainingAmount: sql`LEAST(${workspaceBudgets.limitAmount}, ${workspaceBudgets.remainingAmount} + ${amount})`,
        updatedAt: sql`now()`,
      })
      .where(and(eq(workspaceBudgets.tenantId, scope.workspace), inArray(workspaceBudgets.scopeKey, keys)));
  }

  async recordCharge(charge: MeterCharge): Promise<{ inserted: boolean; priorResult?: unknown }> {
    const inserted = await db
      .insert(creditLedger)
      .values({
        tenantId: charge.workspace,
        campaignId: charge.campaign ?? null,
        accountId: charge.account ?? null,
        kind: charge.kind,
        provider: charge.provider,
        amount: charge.amount,
        balanceAfter: charge.balanceAfter,
        ref: charge.ref,
        cacheHit: charge.cacheHit ?? false,
        result: charge.result as never,
      })
      .onConflictDoNothing({ target: [creditLedger.tenantId, creditLedger.ref] })
      .returning({ id: creditLedger.id });

    if (inserted.length > 0) return { inserted: true };

    const prior = await this.findCharge(charge.workspace, charge.ref);
    return { inserted: false, priorResult: prior?.result };
  }
}

export const dbMeterStore = new DbMeterStore();
