# Tasks — Moment-Aware CRO Copilot (A + B + C)

Branch `feat/MOMENT-AWARE-COPILOT`. Order: code → test → verify → mark done. Tests run from `app/apps/web` (dual-vitest gotcha). No new UI control at any step (AI-native invariant — grep gate in T9).

## A — `lib/motion/moment.ts`
- [x] **T1. `moment.ts`** ✓ built + 16 tests green, tsc clean (`lib/motion/moment.ts`, `__tests__/moment.test.ts`) — `MOMENTS`, `Moment`, `MOMENT_AUTO`, `normalizeMoment`, `deriveMoment(MomentSignals)` per design rules 1–6. Pure, no imports beyond local types.
  - *Verify:* `pnpm tsc` clean.
  - *Test (`__tests__/moment.test.ts`):* all 7 moments (R1.1–R1.5), conflict→later+low (R1.6), no-signal→discovery+low (R1.7), override precedence + `"auto"` clear (R2.3/R2.4), `normalizeMoment` valid/auto/invalid (R2.5). ~12 cases.

## B — `lib/motion/doctrine.ts`
- [x] **T2. `doctrine.ts`** ✓ built + 6 tests green (incl. slug-existence guard), tsc clean (`lib/motion/doctrine.ts`, `__tests__/doctrine.test.ts`) — `MOMENT_TO_SLUG`, `getStepDoctrine(moment)`: map→slug, `getDocBySlug`, condense (keep h2/h3/ul/ol/table; drop p/callout/example), ≤~900-token bound truncated at block boundary, expansion→`{slug:null,rubric:""}`.
  - *Verify:* `pnpm tsc` clean.
  - *Test (`__tests__/doctrine.test.ts`):* every non-null mapped slug resolves in `docSteps` (R3.5); discovery rubric contains a known h2 ("The question discipline") + a table row, excludes a known `p`/`example` sentence (R3.2); size ≤ bound (R3.3); expansion → empty (R3.4).

## C — specialize `sales-call-prep`
- [x] **T3. Schema** ✓ added `moment`+`momentHint` inputs, `moment`+`prep.blocked` outputs, kept `callType` (`schema.ts`).
- [x] **T4. Moment resolution + override write** ✓ pure `resolveMoment` (precedence R4.7) + override persist/clear from `momentHint` (`handler.ts`); 6 precedence tests green.
- [x] **T5. Doctrine injection + moment branch** ✓ `getStepDoctrine` injected under "apply, don't restate" + hard no-fabrication rule; per-moment `momentInstructions` (discovery/demo/proposal/close/cold/outbound/expansion); 5 instruction tests + no-emoji gate green.
- [x] **T6. Demo-reads-discovery-or-refuses** ✓ deterministic `hasDiscoveryTraces` (value/closeDate/summary/competitors/decision-maker — NOT painPoints, which autofill never writes → would false-refuse); demo w/o traces → refuse-and-redirect; 2 trace tests green.
- NOTE: specialization **auto-activates today** for any deal-attached prep (resolveMoment → deriveMoment(dealStage)); T8 adds proactive + NL-correction paths.
- [x] **T7. Specialization eval (deterministic)** ✓ `prep-specialization.test.ts` (5 tests) mocks only the I/O boundary and asserts the assembled PROMPT per moment carries its load-bearing doctrine: discovery (question discipline + "11 to 14", not demo), demo (3 pain-mapped capabilities + "Open on their agenda", not discovery), demo-without-trace → deterministic refuse + model NOT called, close → arms the champion, NL hint overrides + persists. CI-safe, no LLM key/cost. REMAINING (optional): subjective LLM-output-quality evals (need a live key; deferred).

## Delivery wiring (no new surface)
- [x] **T8a. Chat NL-correction path** ✓ `prepSalesCall` (`lib/chat/tools/skills.ts`) now forwards `momentHint`; description tells the LLM the moment is inferred and to pass a hint only when the user states the call type (R5.2/R2.2). tsc clean. (Deal-attached prep already auto-specializes via resolveMoment→deriveMoment.)
- [x] **T8b. Proactive cron moment-awareness** ✓ `generateMeetingPrep` (`inngest/meeting-functions.ts`) now derives the moment (linked deal stage → else most-recent open deal at an attendee's company → else `metadata.meetingType`) and injects `getStepDoctrine(moment).rubric` into its inline prompt, keeping the rich Company Brain context; saves `prepMoment` to metadata. Additive + fallback-safe (defaults to discovery). tsc clean. (R5.1) — no unit test (integration-heavy cron); verified by tsc + reasoning.

## Gates
- [ ] **T9. AI-native + house rules** — grep: no moment select/dropdown/"Coach me"-style control added; no emoji in new strings; Elevay branding; no provider names. *Verify:* grep gate + existing house-rule tests green.
- [ ] **T10. Regression** — `regression.sh` green; existing `sales-call-prep` callers compile (back-compat via `callType`); `pnpm tsc` whole web package clean.

## Done = Phase 6
All acceptance bars (requirements R1–R5) green; eval set passes; regression clean; PASS → merge to main.
