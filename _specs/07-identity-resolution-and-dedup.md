# 07 — Identity Resolution and Dedup

> Feature-spec. Inherits `/spec/steering` (data-contract identity resolution; design 3.2). Brownfield: T0 is reconciliation. The single-record identity logic likely already exists in 00; this is the cross-provider batch merge on top of it.

## requirements.md

**Context.** Deduplicates and merges accounts and contacts across providers in a sourcing run (data-contract "Identity resolution"; design 3.2). Depends on 00 (identity keys + single-record merge), 05/06 (the sources). Depended on by 08 (enrich the merged record) and everything downstream.

**Story.** As the engine, I want accounts and contacts from multiple providers deduplicated into one record per real entity, merged by provider precedence, so downstream never double-spends or double-contacts.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL deduplicate accounts by identity key (domain → legal_id → normalized name+country fuzzy) across all providers in a run.
- AC2. THE SYSTEM SHALL merge attributes by provider precedence, recompute `canonical_fields`, and preserve every source in provenance.
- AC3. THE SYSTEM SHALL deduplicate contacts by verified email and by `linkedin_url`.
- AC4. WHEN two records resolve to the same entity, THE SYSTEM SHALL merge not duplicate; IF the match is below the fuzzy threshold, THEN THE SYSTEM SHALL mark `needs-review` rather than guess-merge.
- AC5. THE SYSTEM SHALL be idempotent: re-running dedup over the same set yields the same merged result.

**Out of scope.** Enrichment (08), enrollment-time anti-collision (14), email verification (17).

**Open questions.** How much of this exists in 00's `upsert*`/`resolveAccountIdentity` (reconcile). The provider precedence table location.

## design.md

**Data slice.** Reads/writes `account`, `contact`, `*_field_source`; reads the precedence table from steering (tech.md / data-contract).

**Interfaces.** `dedupeRun(runId): MergeReport` where `MergeReport = { merged, reviewed, kept }`.

**Determinism boundary.** Fully deterministic. Fuzzy match is normalized string distance with a fixed threshold.

**Error & idempotency.** Re-running is a no-op on an already-merged set. Merge order-independent.

**Blast radius.** `identity/*`. Forbidden: `/spec/steering`, the source adapters.

## tasks.md

- T0 (reconcile): audit 00's identity/merge code and any existing dedup against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`. Extend 00, do not fork it.
- T1 (test-first): multi-provider merge with precedence; ambiguous → needs-review; idempotent re-run; contact dedup by email and linkedin.
- T2: account dedup + precedence merge + provenance preserve. DoD: AC1, AC2 green.
- T3: contact dedup. DoD: AC3 green.
- T4: below-threshold → needs-review; idempotence. DoD: AC4, AC5 green.

## eval.md

- Deterministic: `pnpm test identity` green, including an idempotent-rerun test and a precedence-merge test with conflicting sources.
- Self-verify: `pnpm test identity && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; re-run produces identical output; ambiguous matches never auto-merged; `RECONCILE.md` committed.
