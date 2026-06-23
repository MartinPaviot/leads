# 11 — ICP Model Store and NL-to-ICP

> Feature-spec. Inherits `/spec/steering` (design M1; methodology M1). Brownfield: T0 is reconciliation.

## requirements.md

**Context.** Persists versioned ICP models and generates a draft ICP from a natural-language description (design/methodology M1). Depends on 00 (`icp_criterion` shape), 01 (operability = which fields providers can evaluate), 04 (agent for NL→ICP). Depended on by 09 (scoring), 12 (lookalike writes a model), 13 (segments reference a version).

**Story.** As a founder, I want to define a machine-readable ICP from a short description and version it, so every downstream module reads one source of truth instead of ad hoc filters.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL persist an ICP as a versioned object of weighted criteria (firmo / techno / signal / exclusion) per data-contract; editing SHALL create a new version and retain prior versions for reproducibility.
- AC2. WHEN a user submits a natural-language description, THE SYSTEM SHALL generate a draft ICP (criteria + weights) via the agent-service, constrained to operable fields only, and SHALL present it for review before it becomes active.
- AC3. THE SYSTEM SHALL mark non-operable criteria and warn that they will not affect scoring.
- AC4. THE SYSTEM SHALL support exclusion (negative-ICP) criteria that hard-filter.
- AC5. The NL→ICP agent SHALL pass its eval (only operable fields proposed, valid schema) before the draft is shown.

**Out of scope.** Lookalike derivation (12), scoring math (09), segmentation (13).

**Open questions.** Existing ICP store/versioning. The operable-field catalog source (from 01 adapter capabilities).

## design.md

**Data slice.** Writes `icp_model`, `icp_criterion` (versioned). Reads adapter capabilities (01) for operability.

**Interfaces.** `createIcpFromDescription(ws, text): DraftIcp`; `saveIcpVersion(ws, icp): IcpVersion`; `getActiveIcp(ws): IcpModel`.

**Determinism boundary.** Store, versioning, operability mapping are deterministic. NL→ICP is agentic (via 04); its rubric is in this `eval.md`.

**Error & idempotency.** New version on edit; old versions immutable. Draft is not active until approved.

**Blast radius.** `icp/store/*`, `icp/nl/*`. Forbidden: `/spec/steering`, the scorer.

## tasks.md

- T0 (reconcile): audit existing ICP store/versioning and any NL→ICP code against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): versioning retains old versions; operability constraint; exclusion hard-filter flag; agent eval gate.
- T2: store + versioning. DoD: AC1 green.
- T3: operability mapping from adapter capabilities. DoD: AC3 green.
- T4: NL→ICP agent via 04 + exclusion support. DoD: AC2, AC4, AC5 green. `=== GATE: first live model call ===`.

## eval.md

- Deterministic: `pnpm test icp:store` green (versioning, operability, exclusion).
- Agentic (NL→ICP): rubric = only operable fields proposed, output matches the ICP schema, weights in range. Stub-model tests in CI.
- Self-verify: `pnpm test icp:store && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; draft never active without review; `RECONCILE.md` committed.
