# RECONCILE.md — Spec 32 Regression Alerts (T0)

> Read-only reconciliation. No between-review regression alerting exists. This routes; it does not duplicate the guard (27) or the optimizer (31).

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Detect significant negative deltas vs a trailing baseline (reply/bounce/spam/positive) | **missing** | No regression detection |
| AC2 | Breach → Slack alert (28) with metric, scope, cause | **missing** | — |
| AC3 | Dedup active alerts; resolve on recovery | **missing** | — |
| AC4 | Route deliverability regression → 27; content/targeting → 31 | **missing** | — |
| AC5 | Tunable threshold/window per workspace | **missing** | — |

## Reuse inventory (injected)
- spec-29 metrics (current + trailing baseline), spec-28 Slack post, spec-27 guard / spec-31 weekly as routing targets — injected.

## Decisions (taken, full autonomy)
1. Build `lib/analytics/alerts/*` (blast radius `analytics/alerts/*`): `detect.ts` (regression detection), `alerts.ts` (`evaluateRegressions` + dedup/resolve/route), `index.ts`, tests. Fully deterministic.
2. **AC1:** `detectRegressions` per metric, direction-aware — reply/positive worse when DOWN, bounce/spam worse when UP; a relative change ≥ the threshold is a regression.
3. **AC4 routing:** bounce/spam → cause `deliverability`, route `guard` (defer to 27's pause); reply/positive → cause `content`, route `weekly` (surface to 31).
4. **AC2/AC3:** `evaluateRegressions` posts a Slack alert for each NEW regression (keyed `${scope}:${metric}`), dedupes already-active ones, and resolves a previously-active metric that has recovered. Backed by an injected alert-state store.
5. **AC5:** threshold + window are per-workspace config passed in.
6. **No schema** (metrics/store/post injected) → mergeable off main.
