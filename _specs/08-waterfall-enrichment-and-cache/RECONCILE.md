# RECONCILE.md — Spec 08 Waterfall Enrichment and Cache (T0)

> Read-only reconciliation, 5-finder audit. A whole-record enrichment waterfall exists but is **priority-ordered, merge-all, no confidence/threshold, no per-field cache** — the field-level `(confidence ÷ cost)` waterfall with per-field TTL is new. This rouage decides gross margin.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Cache within TTL → no provider call | **partial** | Presence-only short-circuit (no TTL) + a whole-brief 14d cache; no per-`(accountId,field)` TTL cache |
| AC2 | Order by `(confidence ÷ cost)`, stop at first ≥ threshold | **conflict** | `waterfall.ts` orders by **static priority** + geo bonus, **merges every** provider, no confidence, no threshold stop (breaks only on whole-record saturation) |
| AC3 | Persist value/provider/confidence/cost/TTL provenance | **missing** | spec-00 `account_field_source` is parked; `FieldProvenance` carries only `{field,provider,atIso}` |
| AC4 | Budget exhausted → stop + partial, not fail | **missing** | spec-02 `meter()`/`BudgetExhausted` parked; waterfall has no budget guard |
| AC5 | Per-field TTL (long headcount, short funding/hiring) | **missing** | Flat 14d for the brief; per-field TTL exists only for **signals** (`signals/freshness.ts` hiring=30, funding=180), not enrichment fields |
| — | `enrichField`/`enrichAccount(fields[])`/`FieldResult` interfaces | **missing** | grep = 0; only the whole-record `enrichCompany` exists |

## Reuse inventory
- `providers/company-enrichment/*` adapters (apollo/sirene/zefix/hunter/llm) + `registry.ts` — the **provider set** (wrap each as a field provider with cost + expected confidence).
- `signals/freshness.ts` `SIGNAL_TTL_DAYS` — the **pattern** for the per-field TTL table (mirror for enrichment fields).
- spec-01 `ProviderAdapter.confidenceFor` (merged) — the confidence source.
- spec-06 `enrichFromRegistry` (merged) — a free, high-confidence field provider.
- spec-00 `account_field_source` (parked, injected) — provenance; spec-02 `meter()` (parked, injected) — budget.

## Decisions (taken, full autonomy)
1. Build a **new field-level** path `lib/enrichment/field-waterfall.ts` + `field-cache.ts` alongside the existing whole-record waterfall (don't fork/break it). It's genuinely new (the existing one has no confidence/threshold/per-field-cache).
2. **AC2:** order field providers by `expectedConfidence(field) ÷ cost` desc (free providers first), **stop** at the first result whose `confidence ≥ threshold(field)`.
3. **AC1/AC5:** `field-cache.ts` keyed `(accountId, field)` with a per-field TTL table (`ttl.ts`: headcount/industry/founded ≈ 120d; fundingStage/totalFunding/hiring ≈ 21d). Fresh cache → return, **no provider call**.
4. **AC3:** on accept, persist `{value, provider, confidence, cost, ttlExpiresAt}` via the **injected** spec-00 field-source write + cache.
5. **AC4:** check the **injected** budget before each provider call; on exhaustion, stop and return partial (`{status:'unknown'}` for the rest), never throw.
6. Providers + cache + meter + persist are **injected** → builds off main, **no schema → mergeable**. Pure ordering/cache/threshold logic unit-tested with fake providers.

`enrichField(accountId, field, deps): Promise<FieldResult>` + `enrichAccount(accountId, fields[], deps)`.
