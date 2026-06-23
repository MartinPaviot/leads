/**
 * meter(op, fn) middleware (spec 02, AC2/AC3). Pre-checks the budget, runs the
 * call, records the charge — idempotent on a caller-supplied `ref` so retries
 * never double-charge and a repeated ref returns the prior result without
 * re-running the provider. Budget-block raises a typed BudgetExhausted.
 *
 * Order: idempotency -> budget decrement -> execute -> record. On fn failure or
 * a concurrent same-ref winner, the budget decrement is refunded so a failed /
 * deduplicated call never consumes budget.
 */
import type { MeterStore, MeterCharge } from "./store";
import type { BudgetScope } from "./budget";

export interface MeterOp {
  /** Workspace (tenant) id. */
  workspace: string;
  campaign?: string;
  segment?: string;
  account?: string;
  /** Charge category, e.g. "enrich" | "search" | "verify" | "send". */
  kind: string;
  provider: string;
  /** Credit-units this call costs. */
  amount: number;
  /** Caller-supplied idempotency key. */
  ref: string;
  /** Whether the result was served from cache (recorded for AC5). */
  cacheHit?: boolean;
}

function scopeOf(op: MeterOp): BudgetScope {
  return { workspace: op.workspace, campaign: op.campaign, segment: op.segment };
}

/**
 * Run `fn` under metering. Throws BudgetExhausted before running `fn` when the
 * budget can't cover `op.amount`.
 */
export async function meter<T>(store: MeterStore, op: MeterOp, fn: () => Promise<T>): Promise<T> {
  // 1. Idempotency: a prior charge for this ref returns its stored result.
  const prior = await store.findCharge(op.workspace, op.ref);
  if (prior) return prior.result as T;

  const scope = scopeOf(op);

  // 2. Budget gate — atomic decrement; throws BudgetExhausted if exhausted.
  const balanceAfter = await store.decrementBudgets(scope, op.amount);

  let result: T;
  try {
    // 3. Execute the actual call.
    result = await fn();
  } catch (err) {
    // Failed call must not consume budget.
    await store.refundBudgets(scope, op.amount);
    throw err;
  }

  // 4. Record the charge idempotently. A concurrent same-ref winner means we
  //    double-decremented — refund ours and return the winner's result.
  const charge: MeterCharge = {
    workspace: op.workspace,
    campaign: op.campaign ?? null,
    account: op.account ?? null,
    kind: op.kind,
    provider: op.provider,
    amount: op.amount,
    ref: op.ref,
    cacheHit: op.cacheHit ?? false,
    result,
    balanceAfter,
  };
  const rec = await store.recordCharge(charge);
  if (!rec.inserted) {
    await store.refundBudgets(scope, op.amount);
    return rec.priorResult as T;
  }
  return result;
}
