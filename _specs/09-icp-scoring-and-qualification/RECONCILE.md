# RECONCILE.md — Spec 09 ICP Scoring and Qualification (T0)

> Read-only reconciliation, 5-finder audit. Weighted fit aggregation exists (`computeBlendedFit`), but exposes no per-criterion contributions, has no qualified/disqualified/needs-review verdict, and the scoring core never reads exclusion/suppression. The clean pure `scoreAccount` is new.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 | `fit_score` [0,100] = weighted criterion aggregation + **contributions** | **partial** | `computeBlendedFit` aggregates soft weights → [0,100]; exposes only `matched`/`unmatched` id lists, **no per-criterion contribution**; no `scoreAccount` |
| AC2 | Exclusion + suppression as hard filters → disqualified(reason) | **partial** | Hard filters exist in **enrollment/sourcing** (`checkContactEligibility`, `suppression.filterAllowed`); the **scoring core never reads** `excludedReason`/suppression |
| AC3 | Partition qualified / disqualified(reason) / needs-review | **missing** | No qualification enum anywhere; score 0 and "fits no ICP" are indistinguishable |
| AC4 | Non-operable criterion → exclude from score + flag, not zero | **partial** | `computeBlendedFit` divides by `softWithData` (no-data criteria excluded from the denominator) — but they're not surfaced as flagged |
| AC5 | Assign a tier from the score via campaign thresholds | **partial** | `priorityScore`/sort tiers exist for the call queue; no ICP-score→tier from campaign thresholds in the scoring fn |

## Reuse inventory
- `lib/icp/criteria-engine.ts` — `evaluateCriterion` (8 operators) + `Criterion` shape (`{id, fieldKey, operator, value, weight, isRequired}`); `computeBlendedFit` (the live weighted path). The operator semantics to mirror.
- `db/schema/icp.ts:91` — `weight` is documented as "contribution to the weighted fit score" → contributions are mechanical.
- `accounts/suppression.ts` + `companies.excludedReason` — the hard-filter inputs (passed into `scoreAccount` as flags).

## Decisions (taken, full autonomy)
1. Build a clean **pure** `lib/scoring/score-account.ts` `scoreAccount(account, icpModel): { score, contributions[], qualification, reason?, tier }` — the spec's named interface, beside the live `computeBlendedFit` (don't fork it).
2. **AC1:** per-criterion `Contribution {criterionId, fieldKey, weight, operable, matched, points}`; `score = 100 · Σ(points) / Σ(operable weights)`. Contributions reconstruct the score (explainability test).
3. **AC2:** `account.suppressed` / `account.excludedReason` + any matched `isExclusion` criterion → **short-circuit** `disqualified(reason)`, regardless of score.
4. **AC4:** a criterion with no data for its field is `operable:false` → excluded from numerator AND denominator, and **flagged** in its contribution (not scored 0).
5. **AC3:** `disqualified` (hard filter / exclusion / operable required unmatched) · `needs-review` (a required criterion is non-operable, or coverage too thin) · else `qualified`.
6. **AC5:** `tier` from `score` via the model's thresholds (default A≥75, B≥50, C≥25), only for qualified.

Pure function of (account, model) → idempotent. No schema → **mergeable** off main. Tested deterministically.
