# 12 — Lookalike ICP

> Feature-spec. Inherits `/spec/steering` (design M1; methodology M1 "look-alike"). Brownfield: T0 is reconciliation.

## requirements.md

**Context.** Derives a look-alike ICP from existing or won customers (methodology M1). Depends on 00, 08 (enrich the sample), 11 (writes a draft ICP version), 04 (agent picks causal vs incidental and weights). Depended on by 09 / 13.

**Story.** As a founder, I want a look-alike ICP from my existing customers, so I target net-new accounts that behave like my best ones, with the evidence shown so I can veto.

**Acceptance criteria (EARS).**
- AC1. WHERE the user provides customers (domains or a CRM connection), THE SYSTEM SHALL enrich the sample (via 08) and compute attribute frequencies deterministically.
- AC2. THE SYSTEM SHALL surface, per proposed criterion, the evidence (which attribute, coverage % across the sample).
- AC3. THE SYSTEM SHALL use the agent (04) only to select causal vs incidental attributes and set weights, never to invent an attribute; the frequency analysis is deterministic.
- AC4. THE SYSTEM SHALL write the result as a draft ICP version (11) for human review before it is active.
- AC5. The agent SHALL pass its eval: every weighted attribute traces to a measured frequency in the sample.

**Out of scope.** NL→ICP (11), scoring (09), segmentation (13).

**Open questions.** Existing lookalike code. CRM sample ingestion path.

## design.md

**Data slice.** Reads the enriched customer sample; writes a draft `icp_model` version (11).

**Interfaces.** `deriveLookalike(ws, sample): DraftIcp`.

**Determinism boundary.** Frequency analysis deterministic; causal selection + weighting agentic (via 04), rubric in this `eval.md`.

**Error & idempotency.** Same sample yields the same frequencies; the draft is a new version, never auto-active.

**Blast radius.** `icp/lookalike/*`. Forbidden: `/spec/steering`, the store internals (use 11's API).

## tasks.md

- T0 (reconcile): audit existing lookalike code against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): frequency correctness; evidence surfaced per criterion; agent only weights, never invents; draft written via 11.
- T2: sample enrich (08) + frequency analysis. DoD: AC1, AC2 green.
- T3: agent causal selection + weighting via 04. DoD: AC3, AC5 green. `=== GATE: live model + sample enrichment (credits) ===`.
- T4: write draft version via 11. DoD: AC4 green.

## eval.md

- Deterministic: `pnpm test icp:lookalike` green (frequency + evidence + draft write).
- Agentic: rubric = every weighted attribute traces to a sample frequency; no invented attribute; valid schema. Stub-model tests in CI.
- Self-verify: `pnpm test icp:lookalike && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; draft never auto-active; `RECONCILE.md` committed.
