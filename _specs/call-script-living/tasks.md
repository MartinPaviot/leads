# Tasks — Living Script Engine

Each task: implement → write test → verify → commit. Run vitest/tsc from `app/apps/web` (`reference_test-cwd-dual-vitest`). No task is "done" without its verify passing. Phase 1 is the buildable, fully-intelligent first version; Phase 2 is designed and gated on Phase 1 review.

## Phase 0 — Shared types + lever predicates (foundation)

- [ ] **T0.1** Add the shared types (`EvidenceItem`, `ProspectEvidence`, `BlocKind`, `LeverId`, `AssembledBloc`, `AssembledScript`, `GapReport`) — co-located in `call-scripts.ts` or a new `call-mode/types.ts`.
  - Verify: `tsc --noEmit` green; no runtime import cycles.
- [ ] **T0.2** `lib/call-mode/levers.ts` — the 9 lever predicates + `validateScript(script): GapReport`. Pure.
  - Test: `levers.test.ts` — a compliant fixture passes all script-checkable levers; a template with two problems fails `single_tier1_problem`; an ask without a reversibility clause fails `ask_derisked`; an opener containing listed problems fails `opener_permission`.
  - Verify: vitest green.

## Phase 1 — Evidence → Assemble → Constrained insight → Render

- [ ] **T1.1** `lib/call-mode/evidence.ts` — `buildProspectEvidence(brain, latestSignal, callIntel?)`. Maps `ContactBrainJSON` + `latestSignal` → `ProspectEvidence` with `source`+`confidence`; applies R1.3 freshness/confidence gating and R1.4 (no ungrounded edges/memories). Pure (brain passed in).
  - Test: `evidence.test.ts` — signal present → `reason` set with `source.kind="signal"`; dossier-only → reason from angle; empty brain → all-null evidence; a low-confidence/stale item is excluded.
  - Verify: vitest green.
- [ ] **T1.2** `lib/call-mode/assemble.ts` — `assembleScript(evidence, template)`. Implements the §4 rules (reuse `deriveOpeningReason` for the reason rule). Deterministic, no I/O. Marks each bloc `grounded` + `provenance.sourceRef` (an `EvidenceItem.id`) + `leverIds`. Emits `gaps` via `validateScript`.
  - Test: `assemble.test.ts` — (a) snapshot: same evidence+template ⇒ identical script; (b) **grounding invariant**: every `provenance.sourceRef` exists in the input evidence ids; (c) exactly one `problemTier1` bloc; (d) no-evidence ⇒ opener+template blocs only, `reason`/`insight` absent.
  - Verify: vitest green.
- [ ] **T1.3** `lib/call-mode/insight.ts` — `generateGroundedInsight(evidence, template, model)`. The single LLM call: zod schema with `evidenceRef`; post-validate and **drop any claim whose `evidenceRef` ∉ evidence ids** (fail-closed); `null` model ⇒ return template stub. Inject `generate`/`model` for tests (mirror `coaching-classifier.ts` `ClassifierDeps`).
  - Test: `insight.test.ts` — (a) valid `evidenceRef` → claim kept; (b) **bogus `evidenceRef` → claim dropped, stub used** (the fail-closed guarantee); (c) no model → stub, no throw; (d) no `insightInputs` → not called.
  - Verify: vitest green.
- [ ] **T1.4** Migration: add nullable jsonb `blocs` to `callScripts` (additive). Before applying, diff the live table (`reference_db-migration-drift`); read with a default so legacy rows load; write via object merge (`||`), never `jsonb_set` (`reference_jsonb-set-missing-intermediate`).
  - Verify: load an existing tenant script (no `blocs`) → defaults applied, no 42703; round-trip a `blocs` edit.
- [ ] **T1.5** `tenant-script.ts` — seed the template `blocs` (insight stubs, peer references from the tenant's own won/active deals, per-sector objection bank) from product+ICP; **remove any vendor-hardcoded content path**. Extend `loadTenantScript`/`upsertTenantScript`/`generateCallScript` to round-trip `blocs`.
  - Test: extend `tenant-script` coverage — generated objection bank uses "vous" and contains no `$999`/vendor names; load falls back cleanly when `blocs` is null.
  - Verify: vitest + a manual generate on tenant `47dca783` reads Pilae-grounded content (no Elevay).
- [ ] **T1.6** `POST /api/calls/script/assemble` `{ contactId }` → `{ script }`. Server builds evidence from the brain, loads the template, runs assemble + insight, returns `AssembledScript`. Tenant-scoped (`withAuthRLS`); edits attributed via `appUserId`.
  - Test: route test with a seeded contact → grounded blocs + provenance; unknown contact → opener/template only, 200.
  - Verify: curl/Playwright (read-only, no dial) returns a grounded script for a real Pilae contact.
- [ ] **T1.7** `_call-script.tsx` — render the assembled blocs in order with the provenance chip per grounded bloc (generalise the shipped reason chip) and a "needs attention" marker per failed lever from `gaps`. Keep edit/regenerate against `/api/calls/script`. Replace the client-only interpolate path with the `assemble` fetch; graceful-degrade to template render on 5xx.
  - Verify: select a prospect with a signal → opener + grounded reason + grounded insight + one problem + de-risked ask, each sourced; select a prospect with no brain → opener + template only, no invented blocs; a broken template shows the lever marker. Screenshot before/after (no dialing).
- [ ] **T1.8** Phase 1 acceptance: evaluation tests 1–4 + 6 (requirements §6) pass; `regression.sh` + `call-scripts.test.ts` + `live-script.test.ts` green; visual check captured.
  - Verify: full vitest run + regression green; screenshots attached.

## Phase 2 — Score + learn (gated on Phase 1 review)

- [ ] **T2.1** Migration: nullable jsonb `leverScores` on `calls` (additive, same drift cautions).
- [ ] **T2.2** `levers.ts` — add `scoreTranscript(transcript, script)` reusing the *same* predicates; subjective levers via a rubric-constrained Haiku judge (inject model, like the classifier).
  - Test: deterministic levers from a fixture transcript; judge mocked.
- [ ] **T2.3** `inngest/calls-post-process.ts` — on call end with transcript, compute `leverScores`, persist, and emit the one "drill next" lever; surface it near `CampaignFunnelBar`.
  - Verify: replay a completed call → scores persisted, drill shown.
- [ ] **T2.4** Objection flywheel — capture said-and-advanced objection answers into `playbookEntries`; the live coaching tap reads the learned per-tenant bank instead of the static `PLAYBOOK` (removes the Elevay-hardcoded defaults at the source).
  - Test: an accepted answer is written with `outcomeLabel`/`perfScore`; the tap prefers learned over seed.
  - Verify: a Pilae call surfaces Pilae-grounded objection answers, in "vous".

## Out of scope (separate specs — flagged oceans)
Live teleprompter sync · tonality/PAVP · roleplay bot · generator A/B.

## Sequencing note
T0 → T1.1 → T1.2 → T1.3 can land before any migration (pure modules + tests). The migration (T1.4) and API/UI (T1.6–T1.7) follow once the engine is proven in isolation. This keeps the intelligent core testable before any schema or surface change.
