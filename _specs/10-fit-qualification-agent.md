# 10 — Fit Qualification Agent

> Feature-spec. Inherits `/spec/steering` (methodology M3 "AI qualification"; eval-policy.md). Brownfield: T0 is reconciliation. This is the agentic noise filter (the 66k→5.7k SaaS-verification pattern), and it must run only on accounts already cheaply filtered.

## requirements.md

**Context.** Decides qualification attributes a database field cannot answer, by inspecting primary evidence (the company website), via the agent-service (methodology M3 "AI qualification"). Depends on 00, 04 (agent-service), 08 (cheap fields gate it), 09 (it feeds the partition). Depended on by the account-engine workflow.

**Story.** As the engine, I want an agent that inspects primary evidence to decide fit attributes a field cannot express, so noisy lists are cleaned before any contact spend.

**Acceptance criteria (EARS).**
- AC1. WHEN an account passes cheap deterministic filters AND carries a fit attribute no field can answer (e.g. "is actually SaaS", business-model class, competitor presence), THE SYSTEM SHALL run a qualification agent (via spec 04) that inspects retrieved website evidence and returns a structured verdict with cited evidence.
- AC2. THE SYSTEM SHALL run only on accounts that passed the cheap filters first, never on the whole universe (cost discipline).
- AC3. THE SYSTEM SHALL ground every verdict in retrieved evidence (cite-or-abstain per eval-policy); IF evidence is insufficient, THEN THE SYSTEM SHALL return `needs-review`, not a guess.
- AC4. THE SYSTEM SHALL feed the verdict into the qualification partition (spec 09) and SHALL meter token cost (spec 02).
- AC5. THE SYSTEM SHALL pass its eval rubric before the verdict affects qualification (spec 04 enforces; a failed eval yields `needs-review`).

**Out of scope.** The deterministic score (09); web-scraping infrastructure (rented via a search/fetch tool such as Serper/Exa, not built here).

**Open questions.** Existing qualification-agent code or prompts. Which fetch/search tool is wired into the agent-service.

## design.md

**Data slice.** Reads `account` + retrieved web evidence; writes a verdict consumed by 09.

**Interfaces.** `qualifyFit(account, question): AgentVerdict` where `AgentVerdict = { verdict: 'pass' | 'fail' | 'needs-review', evidence: Citation[], confidence }`. Built on `runAgent` (04) with a website-fetch tool.

**Determinism boundary.** The verdict is agentic. The gating (only-after-cheap-filters), the eval enforcement, and the metering are deterministic. The kind-specific rubric lives in this spec's `eval.md`.

**Error & idempotency.** `agent_run` keyed by request id (04). No external mutation beyond writing the verdict; safe to retry. A failed eval is a `needs-review`, not an exception.

**Blast radius.** `qualification/agent/*`. Forbidden: `/spec/steering`, the deterministic scorer, the agent-service internals.

## tasks.md

- T0 (reconcile): audit existing qualification-agent code/prompts and the available fetch tool against AC1–AC5 → `RECONCILE.md`. `=== GATE: reconciliation ===`.
- T1 (test-first, stub model): gating (refuses to run on un-filtered accounts); eval-fail → needs-review; grounding (verdict must cite a fetched page); metering called.
- T2: the qualify agent via `runAgent` (04) with the website-fetch tool. DoD: AC1 green.
- T3: cheap-filter gate + feed verdict into 09. DoD: AC2, AC4 green.
- T4: grounding/abstain + eval enforcement. DoD: AC3, AC5 green. `=== GATE: first live model + fetch (token + fetch spend) ===`.

## eval.md

- Agentic rubric (this kind): grounding (every verdict cites a real fetched page), policy (no fabricated claim about the company), format (matches `AgentVerdict`). Accuracy bar measured on a small labeled sample of known/known-not accounts; state the threshold (e.g. ≥90% on the labeled set) and require it before the agent gates qualification in production.
- Deterministic: `pnpm test qualification` green with a stub model (gating, abstain, metering, eval-fail handling).
- Self-verify: `pnpm test qualification && pnpm typecheck && pnpm lint`.
- DoD: AC1–AC5 green; no live model/fetch in CI; accuracy bar met on the labeled sample before production use; `RECONCILE.md` committed.
