# ICP Unification · Tasks

> Ordered. Each task: code → test → verify → commit. Phase 0 ships (and is verified in prod) before Phase 1 starts. Branch: `feat/icp-unification` (Phase 0 may ship separately as `fix/score-scale`).

## Phase 0 — honest scoring (P0, no UI change)

- [ ] **T0.1 Blended fit in the engine.** Add `computeBlendedFit(criteria, ctx)` to `lib/icp/criteria-engine.ts` wrapping `computeIcpFitLevels` with `score01 = fitEvaluable × (0.6 + 0.4·coverage)` + exported constants; add `SOURCING_ONLY_FIELD_KEYS` to `field-catalog.ts` and exclude them from the coverage denominator.
  *Test:* design.md §2 worked examples, exact values. *Verify:* `npx vitest run criteria-engine` from `app/apps/web`.
- [ ] **T0.2 Recompute rewrite** (`inngest/icp-fit-recompute.ts`): batches of 100 via `step.run`, bulk cell upsert + bulk score update per batch, mirror `round(100×score01)`, persist `{identityFit, signalFit, coverage}`, snapshot + `lastIcpRecompute` summary step, keep the no-criteria guard.
  *Test:* `recompute-chunk.test` (fixture 250 companies, batch-kill resumability). *Verify:* replay on dev tenant, check summary key.
- [ ] **T0.3 Scale adapters.** `signal-score-daily.ts`: feed `score/100` into `computePriorityScore`. `/api/score`: fit component = matrix score (R1.5).
  *Test:* `score-scale.test` (no writer yields (0,1)). *Verify:* grep audit of every `companies.score` write site.
- [ ] **T0.4 Backfill script** (`scripts/backfill-score-scale.ts`, dry-run default): ×100 on (0,1] scores; delete-or-populate the 96 empty active Defaults (design §7.2); fire recomputes; print before/after grade distributions.
  *Verify:* dry-run output on prod DB reviewed, then run; assert 0 rows in (0,1]; spot-check tenant 47dca783 grades in the live accounts list (Playwright screenshot).
- [ ] **T0.5 Validation guard:** reject `status: "active"` with 0 criteria in `validateIcpInput`.
  *Test:* `empty-active-icp.test`.

## Phase 1 — one ICP surface

- [ ] **T1.1 uiState plumbing.** `uiStateToCriteria()` + `mirrorFromUiState()` (pure, next to `flat-to-criteria.ts`); extend `validateIcpInput` with `metadata.uiState`/`sourcingFilters` shapes; PATCH/POST `/api/icps` persist metadata, regenerate criteria from uiState + preserve advanced ids, write-through mirror when rank 1 (one tx).
  *Test:* `ui-state-roundtrip.test`, `mirror-write-through.test`.
- [ ] **T1.2 Reorder endpoint.** `POST /api/icps/reorder { orderedIds }` → priority = index, recompute event.
  *Test:* priorities persisted; primary resolution follows new order.
- [ ] **T1.3 Unified page** at `/settings/icp`: list (drag-reorder, fitCount, status chip, Source companies, Archive view) + guided editor (sections/widgets per mapping §B, importance control, sourcing-only labels, Advanced disclosure, no-uiState fallback to Advanced). Reuse the legacy widgets (`MultiSelectDropdown`, `ChipInput`, `AmountField` — extract to `components/icp/`).
  *Test:* RTL component tests for importance mapping + advanced fallback. *Verify:* Playwright walkthrough, screenshots.
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
