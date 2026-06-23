/**
 * MeterStore — the persistence boundary the meter() middleware orchestrates
 * (spec 02). Two implementations: InMemoryMeterStore (deterministic tests) and
 * the Postgres DbMeterStore (db-store.ts, atomic). Keeping the boundary an
 * interface lets the idempotency + budget-block logic be unit-tested without a
 * DB, while the real atomicity is proven by a gated integration test.
 */
import { BudgetExhausted, scopeKeys, type BudgetScope } from "./budget";

export interface MeterCharge {
  workspace: string;
  campaign?: string | null;
  account?: string | null;
  kind: string;
  provider: string;
  amount: number;
  ref: string;
  cacheHit?: boolean;
  result: unknown;
  balanceAfter: number | null;
}

export interface MeterStore {
  /** Prior charge for (workspace, ref), or null. */
  findCharge(workspace: string, ref: string): Promise<{ result: unknown } | null>;
  /**
   * Atomically decrement every existing budget for the scope by `amount`.
   * Throws BudgetExhausted (rolling back) if any budget can't cover it. Returns
   * the workspace ("ws") remaining balance, or null when no budget is configured.
   */
  decrementBudgets(scope: BudgetScope, amount: number): Promise<number | null>;
  /** Add `amount` back to every existing budget for the scope (refund). */
  refundBudgets(scope: BudgetScope, amount: number): Promise<void>;
  /**
   * Record the charge idempotently on (workspace, ref). Returns
   * { inserted: true } on a fresh write, or { inserted: false, priorResult }
   * when the ref already existed (a concurrent winner).
   */
  recordCharge(charge: MeterCharge): Promise<{ inserted: boolean; priorResult?: unknown }>;
}

// ─── In-memory implementation (tests) ────────────────────────────

interface Budget {
  remaining: number;
  limit: number;
}

export class InMemoryMeterStore implements MeterStore {
  private charges = new Map<string, MeterCharge>(); // key: workspace|ref
  private budgets = new Map<string, Budget>(); // key: workspace|scopeKey

  /** Seed a budget for a scope key ("ws" | "campaign:x" | "segment:y"). */
  setBudget(workspace: string, scopeKey: string, limit: number): void {
    this.budgets.set(`${workspace}|${scopeKey}`, { remaining: limit, limit });
  }
  remaining(workspace: string, scopeKey: string): number | null {
    return this.budgets.get(`${workspace}|${scopeKey}`)?.remaining ?? null;
  }
  chargeCount(): number {
    return this.charges.size;
  }

  async findCharge(workspace: string, ref: string) {
    const c = this.charges.get(`${workspace}|${ref}`);
    return c ? { result: c.result } : null;
  }

  async decrementBudgets(scope: BudgetScope, amount: number): Promise<number | null> {
    const keys = scopeKeys(scope);
    const present = keys
      .map((k) => ({ k, b: this.budgets.get(`${scope.workspace}|${k}`) }))
      .filter((x): x is { k: string; b: Budget } => !!x.b);
    // Pre-check all (atomic semantics): block before touching any.
    for (const { k, b } of present) {
      if (b.remaining < amount) throw new BudgetExhausted(scope, k, amount, b.remaining);
    }
    for (const { b } of present) b.remaining -= amount;
    return this.budgets.get(`${scope.workspace}|ws`)?.remaining ?? null;
  }

  async refundBudgets(scope: BudgetScope, amount: number): Promise<void> {
    for (const k of scopeKeys(scope)) {
      const b = this.budgets.get(`${scope.workspace}|${k}`);
      if (b) b.remaining = Math.min(b.limit, b.remaining + amount);
    }
  }

  async recordCharge(charge: MeterCharge) {
    const key = `${charge.workspace}|${charge.ref}`;
    const existing = this.charges.get(key);
    if (existing) return { inserted: false, priorResult: existing.result };
    this.charges.set(key, charge);
    return { inserted: true };
  }
}
