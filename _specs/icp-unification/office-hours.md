# ICP Unification · Office Hours

**Problem statement (one sentence).** Two adjacent settings pages ("ICP & Product" on flat `tenants.settings` keys, "ICP Profiles" on `icps`/`icp_criteria`) define the same concept with zero synchronization, while `companies.score` is written in two different scales by four writers — so editing either page silently fails to drive half the product, and every enriched account currently displays grade F in prod.

**Evidence base.** `_audit/2026-06-11-icp-settings-redundancy.md` (full consumer trace + live-DB state) and `_audit/2026-06-11-icp-unification-mapping.md` (mapping + 16 backend viability verdicts, all file:line-grounded).

## Premise challenge

- *Do we need two pages?* No. The product fields (`productDescription`, `salesMotion`, `primaryChallenge`, `aiTone`) are not ICP — they describe the seller, not the customer. The targeting fields duplicate the criteria model. One ICP surface + one small Product & Voice surface.
- *Do we need the flat fields at all?* Yes, for now: 25+ consumers (call scripts, chat context, contact scoring, warm leads, agent context, knowledge seed…) read them. Rewriting all of them is an ocean (flagged, not attempted). A write-through mirror from the priority-0 profile preserves every one of them untouched.
- *Do we need the generic rule-builder?* As an escape hatch only. The default editing experience must be the guided widgets (Apollo taxonomies, chips, ranges) the legacy page already proved.
- *Is the matrix worth keeping?* Yes — multi-ICP scoring + per-profile sourcing + ICP-scoped sequences are real capabilities — but only after the scale fix and the coverage-aware engine make its numbers honest.

## Alternatives considered

- **A. Hide ICP Profiles, keep the legacy page** — completeness 3/10. Abandons multi-ICP, leaves the score broken, perpetuates the split.
- **B. Unify on profiles: guided editor + uiState + write-through mirror + 0-100 scale fix + coverage-aware engine** — completeness 9/10. All consumers preserved with zero reader changes; scoring honest; one mental model. Residual gap: no negation operator in the scoring engine (exclusions stay sourcing-only).
- **C. Migrate all 25+ flat readers to read criteria directly, drop the flats** — ocean. Touches prompts, scoring, agents; high regression surface for no immediate user value. Flagged for incremental follow-up after B.

**Chosen: B.**

## Layer check

Layer 1 (tried and true): jsonb metadata columns, Inngest step batching, polling for async status, write-through mirrors — all already used in this codebase. Layer 2: none introduced. Layer 3 (first principles): the coverage-aware fit formula (`fitEvaluable × (0.6 + 0.4·coverage)`) — justified because the penalizing formula is the proven root cause of the 489 zeroed scores in prod.

## Completeness target

10/10 on: scale consistency (every reader of `companies.score`), consumer preservation (all ~28 traced consumers keep working), editor round-trip fidelity (uiState), prod backfill. Accepted approximations, documented: employee-count envelope in scoring (exact labels still used for sourcing), exclusions sourcing-only.
