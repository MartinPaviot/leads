# 04 — Agent Service

> Feature-spec. Inherits `/spec/steering` (design X2, methodology "Agent layer", eval-policy.md). Brownfield: T0 is reconciliation. This is where your existing CLAUDE/EVAL harness is most likely already partly built.

## requirements.md

**Context.** Implements the one governed way to call Claude (via Bedrock) with scoped tools, schema-validated output, and a pre-commit eval (design X2). Depends on 00 and 02 (token metering) and 03 (it runs inside gated steps). Depended on by every agentic step: 10, 11, 12, 16, 19, 20, 26, 31.

**Story.** As the engine, I want one governed entry point for agent calls with scoped tools, validated output, and an eval gate, so agentic steps are auditable, cost-bounded, and never affect a live campaign unless they pass their rubric.

**Acceptance criteria (EARS).**
- AC1. THE SYSTEM SHALL expose `runAgent({kind, input, schema, tools?, evalRubric})` that calls Claude via Bedrock, injects only workspace-scoped tools (via Composio), and returns output validated against the Zod `schema`, repairing-or-failing on invalid output.
- AC2. THE SYSTEM SHALL meter token cost through the metering middleware (spec 02).
- AC3. THE SYSTEM SHALL log an `agent_run` row: inputs, tools called, output, tokens, latency, eval result.
- AC4. THE SYSTEM SHALL run the kind's eval rubric (grounding / format / policy) before returning; IF the eval fails, THEN THE SYSTEM SHALL NOT return a usable result and SHALL surface the failure.
- AC5. THE SYSTEM SHALL never grant ambient credentials or cross-tenant tool access.

**Out of scope.** Any specific agent's prompt or rubric (those live in their feature-specs); model routing beyond Bedrock-Claude; fine-tuning.

**Open questions.** Existing Bedrock/Composio client, `agent_run` logging, and eval harness (your EVAL_RUBRIC) state.

## design.md

**Data slice.** Writes `agent_run`. Reads workspace tool scope.

**Interfaces.**
- `runAgent<T>(args): Promise<AgentResult<T>>` where `AgentResult = { value: T, evalPassed: true } | { evalPassed: false, reason }` plus `{ tokens, latencyMs }`.

**Determinism boundary.** The model call is agentic; schema validation, tool scoping, metering, logging and the eval gate are deterministic and unit-tested. The eval rubric content per kind is agentic/judgmental and lives in the calling spec.

**Error & idempotency.** `agent_run` keyed by request id. No external mutation inside `runAgent`, so it is safe to retry. A failed eval is a returned non-result, not an exception, so callers branch on it.

**Blast radius.** `agent/*`, `db/agent_runs`. Forbidden: `/spec/steering`, feature prompts/rubrics.

## tasks.md

- T0 (reconcile): audit existing harness, Bedrock client, Composio wiring, `agent_run` logging, and eval rubric against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`. (Likely large overlap with your existing harness; prefer wrapping it.)
- T1 (test-first, with a stubbed model): schema repair-or-fail; eval-fail blocks return; tool scoping rejects out-of-workspace tools; metering is called.
- T2: Bedrock-Claude client + scoped Composio tool injection. DoD: AC1 (call + scoping), AC5 green.
- T3: schema validation + repair-or-fail. DoD: AC1 (validation) green.
- T4: eval gate + `agent_run` logging + token metering. DoD: AC2, AC3, AC4 green. `=== GATE: first live model call (token spend) ===`.

## eval.md

- Deterministic: `pnpm test agent` green with a stubbed model: invalid output is never returned, an eval-fail is never returned as usable, every call is logged and metered, an out-of-tenant tool is refused.
- Self-verify: `pnpm test agent && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; no live model call in CI; `RECONCILE.md` committed; existing harness reused rather than replaced unless a gate approved otherwise.
