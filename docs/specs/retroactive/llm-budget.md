# Retroactive spec: LLM budget enforcement

## Status
- Shipped in: `9a1d937` (PR #5, "WS-0 PR 1"), 2026-04-21
- Spec written: 2026-04-22
- Reviewed by Martin: pending

## Purpose
Prevents a tenant from accumulating an unbounded LLM bill by enforcing a pre-dispatch monthly cost cap. Without this, "leave the system running overnight" could produce a surprise $500 invoice. The module is the single gate between every LLM call and the Anthropic/OpenAI API — it is load-bearing infrastructure that every `tracedGenerateText`, `tracedGenerateObject`, and `tracedStreamText` call passes through.

## Current behavior
- **Pre-dispatch check:** `enforceLlmBudget(tenantId)` is called as the first operation inside `tracedGenerateText`, `tracedGenerateObject`, and `tracedStreamText` (`lib/traced-ai.ts:78`). If the tenant's month-to-date spend exceeds their configured cap, it throws `BudgetExceededError` before any tokens are consumed.
- **Cap source:** reads `llmMonthlyCostCapUsd` from `getTenantSettings(tenantId)`. Value of 0 or undefined means "no cap" — the check exits early without querying spend.
- **Spend aggregation:** calls `getTenantCost(tenantId, startOfMonth)` which sums `usage_events` rows for the current calendar month (UTC boundary). Cost data is written by `trackTokenUsage` after every LLM call completes.
- **Caching:** 30-second in-memory TTL per tenant (`STATUS_TTL_MS = 30_000`). Budget overruns are never missed by more than 30 seconds. The cache is a simple `Map<string, { status, expiresAt }>`.
- **Fail-open policy:** if settings or spend aggregation throws (DB down, query timeout), the call is allowed through. Rationale: "better to let work through than block a user because we can't read our own tables."
- **Cache invalidation:** `invalidateBudgetCache(tenantId)` is exposed for the settings PUT route so a cap raise takes effect immediately without waiting for TTL expiry.
- **Status API:** `getLlmBudgetStatus(tenantId)` returns `{ allowed, spentUsd, capUsd, percentUsed, reason }` — consumed by `GET /api/settings/llm-budget` and `GET /api/estimate-cost`.
- **User-facing error:** the `reason` string reads: "Monthly AI budget cap reached ($X.XX / $Y.YY). Raise the cap under Settings -> Workspace or wait until the 1st."
- **Undefined tenantId:** `enforceLlmBudget(undefined)` returns immediately — cross-cutting infra calls without tenant context are always allowed.

## Dependencies

### Upstream (what calls this)
- `lib/traced-ai.ts` — every traced LLM call (tracedGenerateText/Object/StreamText). This is the primary enforcement point.
- `app/api/settings/llm-budget/route.ts` — GET reads status, PUT mutates cap + invalidates cache.
- `app/api/estimate-cost/route.ts` — reads status to show "near-cap" warnings.

### Downstream (what this calls)
- `lib/cost-tracker.ts:getTenantCost()` — aggregates `usage_events` table.
- `lib/tenant-settings.ts:getTenantSettings()` — reads `llmMonthlyCostCapUsd`.
- `lib/logger.ts` — warns on read failures.

### Data read/written
- Reads: `usage_events` (via cost-tracker), `tenants.settings` (via tenant-settings).
- Writes: nothing. The module is read-only.

## Edge cases handled
- No cap configured (0 or undefined) — skip spend aggregation entirely (saves a DB query).
- Spend exactly at cap — blocked (`spentUsd < capUsd` uses strict less-than, so `$10.00 / $10.00` is blocked).
- DB failure reading settings — fail open, log warning.
- DB failure reading spend — fail open, log warning.
- Undefined tenantId — pass through silently.
- Cache invalidation after cap change — immediate via `invalidateBudgetCache`.
- Percentage display capped at 999% — prevents absurd display values.

## Edge cases NOT handled (known gaps)
- **No per-call cost estimation.** The budget check runs before the LLM call, but it only checks cumulative spend, not whether the upcoming call will push spend over the cap. A large generation (e.g., TAM build with 50 company enrichments) could start under-cap and finish over-cap with no mid-flight enforcement.
- **No real-time tracking.** The 30-second cache means concurrent calls within the same window all see the same "allowed" status. A burst of 100 simultaneous calls could all pass the check before any of their costs are recorded to `usage_events`.
- **Calendar month UTC boundary.** A user in UTC-8 (PST) sees their cap reset at 4 PM on the last day of the month, not midnight local time. Not documented anywhere.
- **No alerting at 80% or 90% of cap.** The system either allows or blocks. There's no "you're approaching your limit" notification pushed to the user — they only discover it when a call fails or they check the settings page.
- **No per-agent budget allocation.** All LLM calls share a single pool. A runaway TAM build can exhaust the budget before a user gets to send a single email draft.
- **Memory-only cache.** Serverless deployments (Vercel) may spawn multiple instances. Each instance has its own cache. Cache invalidation on one instance doesn't propagate to others. In practice, all instances converge within 30 seconds, but there's a window where one instance allows calls that another would block.

## Test coverage
- **Unit tests:** `__tests__/llm-budget.test.ts` — 136 LOC, 12 test cases. Covers: no cap, cap=0, under/at/over cap, enforce throws `BudgetExceededError`, tenantId undefined no-op, fail-open on settings/ledger errors, cache TTL, invalidation, per-tenant isolation.
- **Integration tests:** none. The settings route (`/api/settings/llm-budget`) is not tested end-to-end.
- **What's not tested:** the `tracedGenerateText/Object/StreamText` integration (that `enforceLlmBudget` is actually called before LLM dispatch), concurrent-call burst behavior, cache behavior across serverless instances.

## Review flags
1. **Fail-open is the right default for now**, but should be reconsidered if/when tenants have external billing. A tenant whose DB is temporarily unreachable could accumulate unbounded spend during the outage. Consider a "fail-closed with grace period" mode for paid tiers.
2. **The 30-second cache window is a cost-control gap for burst workloads.** The TAM build stream fires 50+ LLM calls in rapid succession. All 50 pass the same cached check. If the tenant was at 95% of cap when the build started, all 50 calls proceed and overshoot by ~$2-4. Acceptable for now, but worth noting if per-tenant budgets tighten.
3. **No proactive near-cap notification.** Users discover they've hit the cap only when an LLM call fails. A PostHog event or in-app toast at 80% would improve the experience.
