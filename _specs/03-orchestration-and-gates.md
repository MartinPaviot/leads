# 03 — Orchestration and Gates

> Feature-spec. Inherits `/spec/steering` (design X1, the approval-gate model from SPEC-OS). Brownfield: T0 is reconciliation.

## requirements.md

**Context.** Implements durable, resumable workflows and the approval-gate primitive (design X1; the `=== GATE ===` mechanism every gated module uses). Depends on 00. Depended on by every multi-step module (M3–M7) and by every spec that declares a gate.

**Story.** As the engine, I want durable workflows that pause at human approval gates, so long-running gated playbook runs survive failures and never proceed past a gate without an explicit decision.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL model a module as an Inngest step function with per-step retry and idempotency.
- AC2. THE SYSTEM SHALL provide an approval-gate primitive: `createGate(runId, kind, payload)` persists an `approval_gate` row and the workflow SHALL block on `waitForEvent` until the gate is decided.
- AC3. WHEN a gate is rejected, THE SYSTEM SHALL halt the run; WHEN edited, THE SYSTEM SHALL resume using the edited payload; WHEN approved, THE SYSTEM SHALL resume unchanged.
- AC4. IF a step fails, THEN THE SYSTEM SHALL retry with backoff to a bounded limit and SHALL preserve partial results.
- AC5. THE SYSTEM SHALL maintain a `workflow_run` record with `current_module` and `state`.

**Out of scope.** The module logic that runs inside the steps (their own specs); the gate-inbox UI; the hook layer for irreversible-op gating beyond exposing the primitive.

**Open questions.** Existing Inngest setup and any prior gate/run code.

## design.md

**Data slice.** Writes `approval_gate`, `workflow_run`.

**Interfaces.**
- `defineModule(name, steps)`
- `createGate({runId, kind, payload}): GateId`
- decision handler resuming on `gate.decided`

**Determinism boundary.** Orchestration is deterministic; the steps it runs may be agentic, governed by their own specs and by spec 04.

**Error & idempotency.** Each step idempotent (Inngest step memoization + caller idempotency keys). Gate decision idempotent on `GateId`.

**Blast radius.** `orchestration/*`, `db/gates`, `db/workflow_runs`. Forbidden: `/spec/steering`, module internals.

## tasks.md

- T0 (reconcile): audit existing Inngest functions and any gate/run code against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first): a fake two-step gated workflow proving block-until-decided, reject-halts, edit-resumes, and step-retry-with-backoff.
- T2: module harness over Inngest. DoD: AC1, AC4 green.
- T3: gate primitive (persist + `waitForEvent` + resume). DoD: AC2, AC3 green.
- T4: `workflow_run` state. DoD: AC5 green.

## eval.md

- Deterministic: `pnpm test orchestration` green; the fake gated workflow demonstrates all four gate behaviors and bounded retry.
- Self-verify: `pnpm test orchestration && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; a gated run cannot proceed without a decision; `RECONCILE.md` committed.
