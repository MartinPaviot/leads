# RECONCILE.md — Spec 29 Rollups and Benchmarks (T0)

> Read-only reconciliation. Event tracking + cohort analysis exist; the per-campaign/segment/variant rollup with benchmark flagging, idempotent reprocessing, and (variantId, stepId) attribution does not.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Rolling per scope metrics (sent/delivered/reply/positive/meetings/bounce/spam + cost-per) | **missing** | `lib/analytics/analytics.ts` tracks events; no campaign/segment/variant rollup with cost metrics |
| AC2 | Compare to methodology benchmarks, flag above/below | **missing** | No benchmark comparison |
| AC3 | Incremental + idempotent (no double-count on reprocess) | **missing** | No keyed rollup |
| AC4 | Queryable API for dashboard / 30 / 31 / 32 | **missing** | — |
| AC5 | Attribute reply/positive to (variantId, stepId) | **missing** | — |

## Reuse inventory
- spec-23/24 send events, spec-26 reply events, spec-02 cost ledger — the event inputs (passed in).
- `lib/insights/cohort-engine.ts` — cohort analysis stays separate; spec-29 is the rollup layer the dashboard + downstream specs read.

## Decisions (taken, full autonomy)
1. Build `lib/analytics/rollups/*` (blast radius `analytics/rollups/*`): `benchmarks.ts` (config SSOT), `rollup.ts` (compute + query + attribution), `index.ts`, tests. Fully deterministic.
2. **AC3 idempotency:** each `MetricEvent` carries a unique `eventId`; `computeRollups` dedupes by it, so reprocessing the same/overlapping events yields identical metrics (a recompute is a no-op).
3. **AC1:** rates over `sent` (delivery/reply/positive/bounce/spam); cost-per-qualified-account and cost-per-positive-reply from the cost on events + the qualified-account count.
4. **AC5:** events carry `variantId` + `stepId`; the rollup buckets by `(variantId, stepId)` so a reply/positive attributes to exactly one variant/step.
5. **AC2:** `DEFAULT_BENCHMARKS` (M7 SSOT, no methodology.md in repo) + `compareToBenchmark` flag each metric above/below.
6. **AC4:** `getMetrics(result, scopeKey)` / `getAttribution` expose the queryable surface.
7. **No schema** (events passed in) → mergeable off main.
