# 13 — Segmentation and TAM Estimate

> Feature-spec. Inherits `/spec/steering` (design M2; methodology M2). Brownfield: T0 is reconciliation.

## requirements.md

**Context.** Builds segments from an ICP plus a campaign archetype and estimates addressable volume before spend (design/methodology M2). Depends on 00, 05/06 (count-only sourcing for TAM), 11 (ICP version). Depended on by the campaign run (M3 entry) and 14.

**Story.** As a founder, I want to pick a campaign archetype and get concrete sized segments from my ICP, so I run the right motion without designing the segmentation logic myself.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL support three archetypes (volume / micro / signal); a campaign SHALL declare exactly one.
- AC2. WHERE volume, THE SYSTEM SHALL partition the ICP by coarse dimensions; WHERE micro, THE SYSTEM SHALL require at least one narrowing dimension beyond the base ICP; WHERE signal, THE SYSTEM SHALL bind to a live signal source and admit only accounts currently carrying it.
- AC3. THE SYSTEM SHALL estimate addressable volume (TAM count) via count-only sourcing (05/06) before any enrichment spend.
- AC4. THE SYSTEM SHALL persist per segment: archetype, definition AST, signal binding, `estimated_tam`, goal, channel mix, daily send budget.
- AC5. WHEN a signal-bound segment loses the signal for an account, THE SYSTEM SHALL stop new admissions for it WHILE leaving already-sent activity intact.

**Out of scope.** The sourcing run itself (05/06), anti-collision (14), orchestration (03).

**Open questions.** Existing segmentation/campaign config. Signal-source registry (which sources feed signal segments).

## design.md

**Data slice.** Writes `segment`, reads `icp_model` (11) and count-only sourcing (05/06).

**Interfaces.** `buildSegment(campaign, icpVersion, archetype, params): Segment`; `estimateTam(segment): number`.

**Determinism boundary.** Fully deterministic.

**Error & idempotency.** TAM estimate uses count-only mode (no enrichment credits). Segment definition is a stored AST; rebuilding from the same inputs is stable.

**Blast radius.** `segmentation/*`. Forbidden: `/spec/steering`, the sourcing adapters.

## tasks.md

- T0 (reconcile): audit existing segmentation/campaign-config code against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): archetype rules (micro requires narrowing; signal admission); TAM via count-only is credit-free; signal-loss stops admissions.
- T2: segment AST + three archetypes. DoD: AC1, AC2 green.
- T3: TAM estimate via count-only sourcing. DoD: AC3 green.
- T4: persist segment fields + signal binding + loss handling. DoD: AC4, AC5 green.

## eval.md

- Deterministic: `pnpm test segmentation` green; TAM proven credit-free; micro-without-narrowing rejected; signal-loss path tested.
- Self-verify: `pnpm test segmentation && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; `RECONCILE.md` committed.
