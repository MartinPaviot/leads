# RECONCILE.md — Spec 30 A/B Significance (T0)

> Read-only reconciliation. No statistical significance / experiment code exists. The whole point is to refuse to call noise a winner.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Significance on the primary metric (reply/positive), min sample before a verdict | **missing** | No z-test / significance anywhere |
| AC2 | Below minimum → "insufficient data", never a winner | **missing** | — |
| AC3 | Winner only when threshold met, else "no significant difference" | **missing** | — |
| AC4 | Compare only one-declared-axis variants (20), else inconclusive | **missing** | — |
| AC5 | Expose to the weekly agent (31) + dashboard | **missing** | — |

## Reuse inventory
- spec-29 rollup metrics (`sent`, `replies`, `positiveReplies`) — the input snapshot (passed in).
- spec-20 variant `axis` — the one-axis requirement.

## Decisions (taken, full autonomy)
1. Build `lib/analytics/ab/*` (blast radius `analytics/ab/*`): `significance.ts` (two-proportion z-test + normal CDF), `ab.ts` (`evaluateAbTest` verdicts), `index.ts`, tests. Pure function of the metrics snapshot.
2. **AC1:** two-proportion pooled z-test on `conversions/sent` (conversions = replies or positives per `metric`); two-tailed p-value via an Abramowitz-Stegun normal-CDF approximation.
3. **AC2:** `DEFAULT_MIN_SAMPLE` (100 sends/variant) — either compared variant below it → `insufficient_data`, never a winner.
4. **AC3:** `DEFAULT_ALPHA` 0.05 — a winner only when `p < alpha`; otherwise `no_significant_difference`. A known-null dataset returns no winner by construction.
5. **AC4:** all variants must share one `axis`; otherwise `inconclusive` with a reason. The comparison is the top-two by rate.
6. **AC5:** `AbResult` exposes verdict / winnerId / pValue / comparison for the dashboard + weekly agent. **No schema** → mergeable off main.
