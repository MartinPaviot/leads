# 02 — Metering and Budget

> Feature-spec. Inherits `/spec/steering` (design X3, methodology X3). Brownfield: T0 is reconciliation. This rouage is the margin guardrail; it is load-bearing for Gate 1.

## requirements.md

**Context.** Implements credit metering and budget enforcement (design X3, methodology "Credit governance"). Depends on 00. Depended on by every external credit-consuming call: adapters (01/05/06/08/17), agent-service (04), sending (23/24).

**Story.** As the engine, I want every external credit-consuming call metered and every budget enforced, so cost-per-qualified-account stays under the price point and no run can overspend silently.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL append a `credit_ledger` row for every metered call: workspace, campaign?, account?, kind, provider, amount, balance_after, ref.
- AC2. WHEN a metered call is about to run, THE SYSTEM SHALL check the budget at workspace/campaign/segment scope and SHALL block the call IF the budget is exhausted, surfacing a typed `BudgetExhausted` rather than failing opaquely.
- AC3. THE SYSTEM SHALL expose a `meter(op, fn)` middleware that runs the pre-check, executes, and records cost, and SHALL be idempotent on a caller-supplied `ref` so retries never double-charge.
- AC4. THE SYSTEM SHALL decrement the budget counter atomically under concurrency.
- AC5. THE SYSTEM SHALL expose cost-per-qualified-account and cache-hit-rate as queryable metrics.

**Out of scope.** The provider calls themselves; pricing/plan/billing logic; the dashboard UI.

**Open questions.** Existing ledger/usage code. Is Upstash Redis wired.

## design.md

**Data slice.** Writes `credit_ledger`; reads budget counters (Redis) and `account.qualification` (for cost-per-qualified).

**Interfaces.**
- `meter<T>(op: MeterOp, fn: () => Promise<T>): Promise<T>`
- `checkBudget(scope): boolean`
- `metrics.costPerQualifiedAccount(scope)`, `metrics.cacheHitRate(scope)`

**Determinism boundary.** Fully deterministic.

**Error & idempotency.** Ledger unique on `ref`. Budget decrement via atomic Redis op or lock. `meter` re-entrant: a repeated `ref` returns the prior result without re-charging.

**Blast radius.** `metering/*`, `db/ledger`. Forbidden: `/spec/steering`, adapter internals.

## tasks.md

- T0 (reconcile): audit existing ledger/usage/budget code against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): concurrency test (no double-charge on retry); budget-exhaustion test.
- T2: ledger table + writes. DoD: AC1 green.
- T3: budget counters + atomic decrement. DoD: AC4 green.
- T4: `meter()` middleware, idempotent on `ref`. DoD: AC2, AC3 green.
- T5: metrics queries. DoD: AC5 green.

## eval.md

- Deterministic: `pnpm test metering` green, including a concurrent-retry test proving a single `ref` charges once and a budget-at-zero test proving the call is blocked.
- Self-verify: `pnpm test metering && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; no double-charge under retry; budget blocks at zero; `RECONCILE.md` committed.
