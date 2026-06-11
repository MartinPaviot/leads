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

- [ ] **T1.1 uiState plumbing.** `uiStateToCriteria()` + `mirrorFromUiState()` (pure, next to `flat-to-criteria.ts`); extend `validateIcpInput` with `metadata.uiState`/`sourcingFilters` shapes; PATCH/POST `/api/icps` persist metadata, regenerate criteria from uiState + preserve advanced ids, write-through mirror when rank 1 (one tx).
  *Test:* `ui-state-roundtrip.test`, `mirror-write-through.test`.
- [ ] **T1.2 Reorder endpoint.** `POST /api/icps/reorder { orderedIds }` → priority = index, recompute event.
  *Test:* priorities persisted; primary resolution follows new order.
- [ ] **T1.3 Unified page** at `/settings/icp`: list (drag-reorder, fitCount, status chip, Source companies, Archive view) + guided editor (sections/widgets per mapping §B, importance control, sourcing-only labels, Advanced disclosure, no-uiState fallback to Advanced). Extract the legacy widgets into the `CriterionList` primitive (`components/icp/criterion-list.tsx`, design §6) used by every section AND every Advanced row (R4.3b).
  *Test:* RTL component tests for importance mapping + advanced fallback + "no comma-separated text input anywhere" (every `in` value renders as removable tags). *Verify:* Playwright walkthrough, screenshots.
- [ ] **T1.4 Diff-after-save.** `GET /api/icps/recompute-status` (reads `lastIcpRecompute`); editor polls 3 s post-save, shows "N regraded (X up, Y down), Z unowned"; TAM estimate via existing `/api/tam/estimate`.
  *Verify:* live save on dev tenant shows a non-empty diff.
- [ ] **T1.5 Product & Voice.** `/settings/product` page + slim `api/settings/product` (4 keys); strip those fields from the ICP surface.
  *Test:* PUT round-trip; consumers read unchanged keys (grep assert).
- [ ] **T1.6 Redirect + nav + CTAs.** `/settings/icp-profiles` → redirect; legacy form deleted; PUT `/api/settings/icp` removed (GET kept, R8.2); sidebar single entry; update `accounts/page.tsx:824` + `TAMRevealNotification.tsx:121`.
  *Test:* `redirect+sidebar.test`.
- [ ] **T1.7 Sourcing unification.** `icpToStrategy` takes the icp row: exact size labels + `sourcingFilters` merge; Accounts Build TAM profile picker (default rank 1) passing `icpId`.
  *Test:* unit on icp-to-tam param output. *Verify:* live build sources within exclusions.
- [ ] **T1.8 Re-route flat writers.** `api/icp/apply` → upsert rank-1 profile (server-built uiState); `api/onboarding/save` → also create "Default" profile (criteria + uiState).
  *Test:* `icp-apply-reroute.test`; onboarding e2e asserts profile exists post-save.
- [ ] **T1.9 Wire AI inference.** "Suggest with AI" button → `/api/icps/infer` → draft candidates in editor (invalid ones disabled with reason).
  *Verify:* live inference on dev tenant produces ≥1 valid draft.
- [ ] **T1.10 Permissions.** Members create/edit/reorder; DELETE admin-only; viewer read-only with explained disabled controls.
  *Test:* role-matrix API test.

## Phase 2 — the ICP proves itself (separate cycle, spec'd here only as direction)

- [ ] T2.1 Per-profile outcome funnel + false-negative/false-positive alerts (R7.3).
- [ ] T2.2 Approval queue cites the matching criterion; repeated rejections suggest an exclusion.
- [ ] T2.3 Fiche compte / Call Mode: "Fits: <profile> N%" badge from the matrix.

## Exit criteria (Phase 6 eval)

- All R8.3 regression tests green + full `regression.sh`.
- Live prod after backfill: accounts list shows a real grade spread (not all-F), `companies.score` ∈ {0} ∪ [1,100], smart filter "high fit" non-empty on tenant 47dca783.
- Editing the rank-1 profile updates call-script targeting (flats mirror) AND regrades accounts — verified live with screenshots.
- One sidebar entry; `-profiles` redirects; onboarding produces a visible profile.
