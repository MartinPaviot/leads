# CLE-06 — Register the `/opportunities` page actions (PILOT) — Requirements

> **Pilot** of the Page Action Registry (PAR). This is the first real page to declare its actions; it proves the CLE-03/04/05 machinery end to end on a rich, multi-handler page.
> Constitution: `_specs/chat-live-executor/README.md` (SSOT for every contract cited — §3.1 directive, §3.2 `PageAction`, §3.3 `useRegisterPageActions`, §3.6 routing, §2 human-bound non-scope).
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§3 parity table, `/opportunities` row line 94: "drag kanban → stage (+ dialogue close-reason), toggles forecast/analytics, filtres, MEDDPICC approve"; §4.1 `opportunities.moveStage` example, lines 125-129).
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-06-register-opportunities` (phase 1, milestone M1, `depends_on: ["CLE-04-page-action-tools", "CLE-05-action-confirmation-ux"]`, completeness target 9).
> Depends on (must be present on the branch base): **CLE-03** (`useRegisterPageActions`, `PageAction`, `PageActionResult`, the registry, the executor + confirm gate), **CLE-04** (`listPageActions`/`invokePageAction`, `decideAction`, the prompt heuristic), **CLE-05** (the confirm card that renders when `requireConfirm:true`).

This feature writes **no** new framework code. It calls `useRegisterPageActions(...)` from the two opportunities pages, mapping each declared `PageAction.run` to a handler **that already exists** on the page (drag-to-stage commit, create-deal POST, filter setters, view setters, auto-progress POST, cascade delete, restore, analyze). Zero handler logic is duplicated — the `run` closure invokes the same function the button/drag/setter invokes.

---

## 1. User story

**As** the founder using the Elevay chat while on the Opportunities page,
**I want** to ask the agent in plain language to move a deal to a stage, create a deal, filter the pipeline, switch the view, auto-advance a deal, delete/restore a deal, or analyze the pipeline,
**so that** the action happens **on the board in front of me** — I see the card move, the filter apply, the view flip — instead of the agent silently writing to the database where I can't see it (audit §2 G1/G4; README doctrine §1.1 "parity by construction").

Concretely: "move the Acme deal to Won" makes the card jump to the Won column and persists the stage (and, because Won/Lost requires a close reason, asks me for one before committing); "filter to deals over 50k in negotiation" applies the visible filter chips; "show me the table view" flips the layout; "create a deal called Pilot for Spineart at 20k" opens/commits the create flow; "delete the stale Foo deal" pops a confirm card before soft-deleting.

This is the **pilot**: it must demonstrate that a page with an interactive gate (the close-reason dialog), client-only state (filters/views), server mutations (create/delete/auto-progress), and an AI batch op (analyze) can all be expressed as `PageAction`s with correct `mutating`/`outbound`/`reversible`/`cost`/`confirm` metadata, reusing existing handlers. CLE-07/08/09 then replicate the pattern.

---

## 2. The action set (scope)

Each action has id `opportunities.<verb>`, a `zod` `params` schema, a `run` mapped to an existing handler, and metadata. The metadata column drives `decideAction` (CLE-04 §2.1) → whether CLE-05 shows a confirm card.

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `opportunities.moveStage` | `{ dealId: string; stage: string; closeReason?: { reason: string; note?: string } }` | `commitStageChange` + close-reason gate (`opportunities/page.tsx:379-432`) | true | false | true (stage revert) | free | **risky** |
| `opportunities.createDeal` | `{ name: string; accountId?: string; contactId?: string; stage?: string; value?: number; expectedCloseDate?: string; ownerId?: string }` | the POST in `handleCreate` (`opportunities/page.tsx:313-337`) | true | false | true | free | **risky** |
| `opportunities.applyFilter` | `{ stage?; owner?; minValue?; maxValue?; closeDateBefore?; risk?: "high"\|"medium"\|"low"\|"none"; stalledOnly?: boolean; search?: string }` | `setActiveFilters` / `setStalledOnly` / `setSearchQuery` (`page.tsx:194,200,177` + `clearFilters`) | false | false | true | free | **never** |
| `opportunities.setView` | `{ view: "board"\|"table"; archived?: boolean }` | `setViewMode` / the Archive toggle (`page.tsx:183,186,846-857`) | false | false | true | free | **never** |
| `opportunities.autoProgress` | `{ dealId: string; apply: true }` | `applySuggestion` POST (`opportunities/[id]/page.tsx:278-302`) | true | false | true | free | **risky** |
| `opportunities.delete` | `{ dealId: string; cascade?: ("activities"\|"notes"\|"tasks")[] }` | `openCascadeDelete` → `performCascadeDelete` (`page.tsx:439-526`) | true | false | true (soft-delete → restore) | free | **always** |
| `opportunities.restore` | `{ dealId: string }` | `restoreDeals` (`page.tsx:261-278`) | true | false | true | free | **risky** |
| `opportunities.analyzePipeline` | `{ dealIds?: string[] }` | `analyzeDeals` POST (`page.tsx:339-357`) | true | false | true | free | **risky** |
| `opportunities.toggleForecast` *(optional)* | `{ open?: boolean }` | `setShowForecast` + `fetchForecast` (`page.tsx:166,246-256,825-829`) | false | false | true | free | **never** |
| `opportunities.toggleAnalytics` *(optional)* | `{ open?: boolean }` | `setShowAnalytics` (`page.tsx:163,834`) | false | false | true | free | **never** |

> **Surface scoping.** The list-page actions (`moveStage`, `createDeal`, `applyFilter`, `setView`, `delete`, `restore`, `analyzePipeline`, `toggleForecast`, `toggleAnalytics`) register only on `/opportunities`. `autoProgress` registers on the detail page `/opportunities/[id]` (where the suggestion + `applySuggestion` live). Each page registers exactly the actions whose handlers it owns; when the user navigates away the registry clears them (CLE-03 unmount cleanup) so `listPageActions` only ever shows what the current page can do.

> `delete` is the only `confirm:"always"` (it is destructive even though soft-delete makes it `reversible`). `applyFilter`/`setView`/`toggleForecast`/`toggleAnalytics` are `confirm:"never"` (pure client view state, no persistence). The mutating-but-reversible server actions (`moveStage`/`createDeal`/`autoProgress`/`restore`/`analyzePipeline`) are `confirm:"risky"` so `decideAction` (CLE-04 §2.1) returns `confirm` → CLE-05 renders an editable card before running.

---

## 3. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: "the registry" = CLE-03 `lib/chat/page-actions/registry.ts`. "the manifest" = `getActionManifest()`. "invoke X" = the model calls `invokePageAction("opportunities.X", params)` (CLE-04), which emits the directive that CLE-03's executor dispatches (after CLE-05's confirm gate when `requireConfirm:true`). Each criterion is testable in isolation against the action's `run` (the framework round-trip is already covered by CLE-03/04/05 tests).

### AC-1 — The page's actions appear in the manifest only while it is mounted
- **GIVEN** the user is on `/opportunities`,
- **WHEN** `getActionManifest()` is read,
- **THEN** it contains the list-page actions (`opportunities.moveStage`, `.createDeal`, `.applyFilter`, `.setView`, `.delete`, `.restore`, `.analyzePipeline` [+ optional `.toggleForecast`/`.toggleAnalytics`]) with correct `mutating`/`outbound`/`reversible`/`cost`/`confirm` scalars and a JSON Schema per `params`,
- **AND** `opportunities.autoProgress` is **absent** (it belongs to the detail page),
- **AND** after navigating to `/opportunities/[id]`, the manifest contains `opportunities.autoProgress` and **not** the list-only actions (CLE-03 unmount cleanup, AC-6 of CLE-03).

### AC-2 — `moveStage` to a non-closing stage moves the card and persists
- **GIVEN** a deal with id `D` exists in the currently-loaded board and `stage="qualification"`,
- **WHEN** `opportunities.moveStage({ dealId: "D", stage: "demo" })` runs,
- **THEN** the card moves to the Demo column (optimistic update via the same `setDeals` the drag uses), the same `PUT /api/deals/D` the drag fires is sent with `{ stage: "demo" }`, and on success the result is `{ ok: true, summary: "Moved <deal name> to Demo." }`,
- **AND** on a failed PUT the optimistic move rolls back (the existing `commitStageChange` rollback) and the result is `{ ok: false, error: ... }`.

### AC-3 — `moveStage` to Won/Lost enforces the close-reason gate
- **GIVEN** a deal `D`,
- **WHEN** `opportunities.moveStage({ dealId: "D", stage: "won" })` runs **without** a `closeReason`,
- **THEN** the close-reason gate is enforced — the deal is **not** committed to Won until a reason is supplied: the existing `CloseReasonDialog` is opened (`setPendingClose`, `page.tsx:391-394`) for the human to pick a reason, and the action result reports that confirmation is pending (it does **not** report a silent success),
- **AND** **WHEN** `opportunities.moveStage({ dealId: "D", stage: "won", closeReason: { reason: "product_fit" } })` runs **with** a reason, **THEN** `commitStageChange(D, "won", prev, { reason: "product_fit", note: null })` is called directly (the dialog is bypassed because the reason is already supplied) and the result is `{ ok: true, summary: "Marked <deal name> Won (product_fit)." }`,
- **AND** a Won/Lost move with `closeReason.reason === "other"` **without** a `note` is rejected at the `params`/run boundary (the dialog's own rule: "other" requires a note, `close-reason-dialog.tsx:67-69`) → `{ ok: false, error: "A note is required when the reason is \"other\"." }`.

### AC-4 — `createDeal` creates a deal and refreshes the board
- **GIVEN** the user is on `/opportunities`,
- **WHEN** `opportunities.createDeal({ name: "Pilot", accountId: "A1", stage: "lead", value: 20000 })` runs (after the CLE-05 confirm card, since `confirm:"risky"`),
- **THEN** the same `POST /api/opportunities` body that `handleCreate` sends is posted (`name`, `stage`, `value`, `companyId: accountId`, `contactId`, `expectedCloseDate`, `ownerId`), the board re-fetches (`fetchDeals` + `fetchAnalytics`), and the result is `{ ok: true, summary: "Created opportunity \"Pilot\"." }`,
- **AND** a missing/empty `name` is rejected by the schema (mirrors `handleCreate`'s `if (!newName.trim()) return`) → `{ ok: false, error }`, no POST.

### AC-5 — `applyFilter` applies visible filters; an empty result is reported, not an error
- **GIVEN** the user is on `/opportunities`,
- **WHEN** `opportunities.applyFilter({ stage: "negotiation", minValue: 50000 })` runs,
- **THEN** the filter chips/state are set via the same `setActiveFilters`/`setStalledOnly`/`setSearchQuery` the FilterPanel uses (the board immediately reflects the filtered set), `confirm` is `never` so it runs without a card, and the result summarizes the applied filters + the resulting count, e.g. `{ ok: true, summary: "Filtered to 3 deals (stage=negotiation, value≥$50,000)." }`,
- **AND** when the filter yields **0** deals the result is still `{ ok: true, summary: "No deals match (stage=negotiation, value≥$50,000)." }` (an empty result is a valid outcome, not a failure) so the model can tell the user plainly.

### AC-6 — `setView` flips the layout without persistence
- **GIVEN** the user is on `/opportunities` in board view,
- **WHEN** `opportunities.setView({ view: "table" })` runs,
- **THEN** `setViewMode("table")` is called, the table renders, `confirm` is `never`, and the result is `{ ok: true, summary: "Switched to table view." }`,
- **AND** `opportunities.setView({ view: "table", archived: true })` also enters the Archive view (the existing Archive toggle path: `setViewDeleted(true); setViewMode("table"); ...`, `page.tsx:850-852`) → `{ ok: true, summary: "Showing the archive (table)." }`.

### AC-7 — `autoProgress(apply:true)` advances the deal on the detail page
- **GIVEN** the user is on `/opportunities/[id]` for deal `D` and a stage suggestion is present,
- **WHEN** `opportunities.autoProgress({ dealId: "D", apply: true })` runs (confirm card first, `confirm:"risky"`),
- **THEN** the same `POST /api/opportunities/D/auto-progress { apply: true }` that `applySuggestion` sends is posted, the local stage updates (the existing `setDeal(... stage: suggestion.next)`), and the result is `{ ok: true, summary: "Advanced <deal name> to <next stage>." }`,
- **AND** if there is no suggestion to apply, or the server rejects, the result is `{ ok: false, error }` (the existing toast path's error message).

### AC-8 — `delete` always confirms, then soft-deletes; `restore` brings it back
- **GIVEN** a deal `D` in the active pipeline,
- **WHEN** `opportunities.delete({ dealId: "D" })` runs,
- **THEN** because `confirm:"always"`, CLE-05 shows a confirm card first; on approve, the same `DELETE /api/opportunities/D` (with the chosen `cascade` keys) that `performCascadeDelete` issues is sent, the row is removed optimistically, and the result is `{ ok: true, summary: "Moved <deal name> to Archive." }`,
- **AND** `opportunities.restore({ dealId: "D" })` calls the same `POST /api/opportunities/restore { ids: ["D"] }` as `restoreDeals` and returns `{ ok: true, summary: "Restored <deal name>." }`.

### AC-9 — `analyzePipeline` runs the deal analysis batch
- **GIVEN** the user is on `/opportunities` with ≥1 deal,
- **WHEN** `opportunities.analyzePipeline()` runs (confirm card, `confirm:"risky"`),
- **THEN** the same `POST /api/deals/analyze { dealIds }` that `analyzeDeals` sends is posted (defaulting `dealIds` to the loaded deals when omitted, exactly as `analyzeDeals` does with `deals.map(d => d.id)`), the board + analytics re-fetch, and the result is `{ ok: true, summary: "Analyzed <N> deals." }`,
- **AND** with 0 deals it returns `{ ok: false, summary: "No deals to analyze." }` (mirrors `analyzeDeals`'s `if (deals.length === 0) return`).

### AC-10 — An action invoked while NOT on the opportunities page degrades gracefully
- **GIVEN** the user is **not** on `/opportunities` (e.g. on `/contacts`), so the opportunities actions are unregistered,
- **WHEN** the model nonetheless emits `invokePageAction("opportunities.moveStage", ...)`,
- **THEN** CLE-04's tool refuses with `{ error, availableActionIds }` (the id is not in the current manifest) **or**, if a stale directive reaches the client, CLE-03's `runRegisteredAction` returns `{ ok:false, error:"action_not_registered" }` — never a crash, never a move on a board that isn't there,
- **AND** the model is taught (CLE-04 prompt) to fall back to the headless deal tools (`updateDeal`/`createDeal`/etc.) when page actions are unavailable.

### AC-11 — No handler logic is duplicated
- **GIVEN** the implementation,
- **WHEN** the code is reviewed,
- **THEN** every `run` body calls an **existing** page function or state setter (`commitStageChange`, the `handleCreate` POST extracted to a shared `submitCreate`, `setActiveFilters`/`setStalledOnly`/`setSearchQuery`, `setViewMode`/`setViewDeleted`, `applySuggestion`/its POST, `openCascadeDelete`/`performCascadeDelete`, `restoreDeals`, `analyzeDeals`) — no second copy of a fetch URL, body shape, optimistic-update, or rollback exists for the agent path,
- **AND** any minimal refactor needed to make a handler callable with explicit args (rather than reading component `useState`) is a **pure extraction** (same body, params instead of closure state) verified to leave the button/drag/setter behaviour byte-identical.

---

## 4. Edge cases (each needs a test)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **`dealId` not in the currently-loaded list** (filtered out, on another page of results, or stale) | `moveStage`/`autoProgress`/`delete`/`restore` resolve the deal defensively. `moveStage` mirrors the drag's `deals.find` guard (`page.tsx:385`): if not found, `{ ok:false, error:"Deal <id> is not in the current view." }` — no PUT. (The agent can navigate/refetch then retry, or use a headless tool.) |
| E-2 | **Invalid `stage`** (not in `activeStages`) | `moveStage` validates `stage` against the live stage list (`activeStages`/`STAGES`); unknown stage → `{ ok:false, error:"Unknown stage \"<x>\"." }`, no PUT, no optimistic move. |
| E-3 | **Filter that yields 0 deals** | `applyFilter` still applies (AC-5) and reports `No deals match (...)` with `ok:true`. The board shows its existing empty state; the toggle/preset disabled-states are unaffected. |
| E-4 | **`moveStage` to Won/Lost without a reason** | The gate is enforced (AC-3): the dialog opens; the action does not silently succeed. If the user cancels the dialog, the optimistic move rolls back (existing `handleCloseReasonCancel`, `page.tsx:427-432`) and the result is `{ ok:false, error:"cancelled", summary:"Close reason not provided." }`. |
| E-5 | **Action invoked while NOT on the page** | Graceful refusal (AC-10). No throw, no effect. |
| E-6 | **`moveStage` to the deal's current stage** (no-op) | Mirrors the drag's `deal.stage === newStage` early return (`page.tsx:385`): `{ ok:true, summary:"<deal> is already in <stage>." }`, no PUT. |
| E-7 | **`createDeal` with an `accountId`/`contactId` that doesn't exist** | The page does not pre-validate ids (it posts them as-is); the action posts the same body and surfaces the server's response. A non-OK POST → `{ ok:false, error }` (the existing `handleCreate` `toast("Failed to create opportunity")` path). |
| E-8 | **`delete` cascade keys** | `cascade` defaults to `[]` (delete the deal only, like a plain row delete). When supplied, only the allowed keys `activities`/`notes`/`tasks` pass (schema `z.enum`); the same per-id `DELETE` with `{ cascade }` is sent as `performCascadeDelete`. |
| E-9 | **Optimistic update + page unmount mid-run** | The list page owns `setDeals`; if the user navigates away mid-`run`, the in-flight fetch settles (CLE-03 E-3 — the dock owns the promise) and the result still round-trips; the now-unmounted `setDeals` is a no-op React warning at worst, not a crash. The action is `reversible` so re-sync on next mount is clean. |
| E-10 | **`analyzePipeline({ dealIds })` with explicit ids not on the board** | Posts exactly those ids (the endpoint is id-based, not view-based); summary reports the count posted. No client-side filtering of the supplied list (parity with the headless intent). |

---

## 5. Out of scope

- **The PAR framework itself** (directive, registry, hook, executor, confirm card, server tools, `decideAction`, prompt) → CLE-03/04/05/10. CLE-06 only *calls* `useRegisterPageActions` and maps `run`s.
- **Audit-log / undo** for these mutating actions (`tool_call_events`, undo window) → CLE-11. CLE-06 declares `reversible` honestly; the undo *mechanism* is CLE-11.
- **Permission matrix** beyond what `decideAction` already enforces (viewer cannot mutate) → CLE-12.
- **Post-action highlight** of the moved card / applied filter ("narrate+actuate") → CLE-15. CLE-06's effect is visible because it drives the real handlers, but the deliberate *highlight* is CLE-15.
- **Nothing on this page is human-bound** — there is no live media, file picker, or security action here, so unlike `/call-mode` (CLE-09) and `/meetings` (CLE-14) there are **no excluded actions** on `/opportunities`. (Note for the initiative: genuinely human-bound or device-bound flows — dial/recorder/file upload/MFA — are excluded per README §2; this page has none. **Bulk cross-page operations stay headless**: "analyze every deal in the company" or "delete all lost deals across the whole pipeline" are mass/cross-view ops the model should route to a **headless** tool, not to these page actions which act on the *currently loaded* board — README §3.6.)
- **Per-deal MEDDPICC approve/dismiss** on the detail page (the audit's "MEDDPICC approve") is **deferred** here: the scorecard (`MeddpiccScorecard`, `[id]/page.tsx:609`) has no page-level approve/dismiss handler today (it is a display component), so there is no existing handler to reuse. Adding one is new feature surface, not a reuse — out of scope for the pilot; revisit in CLE-14 if a handler is added.

---

## 6. Evaluation steps (Phase 6, hostile QA — read literally)

Unit/RTL tests prove each `run → effect` without a live server (mock `fetch`, spy the existing handler/setter). One Playwright-style live check proves the headline loop on the real board.

1. **Manifest membership (unit/RTL).** Mount `/opportunities`; assert the manifest lists exactly the list-page action ids with the metadata table §2 (assert `delete.confirm==="always"`, `applyFilter.confirm==="never"`, `moveStage.confirm==="risky"`, `moveStage.reversible===true`). Mount `/opportunities/[id]`; assert `autoProgress` present and the list-only ids absent. (AC-1.)
2. **`moveStage` non-closing (unit).** Spy `commitStageChange` (or the `fetch` to `/api/deals/:id`); run `moveStage({dealId, stage:"demo"})`; assert one PUT with `{stage:"demo"}`, optimistic `setDeals` called, `ok:true`. Force the PUT to fail; assert rollback + `ok:false`. (AC-2.)
3. **`moveStage` Won gate — the required named test.** Run `moveStage({dealId, stage:"won"})` with **no** `closeReason`; assert `commitStageChange` was **NOT** called with a committed stage, `setPendingClose` (dialog open) **was** triggered, and the result indicates confirmation pending (not silent success). Then run with `closeReason:{reason:"product_fit"}`; assert `commitStageChange(dealId,"won",prev,{reason:"product_fit",note:null})` called once, `ok:true`. Then `closeReason:{reason:"other"}` with no note → `ok:false` (note required). (AC-3 / E-4.)
4. **`createDeal` (unit).** Run with a valid payload; assert one `POST /api/opportunities` with the mapped body (`companyId===accountId`), `fetchDeals` re-called, `ok:true`. Empty `name` → schema reject, no POST. (AC-4.)
5. **`applyFilter` incl. 0-result (unit).** Run `{stage:"negotiation",minValue:50000}`; assert `setActiveFilters` received the equivalent chip set and the summary names the filters + count. Construct a board where the filter matches nothing; assert `ok:true` with a "No deals match" summary. (AC-5 / E-3.)
6. **`setView` (unit).** Run `{view:"table"}` → `setViewMode("table")`, `ok:true`. Run `{view:"table",archived:true}` → archive path entered. (AC-6.)
7. **`autoProgress` (unit, detail page).** Spy the `/auto-progress` POST; run `{dealId,apply:true}`; assert POST `{apply:true}`, local stage advanced, `ok:true`. No-suggestion/server-fail → `ok:false`. (AC-7.)
8. **`delete` + `restore` (unit).** `delete({dealId})` → assert `confirm:"always"` (card path), then DELETE issued with cascade, optimistic remove, `ok:true`. `restore({dealId})` → `POST /api/opportunities/restore {ids:[dealId]}`, `ok:true`. Default cascade is `[]`; supplied cascade only allows `activities|notes|tasks` (bad key rejected). (AC-8 / E-8.)
9. **`analyzePipeline` (unit).** Run with no args on a 3-deal board → POST `{dealIds:[3 ids]}`, `ok:true`, summary "Analyzed 3 deals." 0-deal board → `ok:false` "No deals to analyze." (AC-9.)
10. **Edge guards (unit).** Unknown `dealId` → `moveStage`/`delete` `ok:false` no PUT/DELETE (E-1). Unknown `stage` → `ok:false` no PUT (E-2). Same-stage move → no-op `ok:true` (E-6). (E-1/E-2/E-6.)
11. **Off-page degradation (unit/RTL).** Unmount `/opportunities`; assert the ids are gone from the manifest and `runRegisteredAction("opportunities.moveStage",…)` returns `action_not_registered`. (AC-10 / E-5.)
12. **No-duplication review (manual + grep).** Grep the two pages for the deal/analyze/restore fetch URLs — each must appear **once** (or in one shared extracted helper), used by both the button/drag/setter and the `run`. Any second copy of a body shape or rollback = FAIL. (AC-11.)
13. **Live loop (Playwright-style).** On the real `/opportunities` with the dock open: type "move the first deal to Demo" → observe the card jump to Demo and the network PUT; type "filter to deals in negotiation" → observe the chips + filtered board; type "move it to Won" → observe the close-reason dialog appear (gate enforced). Capture before/after screenshots (CLAUDE.md screenshot rule).
14. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. CLE-03/04/05 tests untouched and green. The opportunities page's existing behaviour (drag, create modal, filters, archive, delete, analyze) is byte-identical when used by hand (the extractions preserved it).

**Hard thresholds:** AC-1..AC-11 all pass; every edge case E-1..E-10 has a passing test; the two **required** named tests pass (`moveStage` Won enforces the close-reason gate; the no-duplication review); `tsc` 0 errors; no handler logic duplicated; the page's manual UX unchanged. Any miss = FAIL → delete branch → respec.
