# RECONCILE.md — Spec 19 Grounded Personalization (T0)

> Read-only reconciliation. Real grounding infra exists but is **sequence-draft / ProspectContext-centric**, not the spec-19 single-message assembly from spec-18 assets with segment-fallback + a `personalization_level` flag.

## Verdict summary

| AC | Requirement | Verdict | One-line |
|---|---|---|---|
| AC1 assembly | positioning + offer + personalization + CTA from 18 | **missing** | `sequence-generator.ts` builds 5-step sequences from a methodology lib + ProspectContext, not the spec-18 asset store |
| AC1 grounding | personalization grounded in a retrieved cited fact via 04 | **partial** | `fabrication-gate.ts` + `personalization-judge.ts` + `claims-from-context.ts` exist but key off the research brief, not the spec-19 evidence + role + asset interface |
| AC2 | No evidence → segment fallback + low-personalization flag, never invent | **partial** | `fabrication-gate` BLOCKS ungrounded specifics; no segment-level fallback message with a `personalization_level` flag |
| AC3 | Role-class (16) + lang adaptation; FR vouvoiement | **partial** | i18n lang exists; role_class is new (16); vouvoiement not enforced |
| AC4 | Reference past winning sequences (perf store) | **partial** | `sequence-quality` / `personalization-backtest` exist; reading spec-29 winning formats is new (injected, read-only) |
| AC5 | Eval gate: every claim cites evidence, no em-dashes, before usable | **partial** | Fabrication/personalization judges exist; the single-message cite-or-fallback + em-dash guard + non-result-on-fail is new |

## Reuse inventory (philosophy reused, not duplicated)
- `lib/evals/fabrication-gate.ts` — the "never invent when the brief is thin" precedent. Spec-19 enforces the same via a deterministic cite-or-fallback post-check.
- `lib/sequence-drafts/claims-from-context.ts` / `citations.ts` — `{kind,label,href,quote}` citation shape; spec-19 `Citation` aligns.
- spec-18 `copyContext` (assets/voice), spec-16 role_class, spec-04 `runAgent`, spec-08 evidence, spec-29 winning formats — all **injected structurally** (spec 19 builds off main decoupled).

## Decisions (taken, full autonomy)
1. Build `lib/copy/personalization/generate-message.ts` — `generateMessage(deps): Message` = `{ body, subject?, evidence: Citation[], personalization_level, flags }`. Blast radius `copy/personalization/*`.
2. **Deterministic assembly** (positioning + offer + personalization layer + CTA) + **agentic personalization** via injected `runAgent`; CI uses a stub agent (no live model).
3. **Never invent (AC2/AC5):** the agent returns `{line, citedIds}`; a deterministic post-check requires `citedIds ⊆ sufficient-confidence evidence`, no banned tokens / em-dashes, and (FR) no informal pronouns. Any failure, or no sufficient evidence, or `evalPassed=false` → **segment-level fallback**, `personalization_level:'low'`, flagged — the ungrounded line is never shipped.
4. **AC3:** role_class + lang passed to the agent; FR vouvoiement enforced by a deterministic informal-pronoun guard.
5. **AC4:** injected `winningFormats` (read-only, spec-29) hint the agent.
6. **Structural injection → no schema, no spec-18 import → mergeable off main.**
