# CLE-06 — Register the `/opportunities` page actions (PILOT) — Tasks

> Branch: `feat/CLE-06-register-opportunities` (off `main`; depends on **CLE-03 + CLE-04 + CLE-05** being present on the branch base — they provide `useRegisterPageActions`, `PageAction`/`PageActionResult`, `runRegisteredAction`, the `invokePageAction`/`listPageActions` tools, `decideAction`, and the confirm card).
> Commit trailer (CLAUDE.md): `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> All paths under `app/apps/web/`. Order: pure extractions first (so handlers are callable with explicit args without duplication), then declare + register the actions, then the detail page, then the full sweep.
> Each task: **action → file → verify → test**. A task is "done" only when its verify passes and its test is written + green. **Reuse existing handlers — never duplicate their logic** (AC-11).

---

### Task 1 — Extract the list page's network bodies into shared, behaviour-preserving helpers
- **Action:** In `app/apps/web/src/app/(dashboard)/opportunities/page.tsx`, create four `useCallback` helpers by lifting (not copying) the network body out of the existing handlers, then rewire the existing handlers to call them (design §4):
  - `submitCreate(input)` ← the `POST /api/opportunities` + `fetchDeals(); fetchAnalytics()` from `handleCreate` (`:318-329`); `handleCreate` now builds `input` from state and calls it, keeping its `setShowCreate(false)`/`toast`/`setCreating` UI.
  - `deleteDeals(ids, cascade)` ← the per-id `DELETE /api/opportunities/${id}` loop + optimistic remove + rollback from `performCascadeDelete` (`:481-525`); `performCascadeDelete` calls it with `cascadeTarget.ids` + the ticked keys, keeping its toast/`setCascadeBusy`.
  - `restoreDealsResult(ids)` ← the `POST /api/opportunities/restore` from `restoreDeals` (`:263-273`); `restoreDeals` calls it, keeps its toast/refetch.
  - `analyzeDealsByIds(ids)` ← the `POST /api/deals/analyze` + refetch from `analyzeDeals` (`:343-349`); `analyzeDeals` calls `analyzeDealsByIds(deals.map(d=>d.id))`, keeps its toast/`setAnalyzing`.
  Each helper returns `{ ok: boolean; error?: string }`.
- **Verify:** `pnpm tsc --noEmit` clean. Grep the file: each of the four fetch URLs (`/api/opportunities` POST, `/api/opportunities/${...}` DELETE, `/api/opportunities/restore`, `/api/deals/analyze`) appears **once**. By hand (or RTL), the create modal / row-delete / archive-restore / Analyze button still produce the same network call (no behaviour change).
- **Test:** `src/__tests__/opportunities-actions.dedup.test.tsx` (started here, completed Task 7) — for each helper, spy `global.fetch` and assert the URL+body match what the page sent before the extraction (the regression guard for AC-11).

### Task 2 — Add the pure filter/count/format helpers
- **Action:** In the same file, add `countMatching(deals, filters, stalledOnly)` by lifting the `filteredDeals` predicate (`:539-568`) into a pure function (so the action can count results), and a tiny `describeFilters(params)` pure formatter for the summary text (design §4). Optionally route the existing `filteredDeals` memo through `countMatching` to dedup the predicate.
- **Verify:** `pnpm tsc --noEmit` clean. `countMatching` over a fixture board returns the same set size the board renders for the same filters.
- **Test:** `src/__tests__/opportunities-filter-helpers.test.ts` — `countMatching` matches the predicate for stage/owner/value-gte/value-lte/closeDate-lte/risk/stalledOnly combos incl. the 0-result case; `describeFilters` renders a readable, emoji-free string.

### Task 3 — Add the live-value refs
- **Action:** In `page.tsx` add `dealsRef`/`stagesRef` (`useRef` mirrored each render via `useEffect`) per design §3.1; in `[id]/page.tsx` add `suggestionRef` per §3.2. These let `run` read the live board/stages/suggestion without re-registering actions on every state change.
- **Verify:** `pnpm tsc --noEmit` clean. Confirm the refs are updated in an unconditional `useEffect` (runs every render).
- **Test:** Covered by the action tests (Tasks 4/6) which assert `run` sees the latest fixture `deals`/`suggestion`.

### Task 4 — Declare `opportunityListActions` and register them
- **Action:** In `page.tsx`, add the `opportunityListActions: PageAction[]` `useMemo` exactly as design §3.1 (the 7 core + 2 optional actions, each `run` calling the existing handler / extraction / setter; the `ok`/`err` local helpers). Add `useRegisterPageActions(opportunityListActions)` at the top level of the component (after the handlers/extractions are defined, never inside a conditional). Import `useRegisterPageActions` + the `PageAction`/`PageActionResult` types from CLE-03 and `z` from `zod`.
- **Verify:** `pnpm tsc --noEmit` clean. The `useMemo` dep array keeps the **id set** stable (no re-register on board change) — confirm by logging registration count across a `setDeals` in dev, or trust the ref pattern + a test. Confirm `moveStage`'s Won/Lost branch calls `setPendingClose` when `closeReason` is absent and `commitStageChange(...)` directly when present (design §2).
- **Test:** `src/__tests__/opportunities-actions.list.test.tsx` — manifest membership + metadata (AC-1: assert `delete.confirm==="always"`, `applyFilter.confirm==="never"`, `moveStage.confirm==="risky"`+`reversible`); `moveStage` non-closing (AC-2, incl. PUT-fail rollback); **REQUIRED** `moveStage` Won gate (AC-3/E-4: no-reason → `setPendingClose` + no committed `commitStageChange` + non-success result; with reason → direct `commitStageChange` once; `other` w/o note → `ok:false`); `createDeal` mapped body + empty-name reject (AC-4); `applyFilter` incl. 0-result (AC-5/E-3); `setView` board/table/archive (AC-6); `delete`+`restore` (AC-8/E-8); `analyzePipeline` default ids + 0-deal (AC-9); edge guards unknown id/stage/same-stage (E-1/E-2/E-6).

### Task 5 — (Covered in Task 4's file) confirm metadata wiring is honest
- **Action:** Re-read each action's metadata against requirements §2: `mutating`/`outbound`/`reversible`/`cost`/`confirm`. Ensure `applyFilter`/`setView`/`toggleForecast`/`toggleAnalytics` are `mutating:false, confirm:"never"`; `delete` is `confirm:"always"`; the rest are `mutating:true, reversible:true, confirm:"risky"`; all are `outbound:false, cost:"free"`.
- **Verify:** A metadata assertion test (in the Task 4 file) covers every id. Cross-check with CLE-04 `decideAction`: `confirm:"never"`→execute; `confirm:"risky"`+reversible→confirm; `confirm:"always"`→confirm (so `delete`/mutating ones all card; filters/views run immediately).
- **Test:** Already in `opportunities-actions.list.test.tsx` (the metadata assertions) + a focused `decideAction` cross-check: feed each action's scalars to `decideAction` (member role, default mode) and assert `applyFilter`/`setView`→`execute`, `moveStage`/`createDeal`/`delete`/`restore`/`analyzePipeline`→`confirm`.

### Task 6 — Declare + register the detail page action (`autoProgress`)
- **Action:** In `app/apps/web/src/app/(dashboard)/opportunities/[id]/page.tsx`, add `opportunityDetailActions: PageAction[]` `useMemo` with `opportunities.autoProgress` exactly as design §3.2 (reusing `applySuggestion` verbatim, reading `suggestionRef`, comparing `dealId` to `params.id`). Add `useRegisterPageActions(opportunityDetailActions)` at top level — **above** the `if (loading) return …` / `if (!deal) return …` early returns (`:341-342`) so the hook is unconditional (design §1.3).
- **Verify:** `pnpm tsc --noEmit` clean. Confirm the hook is not inside a conditional/early-return. Confirm `run` guards on `suggestionRef.current` and the dealId match before calling `applySuggestion`.
- **Test:** `src/__tests__/opportunities-actions.detail.test.tsx` — manifest = `[opportunities.autoProgress]` and list-only ids absent (AC-1); `autoProgress({dealId,apply:true})` with a suggestion → `/auto-progress` POST `{apply:true}` + `applySuggestion` invoked + `ok:true` (AC-7); no suggestion → `ok:false`; wrong dealId → `ok:false` (E-1).

### Task 7 — No-duplication + off-page degradation tests
- **Action:** Complete `opportunities-actions.dedup.test.tsx` (Task 1): assert the button/drag path and the action path issue the **same** URL+body for create / delete / restore / analyze / moveStage. Add an off-page degradation test (reuse CLE-03's lifecycle pattern): mount then unmount the list page, assert the `opportunities.*` ids are gone from `getActionManifest()` and `runRegisteredAction("opportunities.moveStage", …)` returns `{ ok:false, error:"action_not_registered" }`.
- **Verify:** Both tests green. Manual grep confirms each fetch URL appears once per file (AC-11).
- **Test:** This task *is* the tests (`opportunities-actions.dedup.test.tsx` finished + the lifecycle assertion, AC-10/AC-11/E-5).

### Task 8 — Live verification on the real board (Playwright-style) + screenshots
- **Action:** Run the app (turbopack dev rig per memory `reference_worktree-verify-rig`/`reference_callmode-local-verify`). Mint a session, open `/opportunities` with the dock. Exercise: "move the first deal to Demo" (observe card jump + PUT), "filter to deals in negotiation" (observe chips + filtered board), "move it to Won" (observe the `CloseReasonDialog` appear — gate enforced). Screenshot before/after each (CLAUDE.md screenshot rule) into `_research/raw/cle-06/`.
- **Verify:** Each action visibly takes effect on the live board; the Won move surfaces the close-reason dialog (not a silent commit). Capture the network calls.
- **Test:** Manual/Playwright evidence saved as screenshots; note results in the sprint report. (No automated Playwright file required, but the screenshots are the Phase-6 eval-step-13 artifact.)

### Task 9 — Full acceptance + regression sweep
- **Action:** Re-read AC-1..AC-11 and E-1..E-10 against the code; confirm the two **required** named tests exist and pass (`moveStage` Won enforces the close-reason gate; the no-duplication/dedup review). Run the whole CLE-06 test set + repo regression.
- **Verify:** `pnpm tsc --noEmit` → 0 errors. `pnpm vitest run` for the new files → all green. `bash regression.sh` (repo root) → green. CLE-03/04/05 tests untouched and green. Grep both pages once more: no duplicated fetch body, no handler logic copied for the agent path. No new runtime dependency in `apps/web/package.json`. No new API route added.
- **Test:** This task is the gate, not new code. Any AC/edge case lacking a test → add it before declaring done (CLAUDE.md: 100% tested, every bug → regression test).

---

## Dependency / ordering notes
- **Tasks 1–3 (extractions + refs) before Task 4** — the actions' `run`s call the extractions and read the refs; doing them first means Task 4 only *declares*, never *duplicates*.
- **Task 4 (list) and Task 6 (detail) are independent** of each other and can be parallelized; both depend on 1–3 for the list / on the `suggestionRef` for the detail.
- **Task 7 depends on 4 + 6** (it tests both paths). **Task 8 depends on 4 + 6** being green. **Task 9 is the final gate.**
- **CLE-05 interaction:** `moveStage`/`createDeal`/`delete`/`restore`/`analyzePipeline`/`autoProgress` are `confirm:"risky"`/`"always"` → they reach CLE-05's confirm card before `run`. `applyFilter`/`setView`/`toggle*` are `confirm:"never"` → CLE-03 runs them immediately. CLE-06 does not render any card itself; it only declares the metadata that drives the gate.
- **The close-reason gate (design §2) is an action-local second confirmation** *inside* `run`, separate from CLE-05's card. It is the one design choice to flag in the final report (it adds a human checkpoint for Won/Lost that no CLE contract mandates, but `PageActionResult` models it cleanly via `ok:false` + `summary`). It changes no contract.
- **CLE-11 (audit/undo):** these actions declare `reversible:true` honestly (stage revert, soft-delete→restore, re-analyze) but the undo *mechanism* + `tool_call_events` logging is CLE-11 — out of scope here.
- **Bulk/cross-page ops stay headless** (README §3.6): "analyze every deal in the company", "delete all lost deals across the whole pipeline" should route to headless deal tools (they act beyond the loaded board), not to these page actions. The system-prompt heuristic (CLE-04 §2.9) already teaches this; CLE-06 adds nothing for it.
