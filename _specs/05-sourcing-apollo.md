# 05 — Sourcing: Apollo

> Feature-spec. Inherits `/spec/steering` (data-contract Flow A). Brownfield: T0 is reconciliation. Likely overlaps the reference adapter built in 01; reconcile and reuse it.

## requirements.md

**Context.** Sources candidate accounts and contacts for a segment from Apollo, normalized to canonical (data-contract Flow A). Depends on 00, 01 (the adapter port and the Apollo reference adapter), 02 (metering). Depended on by 07 (dedup), 08 (enrichment), 13 (TAM/segmentation).

**Story.** As the engine, I want to source candidate accounts and contacts for a segment from Apollo, normalized to canonical, so the list is built without any Apollo field name reaching the core.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL translate a `CanonicalICPQuery` to an Apollo search request (person + organization filters) via the adapter from 01, per data-contract Flow A.
- AC2. THE SYSTEM SHALL paginate to the segment's requested volume within Apollo's caps (100/page, 50,000 max), and SHALL expose a count-only mode for TAM estimation that consumes no enrichment credits.
- AC3. THE SYSTEM SHALL normalize every result to `CanonicalAccount`/`CanonicalContact` with no vendor type past the adapter, and SHALL persist via spec 00 upserts.
- AC4. THE SYSTEM SHALL NOT call enrichment here (search returns no emails or phones); that is specs 08 and 17.
- AC5. THE SYSTEM SHALL meter any credit-consuming call via spec 02 and respect the segment budget.

**Out of scope.** Enrichment (08), cross-provider dedup/merge (07), other sources (06), persona/contact logic (15).

**Open questions.** Overlap with the 01 reference adapter (reconcile). Existing Apollo sourcing code.

## design.md

**Data slice.** Input `CanonicalICPQuery`/segment; output `CanonicalAccount`/`CanonicalContact` (00).

**Interfaces.** `sourceAccounts(segment, mode: 'full' | 'count'): AsyncIterable<CanonicalAccount>`, built on the `ApolloAdapter` from 01.

**Determinism boundary.** Fully deterministic.

**Error & idempotency.** Upsert by identity key (00). Pagination resumable. Search is credit-free; count mode never enriches.

**Blast radius.** `sourcing/apollo/*`. Forbidden: `/spec/steering`, the adapter port internals, enrichment.

## tasks.md

- T0 (reconcile): audit the 01 reference adapter and any existing Apollo sourcing against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`. Reuse the reference adapter; do not duplicate it.
- T1 (test-first): query-mapping fixture, pagination, count-only mode, normalization to canonical.
- T2: query mapping reusing the 01 adapter. DoD: AC1 green.
- T3: pagination + count-only TAM mode. DoD: AC2 green.
- T4: normalize + persist via 00; metering + budget. DoD: AC3, AC5 green. `=== GATE: first live Apollo search (and any credit op) ===`.

## eval.md

- Deterministic: `pnpm test sourcing:apollo` green against recorded fixtures; count mode proven credit-free; no vendor type escapes the adapter.
- Self-verify: `pnpm test sourcing:apollo && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; no live Apollo call in CI; reference adapter reused; `RECONCILE.md` committed.
