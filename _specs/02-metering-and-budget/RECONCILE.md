# RECONCILE.md — Spec 02 Metering and Budget (T0)

> Read-only reconciliation, 5-finder audit, cited `file:line`. This rouage is the margin guardrail (load-bearing for Gate 1). Brownfield: real LLM-budget enforcement exists, but there is no ledger, no unified meter, and no atomic counter.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | `credit_ledger` row per call (workspace, campaign?, account?, kind, provider, amount, balance_after, ref) | **missing** | Only aggregation telemetry (`usage_events`/`llm_calls`/`visitor_id_charges`); no balance_after, ref, kind, or campaign/account scope |
| AC2 | Pre-call budget check, block w/ typed `BudgetExhausted` | **partial** | `enforceLlmBudget` blocks (throws `BudgetExceededError`); wrong type name, workspace-only scope, fails OPEN on read errors |
| AC3 | `meter(op, fn)` middleware, idempotent on `ref` | **partial** | No wrapper; `usageEvents` insert is unconditional → retries **double-charge**; pieces exist separately |
| AC4 | Atomic budget decrement under concurrency | **missing** | No counter; budget = non-atomic monthly `SUM`; Redis wired only for rate-limiting |
| AC5 | cost-per-qualified-account + cache-hit-rate queryable | **missing** | `cost-tracker` aggregates by tenant/feature/agent only; no qualified-account or cache-hit dimension |

## AC1 — credit ledger — `missing`
- No `credit_ledger`/`usage_ledger` (grep `balance_after` = 0). The three cost tables are append-only telemetry: `usage_events` (`db/billing-schema.ts:62-81`, provider/cost buried in jsonb `metadata`), `llm_calls` (`ai-observability.ts:26-63`), `visitor_id_charges` (`onboarding-and-visitors.ts:132-160`, closest but visitor-ID-only). None carries `balance_after`, a caller `ref`, a `kind`, or campaign/account scope. Spend is recomputed by monthly `SUM`, never a maintained balance (`spend-cap.ts:124-134`).
- **Delta:** new `credit_ledger` (tenant_id, campaign_id?, account_id?, kind enum, provider, amount, balance_after, ref unique-per-workspace, cache_hit, created_at).

## AC2 — budget block + typed error — `partial`
- Real gate: `enforceLlmBudget(tenantId)` throws `BudgetExceededError` pre-dispatch in `traced-ai.ts:84` (`llm-budget.ts:135-139,36-43`). Visitor-ID path short-circuits with a `{skipped:'cap_reached'}` sentinel (`identify-visit.ts:164-177`).
- Gaps: (1) type is `BudgetExceededError`, not `BudgetExhausted`; visitor-id is an untyped sentinel. (2) **Workspace-only** — no campaign/segment scope anywhere. (3) Fails OPEN on missing settings / aggregation error / no tenantId (`llm-budget.ts:79-82`).
- **Delta:** one typed `BudgetExhausted` + `checkBudget({workspace, campaign?, segment?})`; route both gates through it; narrow the fail-open branches.

## AC3 — meter middleware + ref idempotency — `partial`
- No `meter`/`withMeter`/`withBudget` wrapper (grep = 0). Pre-check + execute + record exist as separate hand-wired pieces in `traced-ai.ts`. `trackTokenUsage` does an unconditional `db.insert(usageEvents)` with no `ref`/`onConflict` (`cost-tracker.ts:31-55`) → **a retry double-charges**. The only dedup (`checkDedup`) is identification caching, not charge idempotency.
- **Delta:** `meter(op, {workspace, ref}, fn)` — pre-check, short-circuit on existing `ref`, execute, record via unique-`ref` `onConflictDoNothing`.

## AC4 — atomic decrement — `missing`
- No budget counter to decrement; budget is a non-atomic read (`getTenantCost` `COALESCE(SUM(...))`, 30s in-memory cache → classic check-then-act race; `llm-budget.ts:97-115`, `cost-tracker.ts:109`). Redis **is** wired but only for rate-limiting: Upstash REST driver (`rate-limit-store.ts:102-127,131-150`, gated on `UPSTASH_REDIS_REST_URL/TOKEN`, in-memory fallback, `@upstash/redis` SDK **not** installed) + worker `ioredis` (`apps/worker/.../rate-limiter.ts`). No `DECRBY`/`FOR UPDATE`/`pg_advisory_lock` on any budget value.
- **Delta:** a `workspace_budgets` counter (tenant_id, scope, remaining_amount) decremented by a **single atomic Postgres statement** — `UPDATE ... SET remaining = remaining - :amt WHERE remaining >= :amt RETURNING remaining` (no row → `BudgetExhausted`). Postgres-atomic is dependency-free and always-on (Redis falls back to non-atomic in-memory), so it's the safer choice than the Upstash path.

## AC5 — metrics — `missing`
- Neither metric exists. `cost-tracker` aggregates by tenant/feature/agent (`getTenantCost`, `getTopCostConsumers`) but never joins cost to qualified accounts. `fromCache` booleans exist per-call (`logo/resolver.ts:146`) but are never aggregated. `getAgentHitRate` is an outcome win-rate, not cache-hit.
- **Delta:** `metrics.costPerQualifiedAccount(scope)` = `SUM(ledger.amount)/COUNT(DISTINCT qualified account)`; `metrics.cacheHitRate(scope)` over the ledger `cache_hit` flag. Both depend on AC1's `account_id` + `cache_hit` columns.

## Reuse inventory
- `enforceLlmBudget` + `BudgetExceededError` (`llm-budget.ts`) — extend, don't replace; `BudgetExhausted` can subsume it.
- `cost-tracker.ts` — keep for token telemetry; the ledger becomes the authoritative charge record.
- `rate-limit-store.ts` Upstash pattern — reference for any Redis path (but AC4 goes Postgres-atomic).

## Decisions (taken)
1. **Atomic via Postgres** single-statement conditional `UPDATE` (not Redis) — always atomic, no in-memory fallback hazard.
2. One typed `BudgetExhausted` + `checkBudget(scope)` with workspace/campaign/segment.
3. `meter(op, {ref}, fn)` idempotent on a unique `credit_ledger.ref`.
4. Ledger carries `account_id` + `cache_hit` so AC5 metrics are computable.

**Schema-changing** (new `credit_ledger` + `workspace_budgets`, migration 0084) → merge parks pending prod migration. Builds off main; independent of 00/01.
