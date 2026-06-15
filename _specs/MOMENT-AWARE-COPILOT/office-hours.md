# Office Hours — Moment-Aware CRO Copilot (A + B + C)

**Date:** 2026-06-14 · Scope: foundations + flagship. D (coaching) and E (objections) are follow-on specs.
**Source analysis:** `_research/teardown-monaco/cro-copilot-DEEP-audit-2026-06-14.md`, `cro-copilot-feature-placement-2026-06-14.md`, `cro-copilot-specs-2026-06-14.md`.

## Problem statement (one sentence)
Preparing a cold call, a discovery, a demo, a proposal and a multi-channel campaign are different jobs, but Elevay runs them through one generic prompt — `sales-call-prep` even carries a `callType` enum it then ignores — so the founder gets the same brief regardless of where the deal actually is.

## Premise challenge
- *"Just write better prompts per call type."* — Rejected as the whole answer: the doctrine for each moment is already written, tested, and version-controlled in `lib/docs/steps/` (Step 13 discovery, 14 demo, 15 proposal, 16 closing, each with its own objection table). Re-authoring it in prompts would duplicate and drift. The premise that wins: **make the Method the runtime rubric**, and **derive the moment** so the right rubric is selected automatically.
- *"Let the user pick the call type."* — Rejected. Martin's hard constraint: **fully AI-native, zero added user complexity.** The moment is the copilot's situational awareness, computed from real signals (deal stage, meeting type, activity, calendar/transcript already read), never configured. No picker, no toggle, no button, no new page. Correction is conversational; if the copilot's read is wrong the user says so in chat and it adjusts.

## Alternatives explored (2+)
1. **N new skills (discovery-prep, demo-prep, …).** Rejected — skill sprawl; the moments share 80% of the machinery (prospect context, deal facts, output shape). One skill branched by moment is simpler and keeps one quality bar.
2. **An LLM classifier for the moment.** Rejected as the default — the moment is load-bearing (it routes everything), so a deterministic derivation from real signals is more reliable and free. The LLM only disambiguates as a fallback, and the human corrects in NL. (AI-native ≠ "LLM for everything"; it means inferred-not-configured.)
3. **Chosen:** two pure-function foundations — `moment.ts` (derive the moment, mirroring the proven `lifecycle-stage.ts` derive-at-read SSOT) and `doctrine.ts` (`getStepDoctrine(moment)` rendering the matching Method step into a condensed rubric) — then **branch the existing `sales-call-prep` skill** by moment and inject the doctrine.

## Layer check (three layers of knowledge)
- **Layer 1 (tried and true):** derive-at-read SSOT — proven in `lifecycle-stage.ts` (mutated from ~35 call sites, never drifts). Mirror it. The Method content + objection tables already exist and are tested.
- **Layer 2 (scrutinize):** none new — no new library, no new infra.
- **Layer 3 (first principles):** the moment as the copilot's *situational awareness* (computed, legible, correctable by conversation) rather than a stored enum the user manages — this is the AI-native frame that the placement blueprint earned.

## Completeness target
- A `moment.ts`: **9/10** — all 7 moments + the 3 conflict cases, safe default, override-from-NL. (Not 10: expansion has no dedicated doctrine step yet.)
- B `doctrine.ts`: **9/10** — slug-mapped (stable, not step-number), condensed, size-bounded, slug-existence test.
- C `sales-call-prep` branch: **8/10** for v1 — discovery/demo/close specialized + no-fabrication + demo-reads-discovery-or-refuses; follow_up/outbound stay generic-but-honest; eval-gated.

## AI-native invariants (binding, from the specs doc)
No new controls · no new vocabulary (user never sees "moment"/the 7 types) · inference over asking · correction by conversation not configuration · proactive over on-demand · adaptive verbosity (outcome + the 2-3 things that matter, depth on ask). These are part of every acceptance criterion.

## Out of scope (this spec)
D coaching surface + push, E objection bank, the four "oceans" (recorder, time-series layer, trained opp-score, forecast engine). Plane-2 forecasting/portfolio. Per-tenant voice rewrite of canned content.
