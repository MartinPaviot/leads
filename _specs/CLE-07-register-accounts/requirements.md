# CLE-07 — Register the `/accounts` page actions (list + detail) — Requirements

> Second page to declare its actions, replicating the CLE-06 pilot pattern on the **richest list surface** in the app: 9 column filters, NL smart search, two view toggles, select-all-matching (resolves the full filtered id set), a six-action bulk bar, a streaming TAM build, the NL→ICP persona flow, and the per-account detail edits.
> Constitution: `_specs/chat-live-executor/README.md` (SSOT for every contract cited — §3.1 directive, §3.2 `PageAction`, §3.3 `useRegisterPageActions`/`getActionManifest`/`runRegisteredAction`, §3.4 the server tools, §3.5/§3.5bis envelope + `decideAction`, §3.6 two-tier routing, §2 human-bound non-scope).
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§3 parity table — `/accounts` (liste) row line 90: "filtres colonnes + smart search, toggles vue (excluded/archive), select-all-matching + barre de masse *visible*, TAM build streaming, PersonaSearch (NL→ICP→save)"; `/accounts/[id]` row line 91: "édition inline des champs, cartes intel approve/dismiss"; §4.1 `accounts.applyFilter` example, lines 117-123).
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-07-register-accounts` (phase 1, milestone M1, `depends_on: ["CLE-04-page-action-tools", "CLE-05-action-confirmation-ux"]`, completeness target 9).
> Mirrors the already-written **CLE-06** spec (`_specs/CLE-06-register-opportunities/`) for structure and rigor.
> Depends on (must be present on the branch base): **CLE-03** (`useRegisterPageActions`, `PageAction`, `PageActionResult`, the registry + executor + confirm gate), **CLE-04** (`listPageActions`/`invokePageAction`, `decideAction`, the prompt heuristic, the server-side JSON-Schema re-validation), **CLE-05** (the editable confirm card rendered when `requireConfirm:true`, the risk badges `riskBadgesFor`).

This feature writes **no** new framework code. It calls `useRegisterPageActions(...)` from the two accounts pages, mapping each declared `PageAction.run` to a handler that **already exists** on the page (filter/view setters, `selectAllMatching`, `runEnrich`, `bulkScoreSelected`, `detectSignals`, `extractContactsSelected`, `bulkSetExclusion`, `restoreAccounts`, `openCascadeDelete`/`performCascadeDelete`, the Call Mode navigation, `startTamBuild`, `PersonaSearch`, the detail inline edit / `reassignAccountOwner` / generate-summary). Where a handler reads component `useState` directly, a small **pure extraction** (same body, params instead of closure state) makes it callable from `run` without duplicating logic — exactly the CLE-06 §4 approach (AC-13).

---

## 1. User story

**As** the founder using the Elevay chat while on the Accounts page,
**I want** to ask the agent in plain language to filter the library, smart-search it, flip the excluded/archive view, select everything matching and run a bulk operation on it (enrich, score, detect signals, extract contacts, exclude/restore, delete, send to Call Mode), kick off a TAM build, open the persona flow, or — on a single account — enrich/score it, edit a field, refresh its summary, generate its dossier, reassign its owner, or approve/dismiss its captured call intel,
**so that** the action happens **on the list/record in front of me** — I see the filter chips apply, the rows tick, the bulk bar run, the build stream — instead of the agent silently writing to the database where I can't see it (audit §2 G1/G4; README doctrine §1.1 "parity by construction").

Concretely: "filter to health-care accounts in Suisse romande over A-grade" applies the column filters; "show me accounts I marked not a fit" flips to the Excluded view; "select everything matching and enrich it" ticks the full filtered set and runs the streaming enrich; "extract contacts for these" pops a confirm card (it spends to source people from Apollo) then runs the Apollo sourcing; "delete all of them" pops a confirm card (destructive) then soft-deletes; "build a TAM from my primary ICP" pops a confirm card (it spends to source) then streams new rows; "describe the accounts I want" opens the persona modal; on an account, "set its size to 200-500" commits the inline edit and "approve the call intel" applies the captured stack.

This is the **second page** (CLE-06 was the pilot). It must demonstrate the pattern carries to (a) a far larger non-mutating surface (9 column filters + smart search + 2 view toggles), (b) a **select-all → bulk** composition where the selection can hold up to the server's id cap (README §3.3 select-all semantics, the memory note "cap 50k"), and (c) **cost-bearing** actions (`bulkExtractContacts`, `startTamBuild`) that must always confirm because they spend credits and create many rows.

---

## 2. The action set (scope)

Each action has id `accounts.<verb>`, a `zod` `params` schema, a `run` mapped to an existing handler, and metadata. The metadata column drives `decideAction` (CLE-04 §2.1) → whether CLE-05 shows a confirm card.

### 2.1 List page — non-mutating (register on `/accounts`)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `accounts.applyFilter` | `{ sourceTab?: "all"\|"tam"\|"manual"; enrichmentPartition?: "all"\|"unenriched"\|"enriched"; industry?: string[]; geography?: string[]; size?: string[]; revenue?: string[]; stage?: string[]; score?: string[]; name?: string; domain?: string; linkedin?: "present"\|"absent"; search?: string; clear?: boolean }` | `setFilter`/`setEnrichmentFilter`/`setColumnFilters`/`setSearchQuery` (`page.tsx:158,162,166,198` + the `FILTER_COLUMNS`/`ENUM_PARAM`/`TEXT_PARAM` mapping `:1411-1421,521-525`) | false | false | true | free | **never** |
| `accounts.smartSearch` | `{ query: string }` | the `SmartSearchBar onFilters` path → `setSmartFilters`/`setSmartMeta` (`page.tsx:1796-1812,228-229`), via the same `/api/search/...` the bar calls | false | false | true | free | **never** |
| `accounts.setView` | `{ view: "active"\|"excluded"\|"archived" }` | the Excluded/Archive toggles (`page.tsx:1591-1600`: `setViewExcluded`/`setViewDeleted`/`setSelectedRows`) | false | false | true | free | **never** |
| `accounts.selectAll` | `{ matchingCurrentFilter: true }` | `selectAllMatching()` (`page.tsx:1081-1097`) → `selectAllMatchingIds` `?idsOnly=true` (`lib/infra/select-all-matching.ts:26`) | false | false | true | free | **never** |
| `accounts.openPersonaSearch` | `{}` | `setShowPersona(true)` (`page.tsx:206,1610,1693`) | false | false | true | free | **never** |

### 2.2 List page — bulk actions on the current selection / filter (register on `/accounts`)

> Each bulk action operates on **the current selection** (`selectedRows`), exactly as the bulk bar's button does today. `accounts.selectAll` is the way the agent first populates that selection ("select all and enrich" = `selectAll` then `bulkEnrich`); the model is taught to chain them (design §5).

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `accounts.bulkEnrich` | `{ criteria?: string[]; accountIds?: string[] }` | `runEnrich(criteria, ids)` (`page.tsx:278-294`) → `enrichStream.start` (chains 100-id batches) | true | false | true | **credits** | **risky** |
| `accounts.bulkScore` | `{ accountIds?: string[] }` | `bulkScoreSelected()` (`page.tsx:785-808`) → `chunkedBulkCall` `/api/score` | true | false | true | free | **risky** |
| `accounts.bulkDetectSignals` | `{ accountIds?: string[] }` | `detectSignals()` (`page.tsx:865-892`) → `chunkedBulkCall` `/api/signals` | true | false | true | free | **risky** |
| `accounts.bulkExtractContacts` | `{ accountIds?: string[] }` | `extractContactsSelected()` (`page.tsx:896-940`) → `POST /api/accounts/extract-contacts` (50-id fan-out) | true | false | true | **credits** | **always** |
| `accounts.bulkExclude` | `{ accountIds?: string[] }` | `bulkSetExclusion("exclude")` (`page.tsx:1027-1052`) → `chunkedBulkCall` `/api/accounts/exclude` | true | false | true (restore) | free | **risky** |
| `accounts.bulkRestore` | `{ accountIds?: string[] }` | `bulkSetExclusion("include")` **or** `restoreAccounts(ids)` per active view (`page.tsx:1027-1052,1101-1121`) | true | false | true | free | **risky** |
| `accounts.bulkDelete` | `{ accountIds?: string[]; cascade?: ("contacts"\|"deals"\|"activities"\|"notes"\|"tasks")[] }` | `openCascadeDelete`→`performCascadeDelete` (`page.tsx:1128-1158,1176-1205`) → `DELETE /api/accounts/batch { ids, cascade }` | true | false | true (soft-delete → restore) | free | **always** |
| `accounts.sendToCallMode` | `{ accountIds?: string[] }` | the Call Mode bulk-bar action (`page.tsx:1535-1542`: `window.location.href = "/call-mode?accounts=<ids>"`) | false | false | true | free | **never** |

### 2.3 List page — single-row + sourcing (register on `/accounts`)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `accounts.enrichAccount` | `{ accountId: string; criteria?: string[] }` | `runEnrich(criteria, [accountId])` (`page.tsx:278-294`) | true | false | true | **credits** | **risky** |
| `accounts.scoreAccount` | `{ accountId: string }` | the `/api/score` body of `bulkScoreSelected` scoped to one id (extraction §4, mirrors `:785-808`) | true | false | true | free | **risky** |
| `accounts.excludeAccount` | `{ accountId: string; restore?: boolean }` | `rowSetExclusion(id, action)` (`page.tsx:1054-1071`) | true | false | true | free | **risky** |
| `accounts.deleteAccount` | `{ accountId: string; cascade?: (…)[] }` | `openCascadeDelete([id], name)` → `performCascadeDelete` (`page.tsx:1128-1158,1176-1205`) | true | false | true (soft-delete) | free | **always** |
| `accounts.startTamBuild` | `{ icpId?: string; allProfiles?: boolean; targetCount?: number }` | `startTamBuild()` (`page.tsx:460-482`) → `tamStream.start(BuildRequest)` (`hooks/use-tam-stream.ts:305`, `BuildRequest` `lib/tam-stream/events.ts:249`) | true | false | true | **credits** | **always** |
| `accounts.personaSearch` *(optional, two-step)* | `{ describe: string; save?: boolean }` | opens `PersonaSearch` + (on `save`) its `save()` `POST /api/icp/apply` (`_persona-search.tsx:67,157-178`) | true (only when `save`) | false | true | free | **always** when `save`, else **never** |

### 2.4 Detail page — `/accounts/[id]`

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `accounts.updateField` | `{ accountId: string; field: "name"\|"domain"\|"industry"\|"size"\|"revenue"; value: string\|null }` | the inline-edit `PUT /api/accounts/${id}` (`[id]/page.tsx:368-382`), extracted to `saveField` (§4) | true | false | true | free | **risky** |
| `accounts.reassignOwner` | `{ accountId: string; ownerId: string\|null }` | `reassignAccountOwner(ownerId)` (`[id]/page.tsx:81-92`) | true | false | true | free | **risky** |
| `accounts.refreshSummary` | `{ accountId: string }` | the AI-summary refresh `POST /api/accounts/${id}/generate-summary` (`[id]/page.tsx:162-182`), extracted to `refreshSummary` (§4) | true | false | true | free | **risky** |
| `accounts.generateDossier` | `{ accountId: string }` | `generateDossier()` inside `CompanyDossier` (`components/company-dossier.tsx:124-145`, `POST /api/research/dossier`) — reached via a lifted callback (§4, design §2) | true | false | true | free | **risky** |
| `accounts.approveCallIntel` | `{ accountId: string }` | `act("approve")` inside `AccountCallIntel`/`usePendingReview` (`components/call-intel.tsx:73-93`, `POST /api/call-intel/review`) — reached via a lifted callback (§4, design §2) | true | false | true | free | **risky** |
| `accounts.dismissCallIntel` | `{ accountId: string }` | `act("dismiss")` inside the same hook (`call-intel.tsx:73-93`) | true | false | true | free | **risky** |

> **Surface scoping.** §2.1/§2.2/§2.3 register only on `/accounts`. §2.4 registers on `/accounts/[id]`. Each page registers exactly the actions whose handlers it owns; navigating away clears them (CLE-03 unmount cleanup) so `listPageActions` only ever shows what the current page can do (AC-1).

> **Cost / credits guardrail (the headline of this spec).** `accounts.bulkExtractContacts`, `accounts.startTamBuild`, and the `save` branch of `accounts.personaSearch` are `confirm:"always"` because they **spend** (Apollo sourcing credits / TAM sourcing) and create **many** rows — `decideAction` returns `confirm` for `cost:"credits"`/`"always"` regardless of approval mode (CLE-04 §2.1 steps 2/5). The per-account/per-batch enrich (`bulkEnrich`/`enrichAccount`) is `cost:"credits"` + `confirm:"risky"` (it costs but is scoped + reversible-by-irrelevance); the card's `riskBadgesFor` shows "Uses credits" (CLE-05 §5). **No action here spends real money** (`cost:"money"`) — sourcing is paid in pre-bought credits, surfaced as `cost:"credits"`; see the final report for the human-bound note.

> The non-mutating actions (`applyFilter`/`smartSearch`/`setView`/`selectAll`/`openPersonaSearch`/`sendToCallMode`) are `confirm:"never"` (pure client view-state or a navigation; no persistence, no spend). `bulkDelete`/`deleteAccount` and the two cost-bearing sourcing actions are `confirm:"always"`. The remaining mutating-but-reversible server actions are `confirm:"risky"` → `decideAction` returns `confirm` → CLE-05 renders an editable card before running.

---

## 3. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: "the registry" = CLE-03 `lib/chat/page-actions/registry.ts`. "the manifest" = `getActionManifest()`. "invoke X" = the model calls `invokePageAction("accounts.X", params)` (CLE-04), which emits the directive that CLE-03's executor dispatches (after CLE-05's confirm gate when `requireConfirm:true`). Each criterion is testable in isolation against the action's `run` (the framework round-trip is already covered by CLE-03/04/05 tests).

### AC-1 — The page's actions appear in the manifest only while it is mounted
- **GIVEN** the user is on `/accounts`,
- **WHEN** `getActionManifest()` is read,
- **THEN** it contains the list actions (§2.1/§2.2/§2.3) with correct `mutating`/`outbound`/`reversible`/`cost`/`confirm` scalars and a JSON Schema per `params`,
- **AND** the detail-only actions (`accounts.updateField`, `.reassignOwner`, `.refreshSummary`, `.generateDossier`, `.approveCallIntel`, `.dismissCallIntel`) are **absent**,
- **AND** after navigating to `/accounts/[id]`, the manifest contains the §2.4 actions and **not** the list-only ones (CLE-03 unmount cleanup, CLE-03 AC-6).

### AC-2 — `applyFilter` applies the visible filters; an empty result is reported, not an error
- **GIVEN** the user is on `/accounts`,
- **WHEN** `accounts.applyFilter({ industry: ["Hospital & Health Care"], score: ["A+","A"], sourceTab: "tam" })` runs,
- **THEN** the same setters the column-filter dropdowns + tab use are called (`setColumnFilters` with the `industry`/`score` keys, `setFilter("tam")`), the list re-fetches server-side (the existing debounced `debouncedColumnFilters` → `fetchAccounts` path), `confirm` is `never` so it runs without a card, and the result summarizes the applied filters, e.g. `{ ok:true, summary:"Filtered to Health Care, A+/A, sourced accounts." }`,
- **AND** `accounts.applyFilter({ clear: true })` resets via `setColumnFilters({})`/`setSmartFilters([])` (the existing "clear" path `:1780,1957-1961`) → `{ ok:true, summary:"Cleared all filters." }`,
- **AND** a filter that ultimately matches **0** rows is still `{ ok:true, summary:"…" }` (an empty result is a valid outcome — the board shows its existing empty state, E-3).

### AC-3 — `smartSearch` runs the NL→filter bar
- **GIVEN** the user is on `/accounts`,
- **WHEN** `accounts.smartSearch({ query: "SaaS in France, high fit" })` runs,
- **THEN** the same request the `SmartSearchBar` issues (`resourceType:"account"`, the query) is sent, the returned `FilterCondition[]` are applied via `setSmartFilters`/`setSmartMeta` (the bar's `onFilters` callback, `:1802-1810`), `confirm` is `never`, and the result reports the count of applied smart filters (or, when none matched, that it searched all fields), e.g. `{ ok:true, summary:"Applied 2 smart filters (industry≈SaaS, score≥70)." }` / `{ ok:true, summary:"Searched all fields; no structured filter applied." }`.

### AC-4 — `setView` flips the view without persistence
- **GIVEN** the user is on `/accounts` in the active view,
- **WHEN** `accounts.setView({ view: "excluded" })` runs,
- **THEN** the exact Excluded-toggle setters fire (`setSelectedRows(new Set()); setViewDeleted(false); setViewExcluded(true)`, `:1591-1594`), the list re-fetches with `excluded=true`, `confirm` is `never`, and the result is `{ ok:true, summary:"Showing accounts marked not a fit." }`,
- **AND** `{ view: "archived" }` enters the Archive (`setViewExcluded(false); setViewDeleted(true)`, `:1595-1600`) and `{ view: "active" }` returns to the working set (both flags false) → matching summaries.

### AC-5 — `selectAll` selects every matching row honestly (the cap)
- **GIVEN** the user is on `/accounts` with a filter active and more matching rows than are loaded,
- **WHEN** `accounts.selectAll({ matchingCurrentFilter: true })` runs,
- **THEN** `selectAllMatching()` is called — it ticks the visible rows immediately, then resolves the **full** matching id set via `?idsOnly=true` (`selectAllMatchingIds`, the same WHERE the list+count use) and replaces the selection,
- **AND** the result reports the resolved count and is **honest about a cap**: when the server truncated, `{ ok:true, summary:"Selected the first 50,000 of 73,210 matching accounts." }` (mirrors the page toast `:1094-1096`); when a residual non-score NL smart filter is active (which the server can't resolve), the selection honestly stays the visible rows and the summary says so (mirrors `:1084`),
- **AND** on `matchingCurrentFilter:false`/omitted the schema rejects it (the action is only ever "all matching"; a literal `true` like CLE-06's `autoProgress.apply`).

### AC-6 — `bulkEnrich` runs the streaming enrich over the current selection
- **GIVEN** the user is on `/accounts` with a non-empty selection (e.g. after `selectAll`),
- **WHEN** `accounts.bulkEnrich({ criteria: ["industry","description"] })` runs (after the CLE-05 confirm card — `cost:"credits"`, `confirm:"risky"`),
- **THEN** `runEnrich(criteria, Array.from(selectedRows))` is called (the same call the bulk bar's `EnrichMenu onEnrich` makes, `:1517-1523`), the enrich stream starts, and the result reports the number of accounts queued, e.g. `{ ok:true, summary:"Enriching 240 accounts…" }`,
- **AND** on an **empty selection** (and no `accountIds` passed) the result is `{ ok:false, summary:"No accounts selected — select some first (or say ‘select all matching’)." }`, no stream started (E-1 — the bulk-on-empty guard).

### AC-7 — `bulkScore` / `bulkDetectSignals` run their batch over the selection
- **GIVEN** a non-empty selection,
- **WHEN** `accounts.bulkScore()` runs (confirm card, `confirm:"risky"`),
- **THEN** the same `chunkedBulkCall` to `/api/score` that `bulkScoreSelected` issues is sent over the selected ids, the list refetches, and the result reports the count, e.g. `{ ok:true, summary:"Scored 240 accounts." }` (or "Scored X of N; M failed." on partial failure, mirroring `:798-802`),
- **AND** `accounts.bulkDetectSignals()` likewise runs the `/api/signals` batch (over the *enriched* subset, exactly as `detectSignals` filters `:866`) → count summary,
- **AND** both return `{ ok:false, summary:"No accounts selected…" }` on an empty selection (E-1).

### AC-8 — `bulkExtractContacts` always confirms, then sources from Apollo
- **GIVEN** a non-empty selection,
- **WHEN** `accounts.bulkExtractContacts()` runs,
- **THEN** because `cost:"credits"` + `confirm:"always"`, CLE-05 shows a confirm card whose badge reads "Uses credits" (CLE-05 §5) **regardless of approval mode**; on approve, the same `POST /api/accounts/extract-contacts` 50-id fan-out that `extractContactsSelected` issues is sent, and the result reports the contacts created across accounts, e.g. `{ ok:true, summary:"Added 47 contacts across 31 accounts." }` (mirrors `:926-933`),
- **AND** the `decideAction` cross-check test asserts this action's scalars → `confirm` even under an "auto-run" approval mode (the cost gate is mode-independent — AC-12 / the required cost test).

### AC-9 — `bulkExclude` / `bulkRestore` / `bulkDelete` over the selection
- **GIVEN** a non-empty selection in the active view,
- **WHEN** `accounts.bulkExclude()` runs (confirm card, `confirm:"risky"`),
- **THEN** `bulkSetExclusion("exclude")` is called (the same `chunkedBulkCall` to `/api/accounts/exclude`, 500-id chunks), the rows refetch, and the result is `{ ok:true, summary:"Marked 240 accounts as not a fit." }` (mirrors `:1044-1049`),
- **AND** `accounts.bulkRestore()` calls `bulkSetExclusion("include")` in the Excluded view, or `restoreAccounts(ids)` in the Archive view (the action reads the active view, exactly as the bulk bar's Restore button does `:1543-1556`) → restore summary,
- **AND** `accounts.bulkDelete({ cascade: ["contacts"] })` is `confirm:"always"`: on approve, `openCascadeDelete(ids,label)` then `performCascadeDelete(["contacts"])` issues the same `DELETE /api/accounts/batch { ids, cascade }`, and the result is `{ ok:true, summary:"Moved 240 accounts + 540 related records to Archive." }` (mirrors `:1192-1195`); default `cascade` is `[]` (delete the accounts only).

### AC-10 — `sendToCallMode` navigates with the selection
- **GIVEN** a non-empty selection,
- **WHEN** `accounts.sendToCallMode()` runs,
- **THEN** the same navigation the bulk-bar Call Mode action performs is fired — `/call-mode?accounts=<comma-joined selected ids>` (`:1537-1541`) — and the result is `{ ok:true, summary:"Opening Call Mode with 240 accounts." }`,
- **AND** the navigation goes through the directive layer's safe internal navigation (or the page's existing `window.location.href`) — it never leaves the origin (CLE-03 `isSafeInternalPath` posture); empty selection → `{ ok:false, summary:"No accounts selected." }`.

### AC-11 — `startTamBuild` always confirms, then streams new accounts
- **GIVEN** the user is on `/accounts`,
- **WHEN** `accounts.startTamBuild({ allProfiles: true })` runs,
- **THEN** because `cost:"credits"` + `confirm:"always"`, CLE-05 shows a confirm card ("Uses credits") **regardless of mode**; on approve, `startTamBuild()` is invoked with the resolved `BuildRequest` (the same one the "Find more accounts" button builds — `icpId`/`icpIds`/`apolloOverrides`/`targetCount`, `:460-482`, `BuildRequest` `events.ts:249`), the stream begins, and the result is `{ ok:true, summary:"Sourcing new accounts from your ICP — rows stream in live." }`,
- **AND** `{ icpId: "<id>" }` sources from that one profile, `{ allProfiles: true }` from every usable profile, neither → the legacy tenant-wide planner (mirrors the page's `sourceIcpId` branching `:471-481`); an unknown `icpId` → `{ ok:false, error:"No such ICP profile." }`, no build started (E-6).

### AC-12 — Cost-bearing actions require confirmation even under an auto-run mode (the required cost test)
- **GIVEN** the tenant's approval mode is the most permissive ("auto-run high-confidence"),
- **WHEN** the scalars of `accounts.bulkExtractContacts` (`cost:"credits"`, `confirm:"always"`) and `accounts.startTamBuild` (same) are fed to `decideAction({ action, approvalMode:"auto-high-confidence", role:"member" })`,
- **THEN** both return `disposition:"confirm"` (so `requireConfirm:true`, so CLE-05 cards them) — spend is **never** silently executed,
- **AND** the same check for `accounts.applyFilter`/`setView`/`selectAll` returns `disposition:"execute"` (read-only/view-state runs immediately). This is the spend-guardrail regression that must pass.

### AC-13 — No handler logic is duplicated
- **GIVEN** the implementation,
- **WHEN** the code is reviewed,
- **THEN** every `run` body calls an **existing** page function / state setter / extracted helper (`setColumnFilters`/`setFilter`/`setEnrichmentFilter`/`setSearchQuery`, the SmartSearchBar request path, `setViewExcluded`/`setViewDeleted`, `selectAllMatching`, `runEnrich`, `bulkScoreSelected`→`scoreByIds`, `detectSignals`, `extractContactsSelected`→`extractContactsByIds`, `bulkSetExclusion`, `restoreAccounts`, `openCascadeDelete`/`performCascadeDelete`, the Call Mode nav, `startTamBuild`, `PersonaSearch.save`, the detail `saveField`/`reassignAccountOwner`/`refreshSummary`, the lifted `generateDossier`/call-intel `act`) — no second copy of a fetch URL, body shape, chunk size, optimistic update, or rollback exists for the agent path,
- **AND** any minimal refactor needed to make a handler callable with explicit args (rather than reading component `useState`) is a **pure extraction** verified to leave the button/menu/setter behaviour byte-identical (design §4).

### AC-14 — An action invoked while NOT on the accounts page degrades gracefully
- **GIVEN** the user is **not** on `/accounts` (e.g. on `/opportunities`), so the accounts actions are unregistered,
- **WHEN** the model nonetheless emits `invokePageAction("accounts.bulkDelete", ...)`,
- **THEN** CLE-04's tool refuses with `{ error, availableActionIds }` (the id is not in the current manifest) **or**, if a stale directive reaches the client, CLE-03's `runRegisteredAction` returns `{ ok:false, error:"action_not_registered" }` — never a crash, never a delete on a list that isn't there,
- **AND** the model is taught (CLE-04 prompt) to fall back to the **headless** account/contact tools (`updateAccount`/`enrichContact`/`buildTAM`/etc.) when page actions are unavailable, and to use headless tools for **cross-page / whole-library** ops that exceed the loaded list (out of scope, §5).

---

## 4. Edge cases (each needs a test)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **Bulk action on an empty selection** (`bulkEnrich`/`bulkScore`/`bulkDetectSignals`/`bulkExtractContacts`/`bulkExclude`/`bulkRestore`/`bulkDelete`/`sendToCallMode` with no selection and no `accountIds`) | `{ ok:false, summary:"No accounts selected — select some first (or say ‘select all matching’)." }`; the underlying handler (which itself early-returns on `ids.length===0`, e.g. `:790,898,1029`) is **not** entered with an empty list, no request fired. The model is taught to call `accounts.selectAll` first. |
| E-2 | **`selectAll` server cap hit** | The full set is requested via `?idsOnly=true`; when the server returns fewer ids than `total` (`truncated`), the summary states the cap honestly ("Selected the first N of M…", mirrors `:1094`). The selection is the capped set; subsequent bulk acts on exactly those ids. |
| E-3 | **Filter / smartSearch yields 0 rows** | `applyFilter`/`smartSearch` still apply (AC-2/AC-3) and report `ok:true` with the applied filters; the list shows its existing empty state (`:1946-1963`). Never an error. |
| E-4 | **Cost-bearing action under any approval mode** | `bulkExtractContacts`/`startTamBuild`/`personaSearch(save)` always reach a confirm card (AC-12). There is no mode that lets them run silently. The badge reads "Uses credits". |
| E-5 | **Action invoked while NOT on the page** | Graceful refusal (AC-14). No throw, no effect. |
| E-6 | **`startTamBuild` with an unknown `icpId`** | Validated against the loaded `sourceProfiles` (`:441-457`); unknown id → `{ ok:false, error:"No such ICP profile." }`, no build. `allProfiles:true` with zero usable profiles → falls back to the legacy planner with a note, or `{ ok:false }` if the page itself would no-op — mirror the page's behaviour exactly. |
| E-7 | **`bulkRestore` view-dependence** | In the Excluded view it un-excludes (`bulkSetExclusion("include")`); in the Archive view it un-deletes (`restoreAccounts`). The action reads the live view flags (`viewExcluded`/`viewDeleted` via refs) so it mirrors the bulk bar's contextual Restore (`:1543-1556`). Outside either special view, `bulkRestore` is a no-op `{ ok:true, summary:"Nothing to restore in this view." }`. |
| E-8 | **`bulkDelete`/`deleteAccount` cascade keys** | `cascade` defaults to `[]` (delete the account(s) only). When supplied, only the allowed keys `contacts`/`deals`/`activities`/`notes`/`tasks` pass (schema `z.enum`); the same `DELETE /api/accounts/batch { ids, cascade }` body as `performCascadeDelete` is sent. |
| E-9 | **`updateField` on the wrong page / unknown field** | The detail action compares `accountId` to the open `params.id` (E-1 of CLE-06's `autoProgress` pattern); a mismatch → `{ ok:false, error:"That account is not the one open here." }`. `field` is a `z.enum` of the five editable fields — anything else is rejected at the schema boundary. |
| E-10 | **`approveCallIntel`/`dismissCallIntel`/`generateDossier` when the child has nothing to act on** | When `AccountCallIntel` has no pending intel (`usePendingReview` data null) or `CompanyDossier` has no domain (`accountDomain` null, `:94-97,124-125`), the action returns `{ ok:false, summary:"There is no pending call intel to approve." }` / `"This account has no domain, so a dossier can't be generated."` — never a silent no-op, never a throw. (These reuse the child's own guard — design §2 on the lifted callback.) |
| E-11 | **`bulkEnrich`/`enrichAccount` already-complete accounts** | `runEnrich` itself toasts "No accounts need enrichment" and returns when nothing qualifies (`:284-287`); the action surfaces that as `{ ok:true, summary:"Nothing to enrich — selected accounts already have those fields." }` (ok, not error — parity with the existing toast). |
| E-12 | **Optimistic state + page unmount mid-run** | The list page owns its state/streams; if the user navigates away mid-`run`, the in-flight fetch/stream settles (CLE-03 E-3 — the dock owns the promise) and the result still round-trips; an unmounted setter is a no-op React warning at worst, not a crash. The actions are `reversible`, so re-sync on next mount is clean. |

---

## 5. Out of scope

- **The PAR framework itself** (directive, registry, hook, executor, confirm card, server tools, `decideAction`, prompt) → CLE-03/04/05/10. CLE-07 only *calls* `useRegisterPageActions` and maps `run`s.
- **Audit-log / undo** for these mutating actions (`tool_call_events`, undo window) → CLE-11. CLE-07 declares `reversible` honestly; the undo *mechanism* is CLE-11. (`bulkExtractContacts`/`startTamBuild` create rows that are individually deletable but have no one-click "un-source" — declared `reversible:true` in the soft sense the page already supports via exclude/delete; the precise undo is CLE-11.)
- **Permission matrix** beyond what `decideAction` enforces (viewer cannot mutate; viewer **can** drive `applyFilter`/`smartSearch`/`setView`/`selectAll`/`sendToCallMode`) → CLE-12.
- **Post-action highlight** of the applied filter / ticked rows / streamed build ("narrate+actuate") → CLE-15. CLE-07's effect is visible because it drives the real handlers; the deliberate *highlight* is CLE-15.
- **Cross-page / whole-library headless stays headless** (README §3.6). "Enrich every account in France" / "score the entire library" / "delete every off-ICP account across the whole tenant" are **mass / cross-view** ops that exceed the *currently loaded + selected* list these page actions act on. The model routes those to **headless** tools (`buildTAM`, the bulk enrich/score tools, `updateAccount`) — CLE-07 adds nothing for them, and the CLE-04 prompt heuristic already teaches the split. The on-page `selectAll` (which resolves up to the server id cap) is the bridge for "everything matching *this filter*"; genuinely tenant-wide library ops that bypass the filter are headless.
- **Tenant-wide "Score all accounts"** (`rescoreAllAccounts`, `:814-863`, `POST /api/icps/recompute`) is **deliberately not** a page action: it recomputes *every* account against *every* ICP profile (a tenant-wide background job, not an op on the loaded/selected list) — it is the headless `recompute`/scoring tool's job (README §3.6). Listed here so the boundary is explicit.
- **Human-bound / device-bound** flows per README §2: there is **no** live media, file picker, or security action on `/accounts`, so unlike `/call-mode` (CLE-09) there are no *excluded* page actions here. The one thing to keep human is **spend confirmation** — handled by `confirm:"always"` on the cost-bearing actions (it is not excluded, it is gated). See the final report.
- **Per-account MEDDPICC/contact-call-profile approve** (the detail page renders `MeddpiccScorecard`/`ContactCallProfile` only when a deal/contact carries them — they are not account-level) → out of scope; `accounts.approveCallIntel`/`dismissCallIntel` cover only the **account-level** `AccountCallIntel` card (`[id]/page.tsx:268`).

---

## 6. Evaluation steps (Phase 6, hostile QA — read literally)

Unit/RTL tests prove each `run → effect` without a live server (mock `fetch`/streams, spy the existing handler/setter). One Playwright-style live check proves the headline loops on the real list.

1. **Manifest membership (unit/RTL).** Mount `/accounts`; assert the manifest lists exactly the list action ids (§2.1/§2.2/§2.3) with the metadata table §2 (assert `bulkDelete.confirm==="always"`, `bulkExtractContacts.confirm==="always"` + `cost==="credits"`, `startTamBuild.confirm==="always"` + `cost==="credits"`, `applyFilter.confirm==="never"`, `bulkEnrich.confirm==="risky"` + `cost==="credits"`, `selectAll.confirm==="never"`). Mount `/accounts/[id]`; assert the §2.4 ids present and the list-only ids absent. (AC-1.)
2. **`applyFilter` incl. clear + 0-result (unit).** Run `{industry:["…"],score:["A+"],sourceTab:"tam"}`; assert `setColumnFilters`/`setFilter` got the equivalent state and the summary names the filters. Run `{clear:true}` → `setColumnFilters({})`/`setSmartFilters([])`. Construct a filter that matches nothing → `ok:true` "…". (AC-2 / E-3.)
3. **`smartSearch` (unit).** Spy the search request; run `{query:"SaaS in France, high fit"}`; assert `resourceType:"account"` + the query sent, `setSmartFilters` received the parsed conditions, summary names the count; no-match → `ok:true` "searched all fields". (AC-3 / E-3.)
4. **`setView` (unit).** `{view:"excluded"}` → the excluded setters; `{view:"archived"}` → archive setters; `{view:"active"}` → both flags false. (AC-4.)
5. **`selectAll` incl. the cap — required named test (unit).** Spy `selectAllMatchingIds`; run `{matchingCurrentFilter:true}` on a board with `accounts.length < totalAccounts`; assert `?idsOnly=true` requested, the selection replaced with the resolved set, and the summary reports the count. Force `truncated:true` (server cap) → summary states "first N of M". Add a non-score NL smart filter → assert the selection honestly stays the visible rows + a summary saying so. `{matchingCurrentFilter:false}` → schema reject. (AC-5 / E-2.)
6. **`bulkEnrich` + empty-selection guard — required named test (unit).** With a non-empty selection, run `{criteria:["industry"]}` → assert `runEnrich` called with the selected ids; result names the count. With an **empty** selection → `ok:false` "No accounts selected…", `runEnrich` **not** entered with ids. Already-complete → `ok:true` "Nothing to enrich". (AC-6 / E-1 / E-11.)
7. **`bulkScore` / `bulkDetectSignals` (unit).** Spy `chunkedBulkCall`; non-empty selection → `/api/score` resp. `/api/signals` over the selected ids; count summary; partial-failure summary. Empty selection → `ok:false`. (AC-7 / E-1.)
8. **`bulkExtractContacts` requires confirm + sources — required cost test (unit).** Feed its scalars to `decideAction` under `approvalMode:"auto-high-confidence"` → `confirm` (so `requireConfirm:true`). Then run it (post-confirm) over a selection → assert the 50-id `POST /api/accounts/extract-contacts` fan-out + the created-contacts summary. Empty selection → `ok:false`. (AC-8 / AC-12 / E-1 / E-4.)
9. **`bulkExclude`/`bulkRestore`/`bulkDelete` (unit).** `bulkExclude` → `/api/accounts/exclude` (exclude) over selection. `bulkRestore` view-dependence: Excluded view → include; Archive view → `restoreAccounts`; neither → no-op `ok:true`. `bulkDelete` → `confirm:"always"`; on approve, `DELETE /api/accounts/batch {ids,cascade}`; default cascade `[]`; bad cascade key rejected. (AC-9 / E-7 / E-8.)
10. **`sendToCallMode` (unit).** Non-empty selection → asserts the `/call-mode?accounts=<ids>` navigation; empty → `ok:false`. (AC-10.)
11. **`startTamBuild` requires confirm + builds — required cost test (unit).** `decideAction` under `auto-high-confidence` → `confirm`. Then run `{allProfiles:true}` → `startTamBuild` invoked with the all-profiles `BuildRequest`; `{icpId:"x"}` → single-profile request; unknown id → `ok:false`. (AC-11 / AC-12 / E-6 / E-4.)
12. **Detail actions (unit, detail page).** `updateField({accountId,field:"size",value:"200-500"})` → one `PUT /api/accounts/:id {size:"200-500"}` (the extracted `saveField`), local state updated, `ok:true`; wrong `accountId` → `ok:false`; bad `field` → schema reject (AC + E-9). `reassignOwner` → `PUT {ownerId}` (AC). `refreshSummary` → `POST …/generate-summary` (AC). `generateDossier` → the lifted `CompanyDossier.generateDossier` (`POST /api/research/dossier`); no domain → `ok:false` (E-10). `approveCallIntel`/`dismissCallIntel` → the lifted `act("approve"|"dismiss")` (`POST /api/call-intel/review`); no pending intel → `ok:false` (E-10).
13. **`decideAction` cross-check (unit).** Feed every action's scalars to `decideAction` (member, default mode): `applyFilter`/`smartSearch`/`setView`/`selectAll`/`sendToCallMode`/`openPersonaSearch` → `execute`; every mutating one → `confirm`; the three cost-bearing → `confirm` **even** under `auto-high-confidence` (AC-12). Viewer + any mutating → `refuse`; viewer + `applyFilter` → `execute`. (security §7.)
14. **No-duplication review (manual + grep).** Grep both pages for each reused fetch URL (`/api/score`, `/api/signals`, `/api/accounts/extract-contacts`, `/api/accounts/exclude`, `/api/accounts/restore`, `/api/accounts/batch`, `/api/accounts/${id}`, `/api/accounts/${id}/generate-summary`, `/api/icp/apply`, `/api/research/dossier`, `/api/call-intel/review`) — each must appear **once** (or in one shared extracted helper / the lifted child callback), used by both the button/menu/setter and the `run`. Any second copy = FAIL. (AC-13.)
15. **Off-page degradation (unit/RTL).** Unmount `/accounts`; assert the ids are gone from the manifest and `runRegisteredAction("accounts.bulkDelete",…)` returns `action_not_registered`. (AC-14 / E-5.)
16. **Live loop (Playwright-style).** On the real `/accounts` with the dock open: type "filter to health-care accounts that are A-grade" → observe the chips + filtered list; "select all matching" → observe the header checkbox tick + the count toast; "enrich them" → observe the CLE-05 confirm card with the "Uses credits" badge, approve, observe the enrich stream; "build a TAM from my primary ICP" → observe the confirm card (gate enforced) before any sourcing. Capture before/after screenshots (CLAUDE.md screenshot rule) into `_research/raw/cle-07/`.
17. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. CLE-03/04/05/06 tests untouched and green. The accounts pages' existing behaviour (column filters, smart search, tabs, views, select-all, the six bulk-bar actions, TAM build, persona modal, detail inline edit / owner / summary / dossier / call-intel) is byte-identical when used by hand (the extractions + lifted callbacks preserved it).

**Hard thresholds:** AC-1..AC-14 all pass; every edge case E-1..E-12 has a passing test; the **required** named tests pass (`selectAll` honest cap; `bulkEnrich` empty-selection guard; the two cost tests — `bulkExtractContacts` and `startTamBuild` require confirm even under auto-run; the no-duplication review); `tsc` 0 errors; no handler logic duplicated; the pages' manual UX unchanged. Any miss = FAIL → delete branch → respec.
