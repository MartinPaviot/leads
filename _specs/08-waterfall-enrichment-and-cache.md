# 08 — Waterfall Enrichment and Cache

> Feature-spec. Inherits `/spec/steering` (data-contract Flow B; methodology M3 "waterfall enrichment"). Brownfield: T0 is reconciliation. This rouage decides gross margin; it is load-bearing for Gate 1.

## requirements.md

**Context.** Fills missing account fields by the cheapest acceptable provider, with caching and provenance (data-contract Flow B; methodology M3). Depends on 00, 01 (adapters), 02 (metering/budget), 06 (registry as a provider), 07 (clean merged identities). Depended on by 09 (scoring needs filled fields), 17 (contact email reuses this pattern).

**Story.** As the engine, I want each missing account field filled by the cheapest acceptable provider, so cost-per-qualified-account stays under the price point.

**Acceptance criteria (EARS).**
- AC1. WHEN a required field is missing AND a cached value exists within its TTL, THE SYSTEM SHALL use the cached value and SHALL NOT call any provider.
- AC2. WHEN no fresh cache exists, THE SYSTEM SHALL query providers in descending order of (confidence ÷ cost) and SHALL stop at the first result at or above the field's confidence threshold.
- AC3. WHEN a provider returns an accepted value, THE SYSTEM SHALL persist value, provider, confidence, cost, and TTL as provenance.
- AC4. IF the segment budget is exhausted, THEN THE SYSTEM SHALL stop enrichment and SHALL emit partial results, not fail.
- AC5. THE SYSTEM SHALL apply per-field TTLs (long for headcount, short for hiring/funding signals) per methodology M3.

**Out of scope.** Contact email-finding (17), sourcing (05/06), scoring (09).

**Open questions.** Existing enrichment/cache code (very possible; reconcile carefully). Whether registries (06) are already wired as a provider.

## design.md

**Data slice.** Reads/writes `account.canonical_fields`, `account_field_source`; reads budget from 02; uses adapters from 01/05/06.

**Interfaces.** `enrichField(accountId, field): Promise<FieldResult>` where `FieldResult = { value, provider, confidence, costCredits, ttlExpiresAt } | { status: 'unknown' }`; `enrichAccount(accountId, fields[])`.

**Determinism boundary.** Fully deterministic: provider ordering, cache lookup, persistence, budget decrement. No agentic step here.

**Error & idempotency.** Cache write keyed by `(provider, accountId, field)`. Budget decrement via the 02 guard. Re-running uses cache, so it is cheap and stable.

**Blast radius.** `enrichment/waterfall.ts`, `enrichment/cache.ts`. Forbidden: `/spec/steering`, adapter internals.

## tasks.md

- T0 (reconcile): audit existing enrichment/cache code against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`. If a waterfall cache exists, most build tasks collapse to "add tests proving it."
- T1 (test-first, delta): tests for the unmet criteria with a fake provider set.
- T2: cache lookup + per-field TTL. DoD: AC1, AC5 green.
- T3: ordered waterfall + threshold stop. DoD: AC2 green.
- T4: provenance write + metering. DoD: AC3 green.
- T5: budget guard + partial-result path. DoD: AC4 green. `=== GATE: spends real credits / live provider ===`.

## eval.md

- Deterministic: `pnpm test enrichment` green; cache-hit serves with zero provider calls; waterfall stops at first acceptable; budget-zero yields partial results.
- Self-verify: `pnpm test enrichment && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; cost-per-field logged to the ledger; no live provider call without the T5 gate; `RECONCILE.md` committed.
