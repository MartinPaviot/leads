# 01 — Provider Adapter Framework

> Feature-spec. Inherits `/spec/steering` (the adapter contract and crosswalk live in data-contract.md). Brownfield: T0 is reconciliation.

## requirements.md

**Context.** Implements the `ProviderAdapter` port, the shared normalizers, and one reference adapter, per data-contract.md ("adapter contract", "crosswalk", "anchor on open vocabularies"). Depends on 00. Depended on by every sourcing, enrichment, sending and CRM adapter (05, 06, 08, 17, 23, 24, 28).

**Story.** As the engine, I want one typed adapter port plus shared normalizers, so every provider is pluggable and the core never imports a vendor SDK or a vendor field name.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL define `ProviderAdapter<TIn,TOut>` with `toProviderRequest`, `fromProviderResponse`, `capabilities`, `costModel`, `confidenceFor`.
- AC2. THE SYSTEM SHALL provide shared normalizers: country→ISO 3166, phone→E.164, title→{seniority, department}, industry→NAICS, tech→slug, employees→range.
- AC3. THE SYSTEM SHALL include one reference adapter implementing the port end to end (Apollo search, data-contract Flow A), with no vendor type leaking past `fromProviderResponse`.
- AC4. WHERE an adapter declares an async capability, THE SYSTEM SHALL expose `registerWebhook` and `reconcile` (Apollo waterfall enrichment returns to a webhook, not inline).
- AC5. THE SYSTEM SHALL give each adapter its own rate limiter; the core SHALL NOT manage provider limits.

**Out of scope.** The waterfall logic (08), all other adapters, any sending.

**Open questions.** Does an adapter/normalizer layer already exist (reconcile). Is an Apollo client already present.

## design.md

**Data slice.** Inputs/outputs are `CanonicalICPQuery` and `CanonicalAccount/Contact` fragments from 00.

**Interfaces.** The port exactly as in data-contract.md ("The adapter contract"). Plus a `Normalizers` module exposing the six mappers in AC2.

**Determinism boundary.** Fully deterministic. Title→{seniority, department} here is rule/table mapping; the agentic role classifier is spec 16, not this one.

**Error & idempotency.** Adapters throw a typed `ProviderError`; the rate limiter backs off on 429/5xx. Pure mapping, no mutation.

**Blast radius.** `providers/port.ts`, `providers/normalizers/*`, `providers/apollo/*`. Forbidden: `/spec/steering`, core orchestration.

## tasks.md

- T0 (reconcile): audit any existing adapter, normalizer, or Apollo client against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): port contract tests + normalizer unit tests against fixtures; a recorded Apollo response fixture for the reference adapter.
- T2: the port + types. DoD: AC1 green.
- T3: normalizers, reusing existing mappers. DoD: AC2 green.
- T4: Apollo reference adapter mapping to Flow A; webhook capability for async enrichment. DoD: AC3, AC4 green against the fixture. `=== GATE: first live Apollo call (credits) ===`.
- T5: per-adapter rate limiter. DoD: AC5 green.

## eval.md

- Deterministic: `pnpm test providers` green; the reference adapter's contract test passes against the recorded fixture (no live call in CI); no vendor type escapes the adapter boundary (lint rule or type test).
- Self-verify: `pnpm test providers && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; reference adapter proves the pattern; `RECONCILE.md` committed; no live provider call in CI.
