# CLE-08 — Register the `/contacts` page actions (list + detail) — Requirements

> Third page to declare its actions in the Page Action Registry (PAR), after the `/opportunities` pilot (CLE-06) and `/accounts` (CLE-07). It replicates the proven CLE-06 pattern on the contacts list and contact detail pages, adding the initiative's **first human-bound boundary**: the CSV / Smart Import flow opens a native browser file picker, so the agent may **open** the import flow but **not** choose the file (README §2 — "Dialogues fichiers natifs navigateur … l'agent peut ouvrir le flow, pas choisir le fichier").
> Constitution: `_specs/chat-live-executor/README.md` (SSOT for every contract cited — §3.1 directive, §3.2 `PageAction`, §3.3 `useRegisterPageActions`, §3.6 routing, **§2 human-bound non-scope** — the file-picker exclusion lives here).
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` (§3 parity table — `/contacts` (liste) row line 92: "create/update, enrich, find-mobile, score, merge, delete/restore | CSV/Smart Import (file picker), filtres + smart search, select-all + masse | **upload fichier (dialogue navigateur)**"; `/contacts/[id]` row line 93: "update, owner, draft+send email | call (→ call-mode), suggest-reply→composer, intel approve").
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-08-register-contacts` (phase 1, milestone M1, `depends_on: ["CLE-04-page-action-tools", "CLE-05-action-confirmation-ux"]`, completeness target 9; summary names: applyFilter (8 columns), smartSearch, openImport/openSmartImport, selectAllMatching + bulk (enrich/findMobile/merge/delete/restore), scoreAll, createContact, inline edit (title/email/phone), call, sendEmail).
> Depends on (must be present on the branch base): **CLE-03** (`useRegisterPageActions`, `PageAction`, `PageActionResult`, the registry, the executor + confirm gate), **CLE-04** (`listPageActions`/`invokePageAction`, `decideAction`, the prompt heuristic), **CLE-05** (the confirm card that renders when `requireConfirm:true`).

This feature writes **no** new framework code. It calls `useRegisterPageActions(...)` from the two contacts pages, mapping each declared `PageAction.run` to a handler **that already exists** on the page (filter/search setters, `selectAllMatching`, `bulkEnrichSelected`, `bulkFindMobile`, `bulkMergeSelected`, `openCascadeDelete`/`performCascadeDelete`, `restoreContacts`, `scoreAllContacts`, `handleCreateContact`, `setShowSmartImport`/`fileRef.current?.click()`, `updateField`, `reassignContactOwner`, `startCall`, `setEmailComposer`). Zero handler logic is duplicated — the `run` closure invokes the same function the button/setter/checkbox invokes.

The one structural novelty versus CLE-06 is the **import file-picker boundary** (§5, AC-10): `openImport`/`openSmartImport` are declared as non-mutating **"navigate/open"** actions whose `run` only opens the import surface (sets `showSmartImport`, or programmatically `click()`s the hidden `<input type="file">`); the agent **cannot** select a file or trigger the upload — `handleImport` (`page.tsx:280-296`) and `handleFileUpload`/`handlePreview` (`smart-import.tsx:67-90`) only ever run after the human picks a file in the OS dialog. The action's `summary` tells the user the picker is open for them to choose a file.

---

## 1. User story

**As** the founder using the Elevay chat while on the Contacts page,
**I want** to ask the agent in plain language to filter / search my contacts, select all matching and run a bulk operation (enrich, find mobile, merge, delete, restore), score every contact against my ICP, create a contact, open the import flow, or — on a contact's detail page — edit a field inline, reassign the owner, start a call, draft an email, suggest a reply, or approve/dismiss a call-intel proposal,
**so that** the action happens **on the page in front of me** — I see the filter apply, the rows select, the bulk bar fire, the field save — instead of the agent silently writing to the database where I can't see it (audit §2 G1/G4; README doctrine §1.1 "parity by construction").

Concretely: "show me CTOs at fintech companies" applies the visible filters (or runs smart search); "select all of them and enrich" selects every matching contact then fires the same Enrich the bulk bar fires; "find mobiles for the selection" runs the FullEnrich deep pass (uses credits → a card first); "merge these two" sends me to the merge picker; "delete the stale ones" pops a confirm card before soft-deleting; "score every contact" runs the tenant-wide ICP fit; "create a contact Jane Doe, CTO at Acme" opens/commits the create flow; "import my CSV" opens the import picker and tells me to pick the file (I, the human, choose it). On `/contacts/[id]`: "set her title to VP Sales" saves inline; "assign this to me" reassigns; "call her" starts the call and lands me on the softphone; "draft a follow-up" opens the composer.

This is the **third** PAR page: it must demonstrate the same `mutating`/`outbound`/`reversible`/`cost`/`confirm` discipline as CLE-06 **plus** the first **human-bound** boundary (file upload), reusing existing handlers. It proves that a credit-spending bulk op (`bulkFindMobile`), a navigates-elsewhere op (`bulkMerge`, `call`), a tenant-wide mutation (`scoreAll`), and an open-a-native-dialog op (`openImport`) all fit the registry with honest metadata.

---

## 2. The action set (scope)

Each action has id `contacts.<verb>`, a `zod` `params` schema, a `run` mapped to an existing handler, and metadata. The metadata column drives `decideAction` (CLE-04 §2.1) → whether CLE-05 shows a confirm card. `run`/`title`/`description` map to design §3.

### 2.1 List page — `/contacts` (registers these)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `contacts.applyFilter` | `{ contact?; companyName?: string[]; industry?: string[]; email?; title?: string[]; linkedin?: "present"\|"absent"; phone?: "present"\|"absent"; score?: ("A+"\|"A"\|"B"\|"C"\|"D"\|"F")[] }` (the 8 columns) | `setColumnFilters` (`page.tsx:114,931-938`); column config `FILTER_COLUMNS` (`:612-625`) | false | false | true | free | **never** |
| `contacts.smartSearch` | `{ query: string }` | `setSearchQuery` (`page.tsx:80,793`) → debounced server search (`:256-261`) | false | false | true | free | **never** |
| `contacts.selectAll` | `{ matchingCurrentFilter?: boolean }` | `selectAllMatching` (`page.tsx:591-607`) | false | false | true | free | **never** |
| `contacts.bulkEnrich` | `{}` (acts on the current selection) | `bulkEnrichSelected` (`page.tsx:475-510`) → `/api/enrich-contacts` chunked 20 | true | false | true | **credits** | **risky** |
| `contacts.bulkFindMobile` | `{}` (current selection) | `bulkFindMobile` (`page.tsx:553-582`) → `/api/contacts/fullenrich-enrich` (FullEnrich) | true | false | true | **credits** | **risky** |
| `contacts.bulkMerge` | `{}` (current selection, ≥2) | `bulkMergeSelected` (`page.tsx:512-519`) → `router.push("/contacts/merge?ids=…")` | false | false | true | free | **risky** |
| `contacts.bulkDelete` | `{ cascade?: ("activities"\|"notes"\|"tasks")[] }` (current selection) | `openBulkCascadeDelete` (`:407-416`) → `performCascadeDelete` (`:424-470`) | true | false | true (soft-delete → restore) | free | **always** |
| `contacts.bulkRestore` | `{}` (current selection, archive view) | `restoreContacts` (`page.tsx:353-370`) → `/api/contacts/restore` | true | false | true | free | **risky** |
| `contacts.scoreAll` | `{}` | `scoreAllContacts` (`page.tsx:526-548`) → `/api/score-contacts { all: true }` | true | false | true | free | **risky** |
| `contacts.createContact` | `{ firstName?; lastName?; email?; title?; companyId? }` | `handleCreateContact` (`page.tsx:325-348`) → `POST /api/contacts` | true | false | true | free | **risky** |
| `contacts.openImport` | `{}` | the CSV `<input type="file">` trigger — `fileRef.current?.click()` (`page.tsx:730-733`) | **false** (navigate/open) | false | true | free | **never** |
| `contacts.openSmartImport` | `{}` | `setShowSmartImport(true)` (`page.tsx:103,726`) → `<SmartImport>` modal | **false** (navigate/open) | false | true | free | **never** |

> `applyFilter` carries the **8 column filters** the page exposes (`FILTER_COLUMNS`, `page.tsx:612-625`): contact (text), companyName (enum), industry (enum), email (text), title (enum), linkedin (presence), phone (presence), score (enum/grade). It maps them to `ColumnFilterState` and calls `setColumnFilters` — the same state the `<ColumnFilter>` dropdowns write (`:931-938`), which runs **server-side** (debounced, `:265-270` → `serializeContactFilters` → `/api/contacts`), spanning all contacts.

### 2.2 Detail page — `/contacts/[id]` (registers these)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `contacts.updateField` | `{ id: string; field: "title"\|"email"\|"phone"; value: string }` | `updateField(field, value)` (`[id]/page.tsx:84-115`) → `PUT /api/contacts/:id` | true | false | true | free | **risky** |
| `contacts.reassignOwner` | `{ id: string; ownerId: string \| null }` | `reassignContactOwner(ownerId)` (`[id]/page.tsx:215-226`) → `PUT /api/contacts/:id { ownerId }` | true | false | true | free | **risky** |
| `contacts.call` | `{ id: string }` | `startCall()` (`[id]/page.tsx:120-145`) → `POST /api/calls/start` then `router.push("/call-mode")` | true (mutating **start**) | **true** (places an outbound call) | false | free | **always** |
| `contacts.sendEmail` | `{ id: string; draft?: { subject?; body?; to? } }` | `setEmailComposer(draft)` (`[id]/page.tsx:74,283-294`) — opens the composer (reuses the `composeEmail` pattern) | **false** (opens composer; does not send) | false | true | free | **never** |
| `contacts.suggestReply` | `{ id: string; activityId: string }` | the "Suggest reply" handler `setEmailComposer({...})` (`[id]/page.tsx:340-351`) — opens the composer pre-filled from the inbound activity | **false** (opens composer) | false | true | free | **never** |
| `contacts.approveCallIntel` | `{ id: string }` | the call-intel review path `POST /api/call-intel/review { entityType:"contact", entityId, action:"approve" }` (the same endpoint `usePendingReview.act` calls, `call-intel.tsx:73-93`) | true | false | true | free | **risky** |
| `contacts.dismissCallIntel` | `{ id: string }` | the same review path with `action:"dismiss"` (`call-intel.tsx:73-93`) | true | false | true | free | **risky** |

> **Surface scoping.** The list-page actions register only on `/contacts`. The detail actions register on `/contacts/[id]`. Each page registers exactly the actions whose handlers it owns; when the user navigates away the registry clears them (CLE-03 unmount cleanup) so `listPageActions` only ever shows what the current page can do (AC-1, mirrors CLE-06 AC-1).

> **Confirm policy rationale.**
> - `applyFilter`/`smartSearch`/`selectAll`/`openImport`/`openSmartImport`/`sendEmail`/`suggestReply` are `confirm:"never"` — pure client view/selection state, opening a panel, or opening a native dialog (no persistence, no send, no spend).
> - `bulkDelete` is `confirm:"always"` (destructive even though soft-delete makes it `reversible` — same as CLE-06 `opportunities.delete`).
> - `call` is `confirm:"always"` — it is `outbound:true` and **irreversible** (a placed call cannot be unplaced); `decideAction` already forces `confirm` for outbound, and `always` makes that explicit and mode-independent.
> - `bulkEnrich`/`bulkFindMobile` are `cost:"credits"` + `confirm:"risky"` so the user sees a "Uses credits" badge (CLE-05 §5) and an editable card before spend.
> - `bulkMerge` is `confirm:"risky"` (it navigates to a destructive-downstream flow; the merge itself is committed on the merge page by a human, so the page action only routes there — but it is risky enough to warrant a card).
> - `scoreAll`/`createContact`/`bulkRestore`/`updateField`/`reassignOwner`/`approveCallIntel`/`dismissCallIntel` are mutating + reversible → `confirm:"risky"` so `decideAction` returns `confirm` → CLE-05 renders an editable card before running.

---

## 3. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: "the registry" = CLE-03 `lib/chat/page-actions/registry.ts`. "the manifest" = `getActionManifest()`. "invoke X" = the model calls `invokePageAction("contacts.X", params)` (CLE-04), which emits the directive that CLE-03's executor dispatches (after CLE-05's confirm gate when `requireConfirm:true`). Each criterion is testable in isolation against the action's `run` (the framework round-trip is already covered by CLE-03/04/05 tests).

### AC-1 — The page's actions appear in the manifest only while it is mounted
- **GIVEN** the user is on `/contacts`,
- **WHEN** `getActionManifest()` is read,
- **THEN** it contains the list-page actions (`contacts.applyFilter`, `.smartSearch`, `.selectAll`, `.bulkEnrich`, `.bulkFindMobile`, `.bulkMerge`, `.bulkDelete`, `.bulkRestore`, `.scoreAll`, `.createContact`, `.openImport`, `.openSmartImport`) with correct `mutating`/`outbound`/`reversible`/`cost`/`confirm` scalars and a JSON Schema per `params`,
- **AND** the detail-only actions (`contacts.updateField`, `.reassignOwner`, `.call`, `.sendEmail`, `.suggestReply`, `.approveCallIntel`, `.dismissCallIntel`) are **absent**,
- **AND** after navigating to `/contacts/[id]`, the manifest contains the detail actions and **not** the list-only actions (CLE-03 unmount cleanup, AC-6 of CLE-03).

### AC-2 — `applyFilter` applies the visible column filters; an empty result is reported, not an error
- **GIVEN** the user is on `/contacts`,
- **WHEN** `contacts.applyFilter({ title: ["CTO"], industry: ["Financial Services"] })` runs,
- **THEN** the column-filter state is set via the same `setColumnFilters` the `<ColumnFilter>` dropdowns use (the list re-fetches server-side via the debounced effect `:265-270` → `/api/contacts`), `confirm` is `never` so it runs without a card, and the result summarizes the applied filters, e.g. `{ ok: true, summary: "Filtered contacts by title (CTO), industry (Financial Services)." }`,
- **AND** an empty/zero-match outcome is a valid result (`{ ok: true, summary: "Applied the filters — no contacts match." }` once the count is known, or a filter-applied summary that does not assert a count it cannot synchronously read) — never `{ ok:false }`,
- **AND** an unknown `score` grade (not in `["A+","A","B","C","D","F"]`) is rejected by the schema → `{ ok:false, error }`, no `setColumnFilters` call (E-2).

### AC-3 — `smartSearch` drives the search box
- **GIVEN** the user is on `/contacts`,
- **WHEN** `contacts.smartSearch({ query: "CTOs at fintech" })` runs,
- **THEN** `setSearchQuery("CTOs at fintech")` is called (the same setter the `SmartSearchBar` `onChange` calls, `:793`), the debounced server search fires (`:256-261`), `confirm` is `never`, and the result is `{ ok: true, summary: "Searching contacts for \"CTOs at fintech\"." }`,
- **AND** an empty `query` clears the search (`setSearchQuery("")`) and returns `{ ok:true, summary:"Cleared the contact search." }`.

### AC-4 — `selectAll` selects every matching contact
- **GIVEN** the user is on `/contacts` with an active filter set,
- **WHEN** `contacts.selectAll({ matchingCurrentFilter: true })` runs,
- **THEN** the same `selectAllMatching` the header checkbox calls (`:591-607`, via `selectAllMatchingIds` against `/api/contacts?idsOnly=true`) runs, the selection updates, `confirm` is `never`, and the result reports the count, e.g. `{ ok: true, summary: "Selected 57 matching contacts." }` (read from `selectedRows.size` after the await),
- **AND** when a residual non-score NL smart filter is active (so the server cannot resolve "all matching"), the result honestly reports the visible-rows fallback (mirrors the page's own behaviour, `:594`) — `{ ok:true, summary:"Selected the 12 loaded contacts (a natural-language filter is active, so the full set can't be resolved server-side)." }`.

### AC-5 — `bulkEnrich` / `bulkFindMobile` act on the selection, cost credits, and confirm
- **GIVEN** the user is on `/contacts` with N contacts selected,
- **WHEN** `contacts.bulkEnrich()` runs (after the CLE-05 confirm card, since `cost:"credits"` + `confirm:"risky"`),
- **THEN** the same `bulkEnrichSelected` (`:475-510`, chunked-20 `/api/enrich-contacts`) the bulk bar fires runs, and the result reports the outcome, e.g. `{ ok: true, summary: "Enriched 40 of 57 contacts — 17 failed." }` (derived from the `chunkedBulkCall` result the handler already computes),
- **AND** `contacts.bulkFindMobile()` runs the same `bulkFindMobile` (`:553-582`, FullEnrich) and reports `{ ok:true, summary:"Searching mobiles for 57 contacts — phones appear as they're found." }` (mirrors the handler's toast),
- **AND** with **0** selected, both return `{ ok:false, summary:"Select some contacts first." }` and fire no network call (E-3, mirrors the handlers' `if (ids.length === 0) return`).

### AC-6 — `bulkMerge` requires ≥2 and navigates to the merge picker
- **GIVEN** the user is on `/contacts`,
- **WHEN** `contacts.bulkMerge()` runs with ≥2 contacts selected,
- **THEN** the same `bulkMergeSelected` (`:512-519`) runs → `router.push("/contacts/merge?ids=…")` with the selected ids, and the result is `{ ok: true, summary: "Opened the merge picker for 3 contacts." }`,
- **AND** with **<2** selected the action returns `{ ok:false, summary:"Select at least 2 contacts to merge." }` and does **not** navigate (E-4, mirrors the handler's `if (ids.length < 2)` guard, `:514`).

### AC-7 — `bulkDelete` always confirms, then soft-deletes; `bulkRestore` brings them back
- **GIVEN** N contacts selected in the active list,
- **WHEN** `contacts.bulkDelete({ cascade: ["activities"] })` runs,
- **THEN** because `confirm:"always"`, CLE-05 shows a confirm card first; on approve, the same cascade-delete the bulk bar runs (`openBulkCascadeDelete` → `performCascadeDelete`, per-id `DELETE /api/contacts/:id { cascade }`, `:424-470`) is executed, and the result reports `{ ok: true, summary: "Moved 12 contacts to Archive." }`,
- **AND** `contacts.bulkRestore()` (in the Archive view) calls the same `restoreContacts(Array.from(selectedRows))` (`:353-370`, `POST /api/contacts/restore`) and returns `{ ok: true, summary: "Restored 12 contacts." }`,
- **AND** with 0 selected, both return `{ ok:false, summary:"Select some contacts first." }`, no request (mirrors the handlers' `if (ids.length === 0) return`).

### AC-8 — `scoreAll` runs the tenant-wide ICP fit; `createContact` creates and refreshes
- **GIVEN** the user is on `/contacts`,
- **WHEN** `contacts.scoreAll()` runs (confirm card, `confirm:"risky"`),
- **THEN** the same `scoreAllContacts` (`:526-548`, `POST /api/score-contacts { all: true }`) runs and the result reports `{ ok: true, summary: "Scored 818 contacts against your ICP profiles." }` (from `data.scored`), and a re-entrant call while `scoringAll` is true is refused `{ ok:false, summary:"A scoring run is already in progress." }` (mirrors `if (scoringAll) return`, `:527`),
- **AND** **WHEN** `contacts.createContact({ firstName: "Jane", lastName: "Doe", title: "CTO" })` runs (confirm card), **THEN** the same `POST /api/contacts` body `handleCreateContact` sends is posted (the page maps to `createForm`-shaped fields; design §4 maps `companyId` honestly), the list re-fetches (`refetchLoadedContacts`), and the result is `{ ok: true, summary: "Created contact Jane Doe." }`,
- **AND** a `createContact` with neither `firstName` nor `email` is rejected (mirrors `handleCreateContact`'s `if (!createForm.firstName && !createForm.email)` guard, `:326`) → `{ ok:false, error:"First name or email required." }`, no POST.

### AC-9 — `updateField` / `reassignOwner` edit the open contact inline
- **GIVEN** the user is on `/contacts/[id]` for contact `C`,
- **WHEN** `contacts.updateField({ id: "C", field: "title", value: "VP Sales" })` runs (confirm card, `confirm:"risky"`),
- **THEN** the same `updateField("title", "VP Sales")` (`[id]/page.tsx:84-115`, optimistic + rollback, `PUT /api/contacts/C`) runs and the result is `{ ok: true, summary: "Updated title to \"VP Sales\"." }`,
- **AND** an invalid email (`field:"email"` failing the page's own regex, `[id]/page.tsx:92`) returns `{ ok:false, error:"That doesn't look like a valid email address." }` with no PUT (the page's guard already toasts; the action surfaces the same message),
- **AND** `contacts.reassignOwner({ id:"C", ownerId:"U1" })` runs `reassignContactOwner("U1")` (`:215-226`) → `{ ok:true, summary:"Reassigned the contact." }`; `ownerId:null` un-assigns,
- **AND** `updateField`/`reassignOwner` with an `id` that is **not** the open contact returns `{ ok:false, error:"That contact is not the one open here." }` (detail is single-contact — E-1).

### AC-10 — `openImport` / `openSmartImport` open the flow but the agent CANNOT choose the file (human-bound)
- **GIVEN** the user is on `/contacts`,
- **WHEN** `contacts.openImport()` runs,
- **THEN** the hidden CSV `<input type="file">` is opened for the **human** to pick a file — `run` calls `fileRef.current?.click()` (the same trigger as the "Import CSV" button, `page.tsx:730-733`) — and the result is `{ ok: true, summary: "Opened the CSV picker — choose a file to import (I can't pick the file for you)." }`,
- **AND** `contacts.openSmartImport()` calls `setShowSmartImport(true)` (`:726`) and returns `{ ok: true, summary: "Opened Smart Import — choose a CSV to map and import." }`,
- **AND** **no** file is read, **no** upload (`/api/import`, `/api/import/smart/preview`) is triggered by the action: `handleImport`/`handleFileUpload`/`handlePreview` only run after the human selects a file in the OS dialog (the **required** human-bound named test, §6) — the agent's reach stops at *opening the picker*,
- **AND** the model is taught (CLE-04 prompt + the action `description`) that it can open the import flow but the user must choose the file.

### AC-11 — An action invoked while NOT on the relevant contacts page degrades gracefully
- **GIVEN** the user is **not** on `/contacts` (e.g. on `/opportunities`), so the contacts list actions are unregistered,
- **WHEN** the model nonetheless emits `invokePageAction("contacts.bulkEnrich", ...)`,
- **THEN** CLE-04's tool refuses with `{ error, availableActionIds }` (the id is not in the current manifest) **or**, if a stale directive reaches the client, CLE-03's `runRegisteredAction` returns `{ ok:false, error:"action_not_registered" }` — never a crash, never a bulk op on a list that isn't there,
- **AND** the model is taught (CLE-04 prompt) to fall back to the headless contact tools (`enrichContact`/`updateContact`/etc.) when page actions are unavailable.

### AC-12 — `call` confirms (outbound), starts the call, and lands on the softphone
- **GIVEN** the user is on `/contacts/[id]` for contact `C` who has a phone,
- **WHEN** `contacts.call({ id: "C" })` runs,
- **THEN** because `confirm:"always"` (outbound + irreversible), CLE-05 shows a confirm card first; on approve, the same `startCall()` (`[id]/page.tsx:120-145`, `POST /api/calls/start { contactId }` then `router.push("/call-mode")`) runs and the result is `{ ok: true, summary: "Calling <name> — taking you to the softphone." }`,
- **AND** a voice-config / no-phone / DNC / quiet-hours rejection returns `{ ok:false, error }` with the page's own message (the `data.code` branches, `:131-135`), no navigation,
- **AND** the action is the **start** of the call only — placing the call, answering, hanging up, voicemail-drop, and in-call disposition are **device/human-bound and out of scope** (README §2; mirrors CLE-09's dial exclusion). `contacts.call` navigates to call-mode; it does **not** drive the live WebRTC dial.

### AC-13 — No handler logic is duplicated
- **GIVEN** the implementation,
- **WHEN** the code is reviewed,
- **THEN** every `run` body calls an **existing** page function or state setter (`setColumnFilters`, `setSearchQuery`, `selectAllMatching`, `bulkEnrichSelected`, `bulkFindMobile`, `bulkMergeSelected`, `openBulkCascadeDelete`/`performCascadeDelete`, `restoreContacts`, `scoreAllContacts`, `handleCreateContact` (or the §4 extraction of its POST), `fileRef.current?.click()`, `setShowSmartImport`, `updateField`, `reassignContactOwner`, `startCall`, `setEmailComposer`, and the §4 call-intel review helper) — no second copy of a fetch URL, body shape, optimistic-update, rollback, or selection logic exists for the agent path,
- **AND** any minimal refactor needed to make a handler callable with explicit args (rather than reading component `useState`) is a **pure extraction** (same body, params instead of closure state) verified to leave the button/setter/checkbox behaviour byte-identical (design §4).

---

## 4. Edge cases (each needs a test)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **`id` is not the open contact** (detail actions) | `updateField`/`reassignOwner`/`call`/`sendEmail`/`suggestReply`/`approveCallIntel`/`dismissCallIntel` compare `id` to `useParams().id`; mismatch → `{ ok:false, error:"That contact is not the one open here." }` — no PUT/POST. (The agent can navigate to that contact then retry, or use a headless tool.) |
| E-2 | **Invalid `score` grade in `applyFilter`** | `score` is a `z.enum(["A+","A","B","C","D","F"])`; an unknown grade → schema reject `{ ok:false, error }`, no `setColumnFilters`. Other column params are free strings/enums per the page's filter config. |
| E-3 | **Bulk op on an empty selection** | `bulkEnrich`/`bulkFindMobile`/`bulkDelete`/`bulkRestore` read the live `selectedRows`; if empty → `{ ok:false, summary:"Select some contacts first." }`, no network call (mirrors each handler's `if (ids.length === 0) return`). The model is told to call `contacts.selectAll` first. |
| E-4 | **`bulkMerge` with fewer than 2 selected** | Mirrors `bulkMergeSelected`'s `if (ids.length < 2)` (`:514`): `{ ok:false, summary:"Select at least 2 contacts to merge." }`, no navigation. (Merge **needs ≥2**.) |
| E-5 | **Action invoked while NOT on the page** | Graceful refusal (AC-11). No throw, no effect. |
| E-6 | **`createContact` with neither firstName nor email** | Mirrors `handleCreateContact`'s guard (`:326`): `{ ok:false, error:"First name or email required." }`, no POST. |
| E-7 | **`openImport` / `openSmartImport` — agent attempts to also supply a file** | The `params` schema is `{}` (no file/path field exists); there is **no** way to pass file bytes through the registry. `run` only opens the picker/modal. The upload path is unreachable from the action — the human-bound boundary holds by construction (AC-10). |
| E-8 | **`bulkDelete` cascade keys** | `cascade` defaults to `[]` (delete the contacts only). When supplied, only `activities`/`notes`/`tasks` pass (schema `z.enum`); the same per-id `DELETE` with `{ cascade }` is sent as `performCascadeDelete`. |
| E-9 | **`scoreAll` re-entrancy** | If a run is already in flight (`scoringAll` true) → `{ ok:false, summary:"A scoring run is already in progress." }`, no second POST (mirrors `if (scoringAll) return`, `:527`). |
| E-10 | **`call` on a contact with no phone** | `startCall`'s server returns `code:"no_phone"` → `{ ok:false, error:"Contact has no phone number." }` (the page's branch, `:132`). The action does not pre-check the phone (parity with the page, which posts then surfaces the server code), so the message is the server's. No navigation. |
| E-11 | **`approveCallIntel`/`dismissCallIntel` with no pending proposal** | The review endpoint is idempotent/no-op when there is nothing pending; the action posts the same `POST /api/call-intel/review` the component would and surfaces the result. If the server reports nothing to apply, `{ ok:false, summary:"There's no pending call-intel proposal on this contact." }` (the page reads `contact.properties.callProfile` to know whether to offer it — design §3.2). |
| E-12 | **Selection changes between `selectAll` and a bulk op** | Each bulk `run` reads `selectedRows` live (via a ref, design §3.1) at invocation time, so it operates on the selection as it is when the bulk action fires — exactly as a human clicking the bulk bar would. No stale snapshot. |

---

## 5. Out of scope

- **The PAR framework itself** (directive, registry, hook, executor, confirm card, server tools, `decideAction`, prompt) → CLE-03/04/05/10. CLE-08 only *calls* `useRegisterPageActions` and maps `run`s.
- **Audit-log / undo** for these mutating actions (`tool_call_events`, undo window) → CLE-11. CLE-08 declares `reversible` honestly; the undo *mechanism* (esp. the outbound `call` and credit-spending enrich) is CLE-11.
- **Permission matrix** beyond what `decideAction` already enforces (viewer cannot mutate; viewer can still `applyFilter`/`smartSearch`/`selectAll`/`openImport`/`openSmartImport`/`sendEmail`/`suggestReply` which are read-only/open-only) → CLE-12.
- **Post-action highlight** of the filtered list / selected rows ("narrate+actuate") → CLE-15. CLE-08's effect is visible because it drives the real handlers, but the deliberate *highlight* is CLE-15.
- **HUMAN-BOUND / DEVICE-BOUND (declared, deliberately NOT executable by the agent — README §2):**
  - **The import file picker.** `openImport`/`openSmartImport` open the flow; **choosing the file and triggering the upload stays human** — there is no registry path to pass file bytes (E-7). The agent prepares; the human picks. *(This is the initiative's first file-picker boundary; CLE-14 meetings/proposals will hit the same wall for transcript/template upload.)*
  - **The live call.** `contacts.call` starts a call and navigates to call-mode; the live WebRTC **dial / answer / hang-up / voicemail-drop / in-call disposition** are device/human-bound and excluded (README §2; the `/call-mode` exclusions are CLE-09's). `contacts.call` is the *mutating start*, not the live media.
- **Sending the email.** `contacts.sendEmail`/`suggestReply` open the composer (the existing `composeEmail` directive pattern); the actual **send** is the user's click in the composer (already its own confirmed surface). The action is `outbound:false` because it only opens the panel.
- **Bulk cross-page operations stay headless** (README §3.6): "enrich every contact at French accounts" or "delete all contacts with no email across the whole base" are mass / cross-view ops the model should route to a **headless** tool, not to these page actions which act on the *current selection / loaded list*.
- **The merge commit itself.** `contacts.bulkMerge` only routes to `/contacts/merge`; picking the survivor and confirming the merge is done by a human on the merge page (`merge/page.tsx:131-171`). Registering the merge page's own `mergeGroup` action is a CLE-14 follow-up, not part of this list/detail registration.
- **Per-row inline enrich on the list** (`enrichSingle`, `page.tsx:303-311`) and **single-row delete** (`openCascadeDelete([id], name)`, `:1097`) are **deferred**: they are row-scoped UI affordances; the agent's equivalent is `selectAll`/select + the bulk actions, or the headless `enrichContact`/`deleteContact` tools. Registering per-row actions (which require a row id the model would have to discover) is lower-value than the bulk path and is left to CLE-14 if wanted.

---

## 6. Evaluation steps (Phase 6, hostile QA — read literally)

Unit/RTL tests prove each `run → effect` without a live server (mock `fetch`, spy the existing handler/setter). One Playwright-style live check proves the headline loop on the real list + detail.

1. **Manifest membership (unit/RTL).** Mount `/contacts`; assert the manifest lists exactly the list-page action ids with the metadata table §2.1 (assert `bulkDelete.confirm==="always"`, `applyFilter.confirm==="never"`, `bulkEnrich.cost==="credits"` and `confirm==="risky"`, `openImport.mutating===false`, `scoreAll.mutating===true`). Mount `/contacts/[id]`; assert the detail ids present (`call.confirm==="always"`, `call.outbound===true`, `call.reversible===false`; `updateField.confirm==="risky"`; `sendEmail.mutating===false`) and the list-only ids absent. (AC-1.)
2. **`applyFilter` incl. 0-result (unit).** Run `{ title:["CTO"], industry:["Financial Services"] }`; assert `setColumnFilters` received the equivalent `ColumnFilterState` shape and the summary names the filters. Unknown `score` grade → schema reject, no `setColumnFilters` (E-2). (AC-2.)
3. **`smartSearch` (unit).** Run `{ query:"CTOs at fintech" }` → `setSearchQuery("CTOs at fintech")`, `ok:true`. Empty query → `setSearchQuery("")`, "Cleared". (AC-3.)
4. **`selectAll` (unit).** Spy `selectAllMatchingIds`; run `{ matchingCurrentFilter:true }`; assert it is called with the page filter params and the summary reports the count. NL-filter-active board → visible-rows fallback summary. (AC-4.)
5. **`bulkEnrich` + `bulkFindMobile` (unit).** With a non-empty selection, run each; assert the same `/api/enrich-contacts` (chunked-20) / `/api/contacts/fullenrich-enrich` calls the handlers make, `ok:true` with the handler-derived summary. Empty selection → `ok:false` "Select some contacts first.", no call (E-3). Assert `cost:"credits"` in metadata (the badge driver). (AC-5.)
6. **`bulkMerge` (unit).** ≥2 selected → `router.push("/contacts/merge?ids=…")`, `ok:true`. <2 → `ok:false` "Select at least 2…", no push (E-4). (AC-6.)
7. **`bulkDelete` + `bulkRestore` (unit).** `bulkDelete({cascade:["activities"]})` → assert `confirm:"always"` (card path), then per-id `DELETE` with cascade via `performCascadeDelete`, `ok:true`. Default cascade `[]`; bad cascade key rejected (E-8). `bulkRestore()` → `POST /api/contacts/restore`, `ok:true`. Empty selection → `ok:false` for both. (AC-7.)
8. **`scoreAll` + `createContact` (unit).** `scoreAll()` → `POST /api/score-contacts {all:true}`, `ok:true` "Scored N…"; re-entrant (scoringAll true) → `ok:false` (E-9). `createContact({firstName:"Jane",lastName:"Doe",title:"CTO"})` → mapped `POST /api/contacts`, `refetchLoadedContacts`, `ok:true`; neither firstName nor email → `ok:false`, no POST (E-6). (AC-8.)
9. **`openImport` / `openSmartImport` — the REQUIRED human-bound named test.** Spy `fileRef.current.click` and `global.fetch`. Run `contacts.openImport()`; assert `click()` was called **once**, `setShowSmartImport` not called, **and `fetch` to `/api/import` was NEVER called** (the action opens the picker; it does **not** read or submit a file). Run `contacts.openSmartImport()`; assert `setShowSmartImport(true)`, no `/api/import/smart/preview` fetch. Assert both are `mutating:false`. This proves the file-picker boundary: the agent opens the flow, the human chooses the file. (AC-10 / E-7.)
10. **`updateField` + `reassignOwner` (unit, detail).** `updateField({id:C,field:"title",value:"VP Sales"})` → `PUT /api/contacts/C { title:"VP Sales" }` via the page's `updateField`, `ok:true`; invalid email → `ok:false` no PUT; wrong id → `ok:false` (E-1). `reassignOwner({id:C,ownerId:"U1"})` → `PUT { ownerId:"U1" }`, `ok:true`. (AC-9.)
11. **`call` — REQUIRED confirm + outbound test (unit, detail).** Assert `call.confirm==="always"`, `outbound:true`, `reversible:false`. Run `call({id:C})`; assert it goes through the confirm gate (decideAction → confirm), then `POST /api/calls/start { contactId:C }` + `router.push("/call-mode")`, `ok:true`. Server `code:"no_phone"` → `ok:false` "Contact has no phone number.", no push (E-10). Wrong id → `ok:false` (E-1). Confirm the action does NOT drive the live dial. (AC-12.)
12. **`sendEmail` + `suggestReply` (unit, detail).** `sendEmail({id:C, draft:{subject:"Hi"}})` → `setEmailComposer` called with a draft to the contact's email, `ok:true`, `mutating:false`, no send. `suggestReply({id:C, activityId:A})` → `setEmailComposer` pre-filled, `ok:true`. Wrong id → `ok:false` (E-1).
13. **`approveCallIntel` / `dismissCallIntel` (unit, detail).** With a pending `callProfile`, run each → `POST /api/call-intel/review { entityType:"contact", entityId:C, action }`, `ok:true`. No pending → `ok:false` "no pending proposal" (E-11). (Detail page reuses the review endpoint the component calls; design §3.2/§4.)
14. **Edge guards (unit).** Empty-selection bulk (E-3), <2 merge (E-4), wrong-id detail (E-1), unknown score grade (E-2), scoreAll re-entrancy (E-9). 
15. **Off-page degradation (unit/RTL).** Unmount `/contacts`; assert the list ids are gone from the manifest and `runRegisteredAction("contacts.bulkEnrich",…)` returns `action_not_registered`. (AC-11 / E-5.)
16. **No-duplication review (manual + grep).** Grep the two pages for the enrich/find-mobile/merge/delete/restore/score/create/calls-start/review fetch URLs — each must appear **once** (or in one shared extracted helper), used by both the button/setter/checkbox and the `run`. Any second copy of a body shape, selection logic, or rollback = FAIL. (AC-13.)
17. **Live loop (Playwright-style).** On the real `/contacts` with the dock open: type "filter to CTOs" → observe the column filter + re-fetched list; "select all of them" → observe the selection + bulk bar; "import my CSV" → observe the **OS file dialog open** (and that nothing uploads until a file is chosen — the human-bound boundary). On `/contacts/[id]`: "set her title to VP Sales" → observe the inline save; "call her" → observe the confirm card then the softphone navigation. Capture before/after screenshots (CLAUDE.md screenshot rule) into `_research/raw/cle-08/`.
18. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. CLE-03/04/05 tests untouched and green. The contacts pages' existing behaviour (filters, search, select-all, bulk bar, import button, create modal, inline edit, call, composer) is byte-identical when used by hand (the extractions preserved it).

**Hard thresholds:** AC-1..AC-13 all pass; every edge case E-1..E-12 has a passing test; the two **required** named tests pass (the **human-bound file-picker** test — `openImport` opens the picker and does NOT submit a file; and `bulkDelete` requires `confirm`); `tsc` 0 errors; no handler logic duplicated; the pages' manual UX unchanged. Any miss = FAIL → delete branch → respec.
