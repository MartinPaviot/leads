# Requirements — Moment-Aware CRO Copilot (A + B + C)

Scope: **A** `lib/motion/moment.ts`, **B** `lib/motion/doctrine.ts`, **C** specialize `skills/intelligence/sales-call-prep`. AI-native invariants (office-hours.md) apply to every requirement.

---

## R1 — The copilot derives the sales moment (no user input)

**User story:** As a founder, I never tell Elevay what kind of call I'm about to have; it already knows, because it knows the deal.

- **R1.1 GIVEN** a deal in stage `qualification` **WHEN** the moment is derived **THEN** it returns `discovery` with `confidence:"high"`.
- **R1.2 GIVEN** a deal in stage `demo`, or any deal that already has a demo meeting in its activity **WHEN** derived **THEN** `demo`.
- **R1.3 GIVEN** stages `proposal` / `negotiation` **THEN** `proposal` / `close` respectively.
- **R1.4 GIVEN** a contact with no deal and `liveCallMode:true` **THEN** `cold_call`.
- **R1.5 GIVEN** the account lifecycle is `customer` **THEN** `expansion`.
- **R1.6 GIVEN** conflicting signals (stage `qualification` but a demo meeting already happened) **WHEN** derived **THEN** the **later** moment (`demo`) with `confidence:"low"`.
- **R1.7 GIVEN** no usable signal **THEN** `discovery` with `confidence:"low"` (the safe "we have a meeting" default), never a confidently-specialized wrong moment.
- **R1.8** The function is **pure** (no DB, no LLM, no I/O), returns `{ moment, confidence, source }` where `source` names the deciding signal, and runs in <1ms.
- **R1.9** No caller derives a mode from `dealStage`/`meetingType`/`lifecycleStage` directly anymore (grep gate) — `deriveMoment` is the single source.

## R2 — A wrong read is legible and corrected by conversation, never by a control

- **R2.1 GIVEN** any surface that shows moment-tailored output **THEN** the inferred moment appears as a **non-interactive heading** (e.g. "Discovery prep") — there is **no** picker, dropdown, toggle, or button anywhere in the product (acceptance: grep for a moment-select UI returns nothing).
- **R2.2 GIVEN** the user tells the copilot in chat "this is a demo" (a natural-language `momentHint`) **WHEN** the skill runs **THEN** it normalizes the hint, uses that moment, and **persists** it as `deal.properties.momentOverride`.
- **R2.3 GIVEN** `deal.properties.momentOverride` is set **WHEN** the moment is derived **THEN** the override wins over computed signals (precedence: override > computed), mirroring the lifecycle override slot.
- **R2.4 GIVEN** the override value `"auto"` **THEN** the override is cleared and derivation resumes from signals.
- **R2.5** `normalizeMoment(freeText)` returns a canonical `Moment`, the `"auto"` sentinel, or `null` for anything invalid (no throw).

## R3 — The Method becomes the runtime rubric (`getStepDoctrine`)

- **R3.1 GIVEN** a moment **WHEN** `getStepDoctrine(moment)` is called **THEN** it maps the moment to a docs **slug** (not step number): discovery→`the-discovery-call`, demo→`the-demo`, proposal→`the-proposal`, close→`closing`, cold_call→`cold-calling`, outbound→`design-the-cadence`; expansion→`null` (no dedicated step yet).
- **R3.2** The returned `rubric` is condensed: it includes the step's `h2`/`h3` headings and `ul`/`ol`/`table` rows (the actionable rules) and **excludes** `p` prose, `callout`, and `example` blocks.
- **R3.3** The rubric is **size-bounded** to ≤ ~900 tokens (truncate deterministically at a block boundary if larger), to avoid prompt bloat and doctrine-parroting.
- **R3.4 GIVEN** a moment whose slug is `null` (expansion, follow_up) **THEN** `rubric` is the empty string and the consumer falls back to generic-but-honest prep.
- **R3.5** The function is **pure** (reads the in-memory `docSteps`, no DB/LLM); a test asserts every non-null mapped slug resolves in `docSteps` (guards against step renames/renumbering).

## R4 — `sales-call-prep` is specialized by moment

**User story:** As a founder, the brief I get before a discovery is a discovery brief; before a demo, a demo brief — I never asked for either.

- **R4.1 GIVEN** moment `discovery` **WHEN** prep is generated **THEN** the output requires: the 5-layer current-state map (environment/problem/**impact in numbers**/root-cause/emotion), **11–14 questions** that quantify the gap (replacing the generic "5–7 questions"), the route-by-what-the-buyer-knows guidance, the advance/nurture/disqualify framing, and a 24-hour prep-email draft.
- **R4.2 GIVEN** moment `demo` **WHEN** prep is generated **THEN** it reads the deal's captured discovery facts (extracted pains/metrics/budget on `deal.properties` + recent meeting `buyingSignals.painPoints`) and produces **3 capabilities, each mapped to a named pain**, an "open on their agenda" opener, a reserved next-step block, and **presumptive-close options**.
- **R4.3 GIVEN** moment `demo` AND **no** discovery facts on file **THEN** the prep returns the single instruction "No discovery captured — run discovery first" (the doctrine's *no discovery, no demo* rule) instead of generic value props or invented pains.
- **R4.4 GIVEN** moment `close` **THEN** the output includes the champion-arming kit (per-stakeholder one-pager points, ROI-with-their-numbers), the no-decision options, and the verbal-yes→signature checklist.
- **R4.5 GIVEN** moment `cold_call` **THEN** `sales-call-prep` defers to the existing Call-Mode FOUNDER PLAYBOOK (no change to cold).
- **R4.6 GIVEN** any moment **WHEN** a context field is unknown **THEN** the output says "unknown" and **never invents a prospect fact** (hard no-fabrication rule, in addition to the existing "based on ACTUAL data" guard).
- **R4.7** The effective moment is resolved with precedence: explicit `moment` input > normalized `momentHint` > `deal.properties.momentOverride` > `deriveMoment(deal facts)` > mapped legacy `callType`. The output echoes the moment it used.

## R5 — AI-native delivery (no new surface, proactive)

- **R5.1 GIVEN** a calendar meeting tied to a deal **WHEN** the proactive prep job (`autoMeetingPrep`/`generateMeetingPrep`) runs **THEN** it passes the derived moment so the brief that appears is already moment-tailored — without the user requesting it.
- **R5.2 GIVEN** the user asks the chat copilot anything about an upcoming prospect/meeting **THEN** the moment-right prep is returned inline; the user never chooses a prep type.
- **R5.3** Presentation follows adaptive verbosity: the consumer renders the headline + the few things that matter for this moment, with the full structure available on request — not a wall of 10 fields. (The structured schema is unchanged; this is a rendering/prompt-framing requirement.)

## Edge cases
- Deal deleted/missing → prep still works from contact context; moment falls back to `discovery`/`low`.
- Re-opened deal (was `won`, now an open deal) → derivation reflects current open stage, not the historical `won`.
- Multiple deals on one contact → caller passes the deal in focus; if none specified, most-recent open deal.
- Step doc renamed/renumbered → slug-existence test fails in CI before ship (R3.5).
- Conflicting `moment` input vs `momentHint` → explicit `moment` wins (R4.7), documented.

## Evaluation steps (Phase 6)
1. Unit: `deriveMoment` over all 7 moments + R1.6/R1.7 conflict/no-signal cases; `normalizeMoment` valid/`auto`/invalid; `getStepDoctrine` slug-existence + block-exclusion + size bound.
2. Eval set (`lib/evals`): ≥5 discovery, ≥5 demo, ≥5 close prep cases asserting the moment's load-bearing elements are present (discovery ≥11 questions + a numeric-impact prompt; demo 3 pain-mapped capabilities; close champion one-pager); 1 sparse-context case asserting "unknown" not invented facts; 1 demo-without-discovery case asserting the refuse-and-redirect.
3. Live: in Call Mode (cold) unchanged; on a `qualification` deal the chat brief is a discovery brief; telling chat "this is a demo" flips it and persists.
4. Regression: `regression.sh` green; no new UI control introduced (grep gate); existing `sales-call-prep` callers still compile (back-compat via `callType`).
