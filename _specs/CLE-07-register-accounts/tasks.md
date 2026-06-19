# CLE-07 — Register the `/accounts` page actions (list + detail) — Tasks

> Ordered, each task = code → verify → test. Branch `feat/CLE-07-register-accounts` off the CLE-04/CLE-05 base (deps satisfied). Commit per task with trailer `Co-Authored-By: Rippletide <admin@rippletide.com>`. No new framework code, no new API route, no new runtime dependency. House rules: English prose/labels, no emoji, reuse handlers (zero logic duplication), every `run` returns a `PageActionResult` and never throws.
>
> Design references in brackets are sections of `design.md`. Real-code anchors are `file:line` in `app/apps/web/src`.
>
> **Pre-flight (no commit):** confirm the CLE-03/04/05 modules exist on the branch base — `lib/chat/page-actions/{types,registry}.ts`, `lib/chat/ui-directives.ts` (`invokeAction` arm), `lib/guardrails/decide-action.ts`, `components/chat/use-ui-directives.ts` (envelope codec), the CLE-05 confirm card + `riskBadgesFor`. If any is missing, STOP — CLE-07 has no framework to call. Verify `selectAllMatchingIds` (`lib/infra/select-all-matching.ts:26`) and `chunkedBulkCall` (`lib/infra/chunk-bulk.ts`) signatures match design §1/§4.

---

## Task 0 — Confirm the reused handlers + their line anchors (no code)

- **Do:** Re-grep the list page for the handlers design §1.1 cites — `runEnrich` (`:278`), `bulkScoreSelected` (`:785`), `detectSignals` (`:865`), `extractContactsSelected` (`:896`), `bulkSetExclusion` (`:1027`), `rowSetExclusion` (`:1054`), `selectAllMatching` (`:1081`), `restoreAccounts` (`:1101`), `openCascadeDelete` (`:1128`), `performCascadeDelete` (`:1176`), `startTamBuild` (`:460`), the bulk-bar Call Mode nav (`:1535-1542`), `setShowPersona` (`:206`). And the detail page — `reassignAccountOwner` (`:81`), the inline edit PUT (`:368-382`), the summary refresh POST (`:162-182`), `<AccountCallIntel>` (`:268`), `<CompanyDossier>` (`:272`). Confirm `SmartSearchBar`'s request shape in `components/ui/smart-search-bar.tsx` for `runSmartSearch` (design §4.1 note).
- **Verify:** Every anchor resolves to the function/JSX design §1 describes. If a line drifted, update design §1 file:line before coding (the spec must match reality).
- **Test:** none (reconnaissance).

---

## Task 1 — Pure helper: `describeAccountFilters` [design §4.1]

- **Do:** Add `describeAccountFilters(params)` → a short, emoji-free, human sentence summarizing the applied filters (industries, geographies, sizes, revenues, stages, grades, name/domain text, LinkedIn presence, source tab, enrichment partition). Co-locate near `accountListActions` (or a sibling pure module).
- **Verify:** `pnpm tsc --noEmit` clean; the string reads naturally for a few combos and is empty-safe (no fields → "the current view" or similar).
- **Test (`accounts-actions.helpers.test.ts`):** a handful of param shapes → expected substrings; assert **no emoji** (regex over the output); empty params → a sane default.

---

## Task 2 — List §4 extractions: bulk network bodies → `useCallback` [design §4.1]

- **Do:** Extract, **without changing behaviour**, into `useCallback`s, and rewire the existing handlers to call them:
  - `scoreByIds(ids)` ← `bulkScoreSelected` `chunkedBulkCall`/`/api/score` body `:792-796` (+ refetch).
  - `detectSignalsByIds(ids)` ← `detectSignals` enriched-scoping + `/api/signals` body `:866-877` (+ refetch).
  - `extractContactsByIds(ids)` ← `extractContactsSelected` 50-id fan-out `:905-925`.
  - `setExclusionByIds(ids, action)` ← `bulkSetExclusion` 500-id-chunk `/api/accounts/exclude` body `:1033-1038` (+ refetch).
  - `restoreAccountsResult(ids)` ← `restoreAccounts` `/api/accounts/restore` body `:1104-1113`.
  - `deleteAccountsByIds(ids, cascade)` ← `performCascadeDelete` `DELETE /api/accounts/batch` body `:1180-1191` (+ refetch), driven off the **passed ids** not `cascadeTarget`.
  - `startTamBuildWith({ icpId, allProfiles, targetCount })` ← `startTamBuild`'s `BuildRequest` assembly `:471-481` (parameterized; keeps the active-filter `apolloOverrides`).
  - `runSmartSearch(query)` ← a thin POST mirroring `SmartSearchBar`'s `resourceType:"account"` request (design §4.1 note; the bar untouched).
- **Verify:** `bulkScoreSelected`/`detectSignals`/`extractContactsSelected`/`bulkSetExclusion`/`restoreAccounts`/`performCascadeDelete`/`startTamBuild` now call their extraction and keep their toasts/state; `pnpm tsc --noEmit` clean; grep each fetch URL → appears **once** per file.
- **Test (`accounts-actions.dedup.test.tsx`, part 1):** spy `global.fetch`/`chunkedBulkCall`; the **button/menu path** and a direct call to each extraction issue the **same** URL+body+chunk size (AC-13).

---

## Task 3 — List action array `accountListActions` (read-only + nav) [design §3.1]

- **Do:** Add the `useMemo` array with the refs (`selectedRef`/`accountsRef`/`totalRef`/`viewRef`/`profilesRef`/`rescoringRef` + `filteredAccountsRef`/`smartFiltersRef` mirrors). Implement `applyFilter`, `smartSearch`, `setView`, `selectAll`, `sendToCallMode`, `openPersonaSearch` exactly as design §3.1 (all `confirm:"never"` except none — these six are read-only/nav). Call `useRegisterPageActions(accountListActions)` after `performCascadeDelete`/the extractions are defined (design §1.3).
- **Verify:** `pnpm tsc --noEmit` clean; mounting `/accounts` lists these ids in `getActionManifest()` with the §3.1 metadata; the id set is stable across a selection change (no re-register).
- **Test (`accounts-actions.list.test.tsx`, part 1):** manifest membership + metadata scalars (AC-1); `applyFilter` incl. `clear:true` + a 0-match filter → `ok:true` (AC-2/E-3); `smartSearch` spying `runSmartSearch` (AC-3); `setView` three branches (AC-4); `sendToCallMode` nav + empty-selection `ok:false` (AC-10); `openPersonaSearch` → `setShowPersona(true)`, `mutating:false`.

---

## Task 4 — `selectAll` honest-cap behaviour — REQUIRED named test [design §3.1, AC-5/E-2]

- **Do:** Implement `accounts.selectAll` `run` per design §3.1: `params: z.object({ matchingCurrentFilter: z.literal(true) })`; calls `selectAllMatching()` (`:1081`), then reads `selectedRef.current.size` after the await; honest summary on (a) the normal resolved set, (b) the residual-NL-filter fallback (selection stays the visible rows), (c) the server cap (mirror the page toast `:1094`).
- **Verify:** `tsc` clean; on a fixture with `accounts.length < totalAccounts`, `selectAllMatchingIds` is called with `?idsOnly=true` and the selection is replaced with the resolved set.
- **Test (`accounts-actions.list.test.tsx`, the REQUIRED `selectAll` test):**
  1. spy `selectAllMatchingIds` returning `{ ids:new Set([...50k]), total:73210, truncated:true, failed:false }` → assert `?idsOnly=true` requested, selection = the resolved set, summary reports the count and is honest about the cap.
  2. with a non-score NL smart filter active and the resolved size === visible size → assert the selection stays the visible rows and the summary says so.
  3. `{matchingCurrentFilter:false}` → schema reject (the action is only ever "all matching").

  **This is the required test that `selectAll` resolves the matching id-set honestly.**

---

## Task 5 — List bulk actions (selection-scoped) [design §3.1]

- **Do:** Implement `bulkEnrich`, `bulkScore`, `bulkDetectSignals`, `bulkExclude`, `bulkRestore` (view-dependent via `viewRef`), and the single-row `enrichAccount`/`scoreAccount`/`excludeAccount` per design §3.1 — each computing `ids = accountIds?.length ? accountIds : Array.from(selectedRef.current)`, empty → `err("No accounts selected …")` (E-1), then calling the matching §4 extraction (or `runEnrich`/`rowSetExclusion` directly). Metadata: `bulkEnrich`/`enrichAccount` `cost:"credits"`+`confirm:"risky"`; the rest `cost:"free"`+`confirm:"risky"`.
- **Verify:** `tsc` clean; each empty-selection path returns `ok:false` **without** entering the handler; non-empty calls the extraction with the resolved ids.
- **Test (`accounts-actions.list.test.tsx`, part 2 + the REQUIRED `bulkEnrich` test):**
  - **`bulkEnrich` empty-selection guard (REQUIRED named test):** non-empty selection → `runEnrich` called with the ids; **empty** selection → `ok:false`, `runEnrich` not entered with ids; already-complete → `runEnrich` early-returns, `ok:true` (E-11).
  - `bulkScore`/`bulkDetectSignals` over the selection → `/api/score`/`/api/signals`; partial-failure summary; empty → `ok:false` (E-1).
  - `bulkExclude` → `/api/accounts/exclude` exclude; `bulkRestore` view-dependence (Excluded→include, Archive→restore, neither→no-op `ok:true`, E-7).

---

## Task 6 — Cost-bearing + destructive list actions (ALWAYS confirm) — REQUIRED cost tests [design §3.1, §2, AC-8/AC-11/AC-12]

- **Do:** Implement `bulkExtractContacts` and `startTamBuild` with `cost:"credits"` + `confirm:"always"`, and `bulkDelete`/`deleteAccount` with `confirm:"always"` (cascade `z.enum` default `[]`), per design §3.1. `bulkExtractContacts` → `extractContactsByIds` (50-id fan-out); `startTamBuild` → validate `icpId` against `profilesRef` (unknown → `err("No such ICP profile.")`, E-6) then `startTamBuildWith`; `bulkDelete`/`deleteAccount` → `deleteAccountsByIds(ids, cascade ?? [])`.
- **Verify:** `tsc` clean; `getActionManifest()` shows `bulkExtractContacts.confirm==="always"`+`cost==="credits"`, `startTamBuild.confirm==="always"`+`cost==="credits"`, `bulkDelete.confirm==="always"`, `deleteAccount.confirm==="always"`.
- **Test (`accounts-actions.list.test.tsx`, the REQUIRED cost tests):**
  - **`bulkExtractContacts` requires confirm + sources:** feed its scalars to `decideAction({ approvalMode:"auto-high-confidence", role:"member" })` → `disposition:"confirm"` (so `requireConfirm:true`). Then run (post-confirm) over a selection → the 50-id `POST /api/accounts/extract-contacts` fan-out + created-contacts summary; empty → `ok:false`.
  - **`startTamBuild` requires confirm + builds:** `decideAction` under `auto-high-confidence` → `confirm`. Then `{allProfiles:true}` → `startTamBuildWith` with the all-profiles `BuildRequest`; `{icpId:"x"}` → single-profile; unknown id → `ok:false`, no build.
  - **`bulkDelete`/`deleteAccount`:** `confirm:"always"`; on approve → `DELETE /api/accounts/batch {ids,cascade}`; default cascade `[]`; bad cascade key rejected at the schema; empty selection (bulk) → `ok:false`.

  **These are the required tests that `bulkExtractContacts` and `startTamBuild` require confirm even under an auto-run approval mode.**

---

## Task 7 — Detail §4 extractions + lifted callbacks [design §4.2, §2]

- **Do:**
  - Hoist `saveField(field, value)` (the inline PUT `:368-382`) and `refreshSummary()` (the summary POST `:162-182`) into top-level `useCallback`s **above** the `if (loading)`/`if (!account)` returns (`:94-95`); rewire the field `onKeyDown` and the refresh button to call them.
  - Add `reviewCallIntel(action)` (page-level `POST /api/call-intel/review { entityType:"company", entityId:accountId, action }`) and the pure `hasPendingCallIntel(account)` predicate.
  - Add an optional `onRegister?: (api:{generate:()=>Promise<void>; hasDomain:boolean}) => void` prop to `<CompanyDossier>` (`components/company-dossier.tsx`); register its existing `generateDossier` + `!!accountDomain` on mount via a ref/effect; capture it on the detail page into `dossierApiRef`.
- **Verify:** `tsc` clean; the inline edit / summary refresh / dossier card / call-intel card behave identically by hand; grep `/api/accounts/${accountId}` (PUT), `generate-summary`, `/api/call-intel/review`, `/api/research/dossier` → each appears once per relevant file; `<CompanyDossier>` renders unchanged when `onRegister` is omitted.
- **Test (`accounts-actions.dedup.test.tsx`, part 2):** the inline-edit path and `saveField` issue the same PUT; the refresh-button path and `refreshSummary` issue the same POST; `<CompanyDossier>`'s own button and the lifted `generate()` issue the same `/api/research/dossier` POST (AC-13).

---

## Task 8 — Detail action array `accountDetailActions` [design §3.2]

- **Do:** Add the `useMemo` array (`accountRef` + `accountIdConst` = `params.id` + `dossierApiRef`) with `updateField`, `reassignOwner`, `refreshSummary`, `generateDossier`, `approveCallIntel`, `dismissCallIntel` exactly as design §3.2 (each id-guarded against `accountIdConst`, E-9). Call `useRegisterPageActions(accountDetailActions)` at the top level (above the early returns, design §1.3).
- **Verify:** `tsc` clean; mounting `/accounts/[id]` lists exactly these six ids and **none** of the list-only ids; `updateField.field` is the 5-field `z.enum`.
- **Test (`accounts-actions.detail.test.tsx`):**
  - manifest = the six detail ids (AC-1); list-only ids absent.
  - `updateField({field:"size",value:"200-500"})` → one `PUT {size:"200-500"}` via `saveField`; wrong `accountId` → `ok:false`; bad `field` → schema reject (E-9). `reassignOwner` → `PUT {ownerId}`; `ownerId:null` un-assigns.
  - `refreshSummary` → `POST …/generate-summary`; wrong id → `ok:false`.
  - `generateDossier` with a domain → `dossierApiRef.generate()` (one `POST /api/research/dossier`); **no domain** → `ok:false`, no POST (E-10).
  - `approveCallIntel`/`dismissCallIntel` with a pending `properties.pendingCallIntel` → `POST /api/call-intel/review {action}`; no pending → `ok:false`, no POST (E-10); wrong id → `ok:false`.

---

## Task 9 — `decideAction` cross-check + off-page degradation [design §7, AC-12/AC-14/E-5]

- **Do:** No new code — wire the guardrail + lifecycle assertions.
- **Verify:** mentally trace every action's scalars through `decideAction` (member + default mode): read-only/nav → `execute`; mutating → `confirm`; the three cost-bearing → `confirm` even under `auto-high-confidence`.
- **Test:**
  - **`accounts-actions.decide.test.ts`:** feed every list+detail action's scalars to `decideAction`. Member/default: `applyFilter`/`smartSearch`/`setView`/`selectAll`/`sendToCallMode`/`openPersonaSearch` → `execute`; every mutating one → `confirm`; `bulkExtractContacts`/`startTamBuild` → `confirm` **even** under `approvalMode:"auto-high-confidence"` (re-assert the headline guardrail in one place). Viewer + any mutating → `refuse`; viewer + `applyFilter` → `execute`.
  - **off-page degradation (in `accounts-actions.list.test.tsx`):** unmount `/accounts`; assert the ids are gone from the manifest and `runRegisteredAction("accounts.bulkDelete", …)` returns `action_not_registered` (AC-14/E-5).

---

## Task 10 — No-duplication review + full regression [design §8, AC-13]

- **Do:** Grep both pages + the two child components for each reused fetch URL (`/api/score`, `/api/signals`, `/api/accounts/extract-contacts`, `/api/accounts/exclude`, `/api/accounts/restore`, `/api/accounts/batch`, `/api/accounts/${id}` PUT, `/api/accounts/${id}/generate-summary`, `/api/icp/apply`, `/api/research/dossier`, `/api/call-intel/review`, the `/api/search` smart-search, the `/call-mode` nav) — each must appear **once** (or in one shared extracted helper / lifted child callback), used by both the button/menu/setter and the `run`. Any second copy = fix before eval.
- **Verify:** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. CLE-03/04/05/06 tests untouched and green. By-hand smoke of the list page (column filters, smart search, tabs, views, select-all, the six bulk-bar actions, TAM build, persona modal) and the detail page (inline edit, owner, summary, dossier, call-intel) — byte-identical UX.
- **Test:** the dedup test asserts one copy per URL; a static grep note records the counts. The full vitest suite + `tsc` are the gate.

---

## Task 11 — Live loop (Phase 6 eval, Playwright-style) [requirements §6 step 16]

- **Do:** On the real `/accounts` with the dock open, drive the headline loops and capture before/after screenshots into `_research/raw/cle-07/`:
  1. "filter to health-care accounts that are A-grade" → observe the chips + filtered list.
  2. "select all matching" → observe the header checkbox tick + the count toast.
  3. "enrich them" → observe the CLE-05 confirm card with the **"Uses credits"** badge; approve; observe the enrich stream.
  4. "build a TAM from my primary ICP" → observe the confirm card (the gate is enforced) **before** any sourcing.
  5. On `/accounts/[id]`: "set its size to 200-500" → observe the inline value update; "generate the dossier" → observe the card generating (or the no-domain refusal).
- **Verify:** each loop drives the **real** handler (the filter chips apply, rows tick, the stream/card appears); the cost-bearing actions never run without a card. Screenshots saved.
- **Test:** the live check is the eval evidence; the unit/RTL suite remains the correctness gate.

---

## Done criteria (Phase 6 hard thresholds)

- AC-1..AC-14 all pass; every edge case E-1..E-12 has a passing test.
- The **required** named tests pass: `selectAll` honest cap (Task 4); `bulkEnrich` empty-selection guard (Task 5); the two cost tests — `bulkExtractContacts` and `startTamBuild` require confirm even under `auto-high-confidence` (Task 6); the no-duplication review (Task 10).
- `pnpm tsc --noEmit` 0 errors; `regression.sh` green; CLE-03/04/05/06 tests untouched.
- No handler logic duplicated (one copy per fetch URL / chunk size / nav); the pages' manual UX byte-identical (the extractions + lifted callbacks preserved it).
- Any miss = FAIL → delete branch → respec.
