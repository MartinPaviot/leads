# RECONCILE.md — Spec 31 Weekly Optimization Agent + Risk Classifier (T0)

> Read-only reconciliation. No scheduled optimization agent / risk-gated proposal loop exists. The self-improvement loop, productized and risk-gated.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | Scheduled agent reads rollups (29) + significance (30), proposes ranked grounded changes | **missing** | No optimization agent |
| AC2 | Risk-classify + route: low auto only if autonomous; med/high gated (03) | **missing** | No risk routing |
| AC3 | Never apply on insufficient/insignificant data (30) → "watch" | **missing** | No watch-gate |
| AC4 | Eval (every proposal cites a metric; risk justified) before show/apply | **missing** | — |
| AC5 | Log every proposal/decision/outcome for audit + next-week input | **missing** | — |

## Reuse inventory (injected)
- spec-04 `runAgent` (propose), spec-29 metrics, spec-30 significance verdict, spec-03 gate, an `applyChange` + `audit` sink — all injected; proposals agentic, routing deterministic.

## Decisions (taken, full autonomy)
1. Build `lib/analytics/optimizer/*` (blast radius `analytics/optimizer/*`): `risk.ts` (deterministic routing), `review.ts` (`runWeeklyReview`), `index.ts`, tests.
2. **AC1:** `runWeeklyReview` calls the injected agent with metrics + significance; proposals are `pause / scale / copy_adjust / icp_adjust / cadence_adjust`, each with a `citedMetric`.
3. **AC4 (deterministic safety net):** a proposal with no `citedMetric` is forced to `watch` regardless of the agent's eval; a failed agent eval yields no proposals.
4. **AC3:** a proposal carrying a significance verdict that is not `winner` (insufficient/no-difference/inconclusive) is forced to `watch` — never applied.
5. **AC2 routing:** high/medium → `gated` (human, via 03); low → `auto_apply` only when the campaign is autonomous, else `gated`. `applied` = (route === auto_apply).
6. **AC5:** every proposal + decision is logged via the injected `audit` sink (next week's input); applied changes are reversible (the change record is logged).
7. **No schema** (agent/apply/audit/significance injected) → mergeable off main.
