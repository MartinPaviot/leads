# 09 — ICP Scoring and Qualification

> Feature-spec. Inherits `/spec/steering` (design M1 scoring, M3 qualification; methodology M1). Brownfield: T0 is reconciliation. This is the deterministic math; the agentic fit check is spec 10.

## requirements.md

**Context.** Computes the deterministic fit score and partitions accounts into qualified / disqualified / needs-review (design M1/M3; methodology M1). Depends on 00, 08 (enriched fields). Consumes an ICP model object (the `icp_criterion` shape from data-contract); the model's creation/store is spec 11, so this spec is testable with a hand-authored model. Depended on by the account-engine workflow and Gate 1.

**Story.** As the engine, I want a deterministic, explainable fit score and a qualified/disqualified/needs-review partition for every enriched account, so spend and outreach concentrate on accounts that fit.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL compute `fit_score` in [0,100] as a weighted aggregation of per-criterion matches against the active ICP model, and SHALL expose each criterion's contribution.
- AC2. THE SYSTEM SHALL apply exclusion criteria and suppression as hard filters that short-circuit to disqualified with a reason.
- AC3. THE SYSTEM SHALL partition accounts into qualified / disqualified(reason) / needs-review.
- AC4. WHEN a criterion is non-operable (no provider can evaluate it), THE SYSTEM SHALL exclude it from the score and flag it, not silently treat it as zero.
- AC5. THE SYSTEM SHALL assign a tier from the score using the campaign's tiering thresholds.

**Out of scope.** ICP creation / NL-to-ICP (11), lookalike (12), the agentic fit check for attributes a field cannot express (10).

**Open questions.** Existing scoring code. The tiering thresholds source (campaign config vs steering default).

## design.md

**Data slice.** Reads `account.canonical_fields`, the ICP model (`icp_criterion`), suppression; writes `fit_score`, `qualification`, `tier`.

**Interfaces.** `scoreAccount(account, icpModel): { score, contributions[], qualification, reason?, tier }`.

**Determinism boundary.** Fully deterministic. This is the scoring math; the agentic verdict is 10 and feeds in as a criterion input, not computed here.

**Error & idempotency.** Pure function of (account, model); same inputs give the same score. Recompute on field or model change.

**Blast radius.** `scoring/*`. Forbidden: `/spec/steering`, enrichment internals.

## tasks.md

- T0 (reconcile): audit existing scoring/qualification code against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): weighted aggregation correctness; exclusion short-circuit; non-operable handling; tiering thresholds; contributions sum to score.
- T2: scoring + contributions. DoD: AC1, AC4 green.
- T3: exclusion/suppression hard filters + partition. DoD: AC2, AC3 green.
- T4: tier assignment. DoD: AC5 green.

## eval.md

- Deterministic: `pnpm test scoring` green; explainability test (contributions reconstruct the score); exclusion test (a negative-ICP account is disqualified regardless of score).
- Self-verify: `pnpm test scoring && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; scores reproducible; non-operable criteria flagged not zeroed; `RECONCILE.md` committed.
