# ICP Unification · Tasks

> Ordered. Each task: code → test → verify → commit. Phase 0 ships (and is verified in prod) before Phase 1 starts. Branch: `feat/icp-unification` (Phase 0 may ship separately as `fix/score-scale`).

## Phase 0 — honest scoring (P0, no UI change)

- [x] **T0.1 Blended fit in the engine.** DONE 2026-06-11 — `computeBlendedFit` in `criteria-engine.ts` (own loop, Levels semantics + blend, sourcing-only skipped entirely incl. as gates) + `SOURCING_ONLY_FIELD_KEYS` in `field-catalog.ts`.
  *Test:* `criteria-engine-blended.test.ts` locks the §2 worked examples (80/70/100/0) + edge cases (required-only 1.0, none-evaluable+required 0.6, R2.5 0).
- [x] **T0.2 Recompute rewrite.** DONE 2026-06-11 — primitives in `lib/icp/fit-recompute-core.ts` (3 queries per 100-company batch: select / multi-row cell upsert / UPDATE…FROM jsonb_to_recordset), Inngest fn = one `step.run` per batch (memoized resume) + per-tenant concurrency key; daily cron now fans out `icp/recompute-tenant` events; guard tightened to "scorable criteria" (people-only ICPs can't zero a book); summary → `tenants.settings.lastIcpRecompute`.
  *Test:* via core unit tests (`gradeRank`, mirror math); live-verified by the backfill recompute of c52732be (1054 companies, 11 batches, completed).
- [x] **T0.3 Scale adapters.** DONE 2026-06-11 — `fitFromCompanyScore` (clamped /100) in `priority-score.ts` consumed by `signal-score-daily`; `/api/score` fit = primary matrix cell ×100 (active ICPs join), legacy flats fallback when the tenant has no cells.
  *Test:* `score-scale.test.ts` (adapters + gradeRank ordering + mirror never in (0,1)).
- [x] **T0.4 Backfill.** RAN ON PROD 2026-06-11 (`scripts/backfill-score-scale.ts`, dry-run reviewed then --apply): 0 scores left in (0,1] (the 47dca783 restoration of the same day had already cleaned the worst), 90 empty active "Default" shells soft-deleted, 1 populated from real flats (c52732be) then recomputed by the new engine — 1054 companies, 1044 regraded up, 39 unowned, spread B×1015. 47dca783 untouched (no active ICPs — guardrail).
- [x] **T0.5 Validation guard.** DONE 2026-06-11 — `validateIcpInput` rejects active with 0 criteria.
  *Test:* `icp-active-empty-criteria.test.ts`.

## Phase 1 — one ICP surface

- [x] **T1.1 uiState plumbing.** DONE 2026-06-11 (PR #155) — `lib/icp/ui-state.ts` (uiStateToCriteria, criteriaToUiState lossy adoption, splitCriteria/GUIDED_SLOTS, mirrorFromUiState, strict parsers) + `lib/icp/mirror.ts#syncRankOneMirror` (re-derives the flats from whoever is rank 1 after every mutation); `validateIcpInput` combines generated + advanced criteria in one path.
  *Test:* `icp-ui-state.test.ts` (round-trip, importance mapping, R5.2 mirror key list, R5.5 shape guard).
- [x] **T1.2 Reorder endpoint.** DONE — `POST /api/icps/reorder` (priority = index, 409 on stale payloads, mirror + recompute after).
- [x] **T1.3 Unified page.** DONE — `/settings/icp` list (drag-reorder, fit counts, Source companies, Archive) + guided editor on `components/icp/criterion-list.tsx` (CriterionList/AmountField/ImportanceSelect/SourcingOnlyHint); geographies accept free text alongside the taxonomy (cantons romands — found during eval). Advanced rows render `in` values as tag lists.
  *Test:* `criterion-list.dom.test.tsx` (no comma parsing, taxonomy never invents, free-text fallback). *Verified live:* screenshots 001-010 in `_audit/2026-06-11-icp-unification-eval/`.
- [x] **T1.4 Diff-after-save.** DONE — `GET /api/icps/recompute-status` + 3 s poll + banner; live Apollo TAM estimate in the editor footer (manual refresh — credits).
  *Verified:* `lastIcpRecompute` written by the live recompute of the real profile (990 companies); the banner itself is not observable from the dev box (Inngest events don't fire locally) — poll + render are plain conditionals.
- [x] **T1.5 Product & Voice.** DONE — `/settings/product` + `api/settings/product` (4 keys, members).
- [x] **T1.6 Redirect + nav.** DONE — `-profiles` redirects; sidebar = ICP + Product & Voice; `PUT /api/settings/icp` removed (GET kept, R8.2). The accounts/TAM CTAs already pointed at `/settings/icp` (URL kept).
- [x] **T1.7 Sourcing unification.** DONE — `icpToStrategy(name, criteria, metadata)`: exact uiState size labels replace the envelope, sourcingFilters as live hard params; Accounts picker "Source from: <profile> (primary)" passing icpId.
  *Verified live:* picker renders with the real profile.
- [x] **T1.8 Re-route flat writers.** DONE — `lib/icp/profile-upsert.ts#upsertRankOneProfileFromUiState` (guided slots replaced, advanced preserved) used by `api/icp/apply` and onboarding's ICP step (profile creation never fails the save).
- [x] **T1.9 AI inference wired.** DONE — "Suggest with AI" → `/api/icps/infer` → candidates adopt into widgets via criteriaToUiState; invalid ones disabled with their validation error.
- [x] **T1.10 Permissions.** DONE — POST/PATCH/reorder member-allowed, DELETE admin-only; viewers blocked by the middleware write gate.

**Phase 1 eval (2026-06-11):** tsc clean; 111 targeted tests; live walkthrough on the shared DB — the REAL "Coeur romand — fondations, santé & parapublic" profile created through the widgets (5 industries, 3 size chips, 6 geographies incl. the free-text "Suisse romande" the registry data labels at that granularity), mirror live-verified (flats = the profile's uiState), recompute live-verified: 57/990 companies owned at ≥50% — consistent with the locked Pilae ICP's expected romand core. Data finding: 574 registry rows carry `region: "Suisse romande"`, not a canton — fixed in the profile data, not in code (no hardcoded matching).

## Phase 2 — the ICP proves itself (separate cycle, spec'd here only as direction)

- [ ] T2.1 Per-profile outcome funnel + false-negative/false-positive alerts (R7.3).
- [ ] T2.2 Approval queue cites the matching criterion; repeated rejections suggest an exclusion.
- [ ] T2.3 Fiche compte / Call Mode: "Fits: <profile> N%" badge from the matrix.

## Exit criteria (Phase 6 eval)

- All R8.3 regression tests green + full `regression.sh`.
- Live prod after backfill: accounts list shows a real grade spread (not all-F), `companies.score` ∈ {0} ∪ [1,100], smart filter "high fit" non-empty on tenant 47dca783.
- Editing the rank-1 profile updates call-script targeting (flats mirror) AND regrades accounts — verified live with screenshots.
- One sidebar entry; `-profiles` redirects; onboarding produces a visible profile.
