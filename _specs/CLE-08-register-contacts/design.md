# CLE-08 — Register the `/contacts` page actions (list + detail) — Design

> Implements the **consumption** side of README §3.2 (`PageAction`) and §3.3 (`useRegisterPageActions`) for the contacts pages. It introduces **no** new contract and **no** new framework code; it declares `PageAction[]`s whose `run`s call handlers that already exist (cited file:line below) and calls the CLE-03 hook. The metadata each action carries is what CLE-04's `decideAction` reads to set `requireConfirm`, and what CLE-05's confirm card renders.
> Builds on: `_specs/CLE-03-action-directive-and-registry/design.md` (the `PageAction`/`PageActionResult` types §2.2, `useRegisterPageActions`/`runRegisteredAction` §2.3), `_specs/CLE-04-page-action-tools/design.md` (`decideAction` §2.1 maps our `confirm`/`mutating`/`reversible`/`cost`/`outbound` → a disposition; the manifest is read by `listPageActions`), `_specs/CLE-05-action-confirmation-ux/design.md` (the editable confirm card rendered when `requireConfirm:true`; the risk badge from `cost`/`outbound`). Same shape as `_specs/CLE-06-register-opportunities/design.md` (the pilot).
> Real code anchored: `app/apps/web/src/app/(dashboard)/contacts/page.tsx` (list, 1226 lines) and `.../contacts/[id]/page.tsx` (detail, 707 lines), plus `components/smart-import.tsx` (the import modal) and `components/call-intel.tsx` (the call-intel review path).

---

## 1. System fit — the handlers we reuse (file:line)

The whole feature is a thin declarative layer over functions that already exist. **Nothing below is re-implemented**; the `run` closures call these.

### 1.1 List page — `app/apps/web/src/app/(dashboard)/contacts/page.tsx`

| Concern | Existing handler / state (file:line) | What it does today | Action that reuses it |
|---|---|---|---|
| Column filters (8 columns) | `columnFilters`/`setColumnFilters` `:114`; `<ColumnFilter onChange>` `:931-938`; `FILTER_COLUMNS` config `:612-625`; `columnOptions` `:630-635`; the debounce→server effect `:265-270`; `serializeContactFilters` `:139-169` | client filter state → server fetch via `/api/contacts` (spans all contacts) | `contacts.applyFilter` |
| Text / smart search | `searchQuery`/`setSearchQuery` `:80`; the `SmartSearchBar onChange` `:793`; the debounce→server effect `:256-261` | server-side search across all contacts | `contacts.smartSearch` |
| Select all matching | `selectAllMatching()` `:591-607` (calls `selectAllMatchingIds` against `/api/contacts?idsOnly=true`, `lib/infra/select-all-matching.ts`); `selectedRows`/`setSelectedRows` `:106`; `filteredContacts` `:650-663` | selects every row the active filters match | `contacts.selectAll` |
| Bulk enrich | `bulkEnrichSelected()` `:475-510` (chunked-20 `/api/enrich-contacts` via `chunkedBulkCall`, `lib/infra/chunk-bulk.ts`); reads `selectedRows` | enrich every selected contact, report partial failures | `contacts.bulkEnrich` |
| Bulk find mobile | `bulkFindMobile()` `:553-582` (`POST /api/contacts/fullenrich-enrich`, FullEnrich deep pass, 100/run); reads `selectedRows` | deep mobile/email enrichment | `contacts.bulkFindMobile` |
| Bulk merge | `bulkMergeSelected()` `:512-519` (`router.push("/contacts/merge?ids=…")`, guards `< 2`); reads `selectedRows` | route to the merge picker with the selection | `contacts.bulkMerge` |
| Bulk delete (cascade) | `openBulkCascadeDelete()` `:407-416` → `openCascadeDelete(ids,label)` `:375-403` (loads related counts) → `performCascadeDelete(selectedKeys)` `:424-470` (per-id `DELETE /api/contacts/${id}` with `{ cascade }`, soft-delete, `refetchLoadedContacts`); `cascadeTarget` state `:132` | soft-delete selected contacts + optional related rows | `contacts.bulkDelete` |
| Bulk restore | `restoreContacts(ids)` `:353-370` (`POST /api/contacts/restore { ids }`); shown in Archive view | un-delete from the archive | `contacts.bulkRestore` |
| Score all | `scoreAllContacts()` `:526-548` (`POST /api/score-contacts { all: true }`, guards `scoringAll`); `scoringAll` state `:112` | tenant-wide ICP-fit recompute | `contacts.scoreAll` |
| Create contact | `handleCreateContact()` `:325-348` (the `POST /api/contacts` body `:331-335` from `createForm`; `refetchLoadedContacts` `:340`); `createForm`/`setCreateForm` `:95`; `setShowCreate` `:94` | create one contact + refresh | `contacts.createContact` |
| Import CSV (file picker) | the hidden `<input ref={fileRef} type="file">` `:733`; the "Import CSV" button `onClick={() => fileRef.current?.click()}` `:730`; `handleImport(e)` `:280-296` (runs **only** on the input's `onChange`, after a human picks a file) | open the OS file dialog; upload on selection | `contacts.openImport` (**opens picker only**) |
| Smart Import (modal) | `showSmartImport`/`setShowSmartImport` `:103`; the "Smart Import" button `onClick={() => setShowSmartImport(true)}` `:726`; `<SmartImport>` render `:1186` | open the guided CSV mapping modal | `contacts.openSmartImport` (**opens modal only**) |
| Filter-column config / grades | `FILTER_COLUMNS` `:612-625`; grade list `["A+","A","B","C","D","F"]` `:634`; `isColumnFilterActive` (from `@/components/ui/column-filter`) | the 8 columns + their kinds | validates `applyFilter` params |

### 1.2 Detail page — `app/apps/web/src/app/(dashboard)/contacts/[id]/page.tsx`

| Concern | Existing handler (file:line) | What it does | Action |
|---|---|---|---|
| Inline field edit | `updateField(field, next)` `:84-115` — optimistic + rollback; `PUT /api/contacts/${contactId} { [field]: nullable }`; email regex guard `:92` | edit title/email/phone | `contacts.updateField` |
| Reassign owner | `reassignContactOwner(ownerId)` `:215-226` — optimistic; `PUT /api/contacts/${contactId} { ownerId }` | change the responsible member | `contacts.reassignOwner` |
| Start call | `startCall()` `:120-145` — `POST /api/calls/start { contactId }`; on success `router.push("/call-mode")`; error `code` branches `:131-135` | start an outbound call, land on softphone | `contacts.call` |
| Send email (composer) | `setEmailComposer(draft)` `:74`; the "Send email" button builds the draft `:283-294`; `<EmailComposerPanel>` `:466-471` | open the composer pre-filled (does not send) | `contacts.sendEmail` |
| Suggest reply (composer) | the "Suggest reply" `onClick` builds a reply draft from an inbound activity and calls `setEmailComposer({...})` `:340-351` | open the composer pre-filled from an inbound email | `contacts.suggestReply` |
| Call-intel review | the review endpoint `POST /api/call-intel/review { entityType, entityId, action }` that `usePendingReview.act` posts (`components/call-intel.tsx:73-93`); the page renders `<ContactCallProfile properties={contact.properties} entityId={contactId} />` `:370`, which self-extracts `contact.properties.callProfile` (live vs `pending`) | apply/dismiss the post-call qualification proposal | `contacts.approveCallIntel` / `contacts.dismissCallIntel` |
| Open-contact identity | `contactId = params.id` `:67`; `contact` state `:70`; `activities` `:71` | the single contact this page shows | E-1 id guard; `suggestReply` activity lookup |

> **The call-intel decision (the one non-trivial reuse).** Approve/Dismiss is **not** a page-level handler today — it lives inside the `usePendingReview` hook (`call-intel.tsx:57-96`), which the `<ContactCallProfile>` card owns and which POSTs to `/api/call-intel/review`. The detail page only renders the card; it does not own a function we can call. **This is the CLE-06 MEDDPICC situation** (a display component with no page handler) — but here, unlike MEDDPICC, there is a **concrete, page-knowable seam**: the page already holds `contactId` and `contact.properties` (so it can tell whether a `callProfile.pending` proposal exists), and the review endpoint contract (`{ entityType:"contact", entityId, action }`) is exactly what the human's Approve/Dismiss button posts. So CLE-08 adds a **tiny page-level helper** `reviewCallIntel(action)` that POSTs to the **same** endpoint the component posts to (§4) — reusing the *endpoint contract* the component already calls, not duplicating any business logic (the server owns the live-vs-pending merge). The card keeps its own buttons; the page action is a second caller of the same REST contract. (Alternative considered: thread a callback into `<ContactCallProfile>` so the action drives the card's own `act`. Rejected — it would require lifting `usePendingReview` state into the page and coupling the action's lifetime to the card's render, more invasive than a second REST caller. Recorded as the documented alternative; v1 ships the helper.)

### 1.3 Where `useRegisterPageActions` is called

Each page declares its actions in a `useMemo` (stable array, ids constant) and registers them with a single hook call near the top of the component body, after the handlers it references are defined. The hook (CLE-03 §2.3) registers on mount, clears on unmount, so the manifest always reflects the current page (AC-1; CLE-03 AC-6).

- **List page:** at the end of the component's handler block (after `scoreAllContacts`/`bulkFindMobile`/`selectAllMatching`/`performCascadeDelete` are defined), add `useRegisterPageActions(contactListActions)` where `contactListActions` is the `useMemo` built in §3.1.
- **Detail page:** after `updateField`/`startCall`/`reassignContactOwner` are defined, add `useRegisterPageActions(contactDetailActions)` (§3.2).

> **Hook ordering constraint.** `useRegisterPageActions` is a hook → it must be called unconditionally at the top level of the component, **not** inside the early `if (loading) return …` / `if (!contact) return …` branches on the detail page (`[id]/page.tsx:214,228`). The `run` closures capture the latest handlers via the `useMemo` dependency list (or a `useRef` mirror for values that change every render, §3.3), so an early return before data loads is fine: the actions are registered but their `run` guards on `contact`/`contactId` being present (AC-9 / E-1). **Caveat:** `reassignContactOwner` is currently defined **after** the `if (loading) return` at `:214` (it sits at `:215-226`). To register it unconditionally, the registration `useMemo` must reference it via a `useRef` mirror (or the function is hoisted above the early return). Design §3.2 uses ref mirrors for exactly this — the registration block goes at the top level and reads handlers through refs, so the early returns below it are untouched (no behaviour change to the page).

---

## 2. The file-picker human-bound boundary (the structural novelty vs CLE-06)

`/contacts` is the first PAR page with a **human-bound** action (README §2: "Dialogues fichiers natifs navigateur (upload CSV/transcript/template `.docx`) — l'agent peut ouvrir le flow, pas choisir le fichier"). The boundary is enforced **by construction**, three ways:

1. **The action only opens the surface.** `contacts.openImport.run` calls `fileRef.current?.click()` (the exact trigger the "Import CSV" button uses, `page.tsx:730`); `contacts.openSmartImport.run` calls `setShowSmartImport(true)` (`:726`). Neither reads a file, builds a `FormData`, or hits `/api/import` (or `/api/import/smart/preview`). The upload paths — `handleImport` (`page.tsx:280-296`) and the SmartImport modal's `handleFileUpload`/`handlePreview` (`smart-import.tsx:67-90`) — run **only** on the `<input>`'s `onChange` / the modal's own buttons, i.e. **after a human selects a file in the OS dialog**.
2. **There is no file param in the schema.** Both actions take `z.object({})`. The registry has no representation for file bytes / a local path, so the model **cannot** pass a file through `invokePageAction` even if it tried (E-7). The native `<input type="file">` dialog is a browser-security surface the page cannot script open-with-a-preselected-file, and the agent has no DOM-vision path (computer-use is rejected, README doctrine §3). The boundary is not a policy check that could be bypassed — it is the absence of any mechanism to cross it.
3. **The result tells the user to pick the file.** `openImport` returns `{ ok:true, summary:"Opened the CSV picker — choose a file to import (I can't pick the file for you)." }`; `openSmartImport` returns `{ ok:true, summary:"Opened Smart Import — choose a CSV to map and import." }`. The model (taught by CLE-04's prompt + the action `description`) relays this and waits for the human, rather than claiming the import happened.

These are therefore declared as **non-mutating "navigate/open" actions** (`mutating:false, confirm:"never"`) — they are the contacts-page analogue of the `navigate`/`composeEmail` directives (open a surface, change nothing persistent). The **required** human-bound named test (requirements §6 step 9) asserts `openImport` calls `click()` once and **never** fetches `/api/import`.

> **Contract note (no tension).** This does not strain any CLE contract: `PageAction` already models non-mutating open actions (CLE-06's `applyFilter`/`setView` are the same class), and `PageActionResult` cleanly carries an `ok:true` "I opened it, your turn" summary. The README §2 exclusion is *honoured*, not bent — the agent reaches the import flow and stops exactly where the human's hand is required. The single thing to flag in the final report is simply that **CLE-08 is where the file-picker boundary first becomes concrete**, so the prompt/UX wording ("choose a file") is set here and reused by CLE-14.

---

## 3. The exact `PageAction[]` arrays

Types imported from CLE-03: `import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types"; import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";` and `import { z } from "zod";`. `confirm`/`mutating`/etc. are the README §3.2 fields verbatim.

A small local helper keeps results uniform (not a contract — internal to each page):

```ts
const ok = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const err = (error: string, summary?: string): PageActionResult =>
  ({ ok: false, error, summary: summary ?? error });
```

### 3.1 List page — `contactListActions`

```ts
// Built with useMemo; the run()s read LIVE state via refs so the id set stays
// stable (CLE-03 keys registration by id list — a stable id set + ref-read params
// is the right pattern, identical to CLE-06 design §3.1).
const selectedRef = useRef(selectedRows);
useEffect(() => { selectedRef.current = selectedRows; });
const contactsRef = useRef(contacts);
useEffect(() => { contactsRef.current = contacts; });
const scoringRef = useRef(scoringAll);
useEffect(() => { scoringRef.current = scoringAll; });

const contactListActions: PageAction[] = useMemo(() => [

  // ── applyFilter (the 8 columns) ────────────────────────────
  {
    id: "contacts.applyFilter",
    title: "Filter the contacts list",
    description:
      "Apply the contacts list's column filters: contact name (text), company (names), industry, " +
      "email (text), title (one or more), LinkedIn present/absent, phone present/absent, score grade " +
      "(A+/A/B/C/D/F). Replaces the current column-filter set. Use when the user wants to narrow the list. " +
      "It runs server-side across ALL contacts, not just the loaded page.",
    params: z.object({
      contact: z.string().optional(),
      companyName: z.array(z.string()).optional(),
      industry: z.array(z.string()).optional(),
      email: z.string().optional(),
      title: z.array(z.string()).optional(),
      linkedin: z.enum(["present", "absent"]).optional(),
      phone: z.enum(["present", "absent"]).optional(),
      score: z.array(z.enum(["A+", "A", "B", "C", "D", "F"])).optional(),
    }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (p): Promise<PageActionResult> => {
      const next: Record<string, ColumnFilterState> = {};                          // shape = the page's columnFilters
      if (p.contact) next.contact = { text: p.contact };
      if (p.email) next.email = { text: p.email };
      if (p.title?.length) next.title = { values: p.title };
      if (p.companyName?.length) next.companyName = { values: p.companyName };
      if (p.industry?.length) next.industry = { values: p.industry };
      if (p.score?.length) next.score = { values: p.score };
      if (p.linkedin) next.linkedin = { presence: p.linkedin };
      if (p.phone) next.phone = { presence: p.phone };
      setColumnFilters(next);                                                       // same setter the <ColumnFilter> dropdowns call (:931)
      const desc = describeContactFilters(p);                                       // §4 pure formatter
      return ok("Filtered contacts by " + desc + ".");                             // count is server-async; summary names the filters (AC-2)
    },
  },

  // ── smartSearch ────────────────────────────────────────────
  {
    id: "contacts.smartSearch",
    title: "Search contacts",
    description:
      "Type into the contacts search box — a name/email match or a natural-language query " +
      "(e.g. 'CTOs at fintech'). Runs server-side across all contacts. Pass an empty query to clear it.",
    params: z.object({ query: z.string() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ query }): Promise<PageActionResult> => {
      setSearchQuery(query);                                                        // same setter as SmartSearchBar onChange (:793)
      return query.trim()
        ? ok('Searching contacts for "' + query.trim() + '".')
        : ok("Cleared the contact search.");
    },
  },

  // ── selectAll ──────────────────────────────────────────────
  {
    id: "contacts.selectAll",
    title: "Select all matching contacts",
    description:
      "Select every contact that matches the active filters/search (not just the loaded page), " +
      "so a bulk action can run on the whole set. Use before a bulk enrich/find-mobile/merge/delete.",
    params: z.object({ matchingCurrentFilter: z.boolean().optional() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (): Promise<PageActionResult> => {
      await selectAllMatching();                                                    // :591-607 (server idsOnly ∪ visible)
      const n = selectedRef.current.size;                                          // read live after the await
      return ok("Selected " + n + " matching contact" + (n === 1 ? "" : "s") + ".", { count: n });
    },
  },

  // ── bulkEnrich (credits) ───────────────────────────────────
  {
    id: "contacts.bulkEnrich",
    title: "Enrich the selected contacts",
    description:
      "Enrich every currently-selected contact (titles, seniority, LinkedIn, etc.). Uses enrichment credits. " +
      "Select contacts first (contacts.selectAll). Confirms before spending.",
    params: z.object({}),
    mutating: true, reversible: true, cost: "credits", confirm: "risky",
    run: async (): Promise<PageActionResult> => {
      if (selectedRef.current.size === 0) return err("Select some contacts first.");          // E-3
      const before = selectedRef.current.size;
      await bulkEnrichSelected();                                                              // :475-510 (chunked-20, sets enrichStatus, toasts)
      return ok("Enriched the selected contacts (" + before + " requested) — see the rows for per-contact status.");
    },
  },

  // ── bulkFindMobile (credits, FullEnrich) ───────────────────
  {
    id: "contacts.bulkFindMobile",
    title: "Find mobiles for the selected contacts",
    description:
      "Run the deep mobile/email enrichment (FullEnrich) on the selected contacts. Uses credits; results " +
      "arrive asynchronously as they're found. Runs 100 contacts per submission. Confirms before spending.",
    params: z.object({}),
    mutating: true, reversible: true, cost: "credits", confirm: "risky",
    run: async (): Promise<PageActionResult> => {
      const n = selectedRef.current.size;
      if (n === 0) return err("Select some contacts first.");                                  // E-3
      await bulkFindMobile();                                                                  // :553-582 (FullEnrich, toasts, clears selection)
      return ok("Searching mobiles for " + Math.min(n, 100) + " contact" + (Math.min(n, 100) === 1 ? "" : "s") +
        " — phones and emails appear as they're found." + (n > 100 ? " Run again for the remaining " + (n - 100) + "." : ""));
    },
  },

  // ── bulkMerge (navigates to merge; ≥2) ─────────────────────
  {
    id: "contacts.bulkMerge",
    title: "Merge the selected contacts",
    description:
      "Open the merge picker for the selected contacts (need at least 2). You pick the survivor there; " +
      "merging is destructive downstream and is confirmed on the merge page.",
    params: z.object({}),
    mutating: false, reversible: true, cost: "free", confirm: "risky",
    run: async (): Promise<PageActionResult> => {
      const n = selectedRef.current.size;
      if (n < 2) return err("Select at least 2 contacts to merge.");                           // E-4 (mirrors :514)
      bulkMergeSelected();                                                                     // :512-519 → router.push("/contacts/merge?ids=…")
      return ok("Opened the merge picker for " + n + " contacts.");
    },
  },

  // ── bulkDelete (destructive, always confirm) ───────────────
  {
    id: "contacts.bulkDelete",
    title: "Delete the selected contacts",
    description:
      "Soft-delete the selected contacts (they move to the Archive and can be restored). Optionally cascade " +
      "to their activities, notes, and/or tasks. Always asks for confirmation first.",
    params: z.object({ cascade: z.array(z.enum(["activities", "notes", "tasks"])).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ cascade }): Promise<PageActionResult> => {
      const n = selectedRef.current.size;
      if (n === 0) return err("Select some contacts first.");                                  // E-3
      const r = await deleteSelectedContacts(cascade ?? []);                                   // §4 extraction of openBulkCascadeDelete→performCascadeDelete
      return r.ok ? ok("Moved " + r.deleted + " contact" + (r.deleted === 1 ? "" : "s") + " to Archive.")
                  : err(r.error ?? "Failed to delete the contacts.");
    },
  },

  // ── bulkRestore (reversible) ───────────────────────────────
  {
    id: "contacts.bulkRestore",
    title: "Restore the selected contacts",
    description: "Bring the selected soft-deleted contacts back from the Archive.",
    params: z.object({}),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async (): Promise<PageActionResult> => {
      const ids = Array.from(selectedRef.current);
      if (ids.length === 0) return err("Select some contacts first.");                         // E-3
      await restoreContacts(ids);                                                              // :353-370 (POST /api/contacts/restore, toasts)
      return ok("Restored " + ids.length + " contact" + (ids.length === 1 ? "" : "s") + ".");
    },
  },

  // ── scoreAll (tenant-wide, risky) ──────────────────────────
  {
    id: "contacts.scoreAll",
    title: "Score all contacts",
    description:
      "Recompute ICP fit for EVERY contact against your ICP profiles (one tenant-wide run). " +
      "Use when the user wants the whole base re-scored. Confirms first.",
    params: z.object({}),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async (): Promise<PageActionResult> => {
      if (scoringRef.current) return err("A scoring run is already in progress.");             // E-9 (mirrors :527)
      await scoreAllContacts();                                                                // :526-548 (POST /api/score-contacts {all:true}, toasts the count)
      return ok("Scored your contacts against your ICP profiles.");
    },
  },

  // ── createContact (risky) ──────────────────────────────────
  {
    id: "contacts.createContact",
    title: "Create a contact",
    description:
      "Create a new contact. Provide at least a first name or an email; optionally last name, title, " +
      "and the company to link (companyId). Use when the user wants to add a person.",
    params: z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      title: z.string().optional(),
      companyId: z.string().optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async (p): Promise<PageActionResult> => {
      if (!p.firstName?.trim() && !p.email?.trim()) return err("First name or email required.");   // E-6 (mirrors :326)
      const r = await submitCreateContact(p);                                                      // §4 extraction of handleCreateContact's POST
      const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || p.email || "the contact";
      return r.ok ? ok("Created contact " + name + ".") : err(r.error ?? "Failed to create contact.");
    },
  },

  // ── openImport (HUMAN-BOUND: opens the CSV picker only) ─────
  {
    id: "contacts.openImport",
    title: "Open the CSV import picker",
    description:
      "Open the CSV file picker so the user can import contacts. NOTE: you can OPEN the picker but you " +
      "CANNOT choose the file — the user must pick it in the dialog. Tell them the picker is open.",
    params: z.object({}),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (): Promise<PageActionResult> => {
      fileRef.current?.click();                                                                // :730 — opens the native dialog ONLY (no upload)
      return ok("Opened the CSV picker — choose a file to import (I can't pick the file for you).");
    },
  },

  // ── openSmartImport (HUMAN-BOUND: opens the modal only) ─────
  {
    id: "contacts.openSmartImport",
    title: "Open Smart Import",
    description:
      "Open the guided Smart Import modal so the user can map and import a CSV. You can OPEN it but the " +
      "user chooses and uploads the file. Tell them it's open.",
    params: z.object({}),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (): Promise<PageActionResult> => {
      setShowSmartImport(true);                                                                // :726 — opens the modal ONLY
      return ok("Opened Smart Import — choose a CSV to map and import.");
    },
  },

  // eslint-disable-next-line react-hooks/exhaustive-deps
], []); // stable id set; run() reads live values via refs / stable setters

useRegisterPageActions(contactListActions);
```

> **Why `useMemo([], [])` is safe here.** State **setters** (`setColumnFilters`, `setSearchQuery`, `setShowSmartImport`, `setSelectedRows`) are referentially stable across renders (React guarantee). The page functions (`selectAllMatching`, `bulkEnrichSelected`, `bulkFindMobile`, `bulkMergeSelected`, `restoreContacts`, `scoreAllContacts`, the §4 extractions) are defined in component scope; to keep them stable they are wrapped where needed (the §4 helpers are `useCallback`; the existing handlers are already function declarations whose identity does not matter because we read live state via refs, not via the closure). Live *values* (`selectedRows`, `contacts`, `scoringAll`) are read through refs. This makes the action **id set** stable, so CLE-03's `useRegisterPageActions` (keyed on `actions.map(a=>a.id).join("|")`, CLE-03 §2.3) does not re-register on every selection/list change — exactly the pattern CLE-03 designed for (same justification as CLE-06 §3.1). `fileRef` is a `useRef` (stable).

### 3.2 Detail page — `contactDetailActions`

```ts
const contactRef = useRef(contact);
useEffect(() => { contactRef.current = contact; });
const activitiesRef = useRef(activities);
useEffect(() => { activitiesRef.current = activities; });
// reviewCallIntel is the §4 page-level helper that POSTs to /api/call-intel/review
// (the same endpoint usePendingReview.act posts to — call-intel.tsx:73-93).

const contactDetailActions: PageAction[] = useMemo(() => [

  // ── updateField (inline edit) ──────────────────────────────
  {
    id: "contacts.updateField",
    title: "Edit a field on this contact",
    description:
      "Inline-edit the open contact's title, email, or phone. Use when the user wants to fix or set one of these.",
    params: z.object({
      id: z.string().min(1),
      field: z.enum(["title", "email", "phone"]),
      value: z.string(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ id, field, value }): Promise<PageActionResult> => {
      if (id !== contactId) return err("That contact is not the one open here.");              // E-1
      const okSaved = await updateField(field, value);                                         // :84-115 (optimistic + rollback + email regex)
      return okSaved
        ? ok('Updated ' + field + ' to "' + value.trim() + '".')
        : err(field === "email" ? "That doesn't look like a valid email address." : "Couldn't save that change.");   // page already toasted
    },
  },

  // ── reassignOwner ──────────────────────────────────────────
  {
    id: "contacts.reassignOwner",
    title: "Reassign this contact's owner",
    description: "Set or clear the member responsible for the open contact. Pass ownerId (or null to un-assign).",
    params: z.object({ id: z.string().min(1), ownerId: z.string().nullable() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ id, ownerId }): Promise<PageActionResult> => {
      if (id !== contactId) return err("That contact is not the one open here.");              // E-1
      await reassignContactOwner(ownerId);                                                     // :215-226 (optimistic PUT)
      return ok(ownerId ? "Reassigned the contact." : "Un-assigned the contact.");
    },
  },

  // ── call (outbound START; always confirm) ──────────────────
  {
    id: "contacts.call",
    title: "Call this contact",
    description:
      "Start a phone call to the open contact and take the user to the live softphone. This PLACES an outbound " +
      "call (always confirmed). It only STARTS the call — answering, hanging up, voicemail and in-call notes are " +
      "done by the user on the softphone, not by you.",
    params: z.object({ id: z.string().min(1) }),
    mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
    run: async ({ id }): Promise<PageActionResult> => {
      if (id !== contactId) return err("That contact is not the one open here.");              // E-1
      const name = [contactRef.current?.firstName, contactRef.current?.lastName].filter(Boolean).join(" ") || "the contact";
      const r = await startCallResult();                                                       // §4 thin wrapper around startCall (returns {ok,error})
      return r.ok ? ok("Calling " + name + " — taking you to the softphone.")
                  : err(r.error ?? "Couldn't start the call.");                                // E-10 surfaces the server code message
    },
  },

  // ── sendEmail (opens composer; not a send) ─────────────────
  {
    id: "contacts.sendEmail",
    title: "Draft an email to this contact",
    description:
      "Open the email composer pre-filled for the open contact. This OPENS the composer (does not send) — the " +
      "user reviews and sends. Optionally pass a draft {subject, body, to}.",
    params: z.object({
      id: z.string().min(1),
      draft: z.object({ subject: z.string().optional(), body: z.string().optional(), to: z.string().optional() }).optional(),
    }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ id, draft }): Promise<PageActionResult> => {
      if (id !== contactId) return err("That contact is not the one open here.");              // E-1
      const c = contactRef.current;
      const to = draft?.to ?? c?.email ?? "";
      if (!to) return err("This contact has no email address.");
      setEmailComposer({                                                                       // :74 / :283-294 — same composer the button opens
        to,
        subject: draft?.subject ?? "",
        body: draft?.body ?? ("Hi " + (c?.firstName || "there") + ",\n\n"),
        contactId,
      });
      return ok("Opened the email composer — review and send.");
    },
  },

  // ── suggestReply (opens composer from an inbound activity) ─
  {
    id: "contacts.suggestReply",
    title: "Suggest a reply to an inbound email",
    description:
      "Open the composer pre-filled as a reply to one of this contact's inbound emails (by activityId). " +
      "Opens the composer; the user edits and sends.",
    params: z.object({ id: z.string().min(1), activityId: z.string().min(1) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ id, activityId }): Promise<PageActionResult> => {
      if (id !== contactId) return err("That contact is not the one open here.");              // E-1
      const c = contactRef.current;
      const act = activitiesRef.current.find((a) => a.id === activityId);
      if (!act) return err("That activity isn't on this contact.");
      setEmailComposer({                                                                       // mirrors the "Suggest reply" onClick :340-351
        to: c?.email || "",
        subject: "Re: " + (act.summary?.slice(0, 50) || "your email"),
        body: "Hi " + (c?.firstName || "there") + ",\n\nThanks for your email. " +
          (act.summary ? 'Regarding "' + act.summary.slice(0, 80) + '..." — ' : "") + "\n\nBest regards",
        contactId,
      });
      return ok("Opened a suggested reply — edit and send.");
    },
  },

  // ── approveCallIntel / dismissCallIntel ────────────────────
  {
    id: "contacts.approveCallIntel",
    title: "Approve the call-intel proposal",
    description:
      "Apply the post-call qualification proposal pending on this contact (role/disposition captured from the last call). " +
      "Only works when a proposal is pending.",
    params: z.object({ id: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ id }): Promise<PageActionResult> => {
      if (id !== contactId) return err("That contact is not the one open here.");              // E-1
      if (!hasPendingCallProfile(contactRef.current)) return err("There's no pending call-intel proposal on this contact.");  // E-11
      const r = await reviewCallIntel("approve");                                              // §4 → POST /api/call-intel/review
      return r.ok ? ok("Applied the call-intel proposal to the contact.") : err(r.error ?? "Couldn't update the proposal.");
    },
  },
  {
    id: "contacts.dismissCallIntel",
    title: "Dismiss the call-intel proposal",
    description: "Dismiss the post-call qualification proposal pending on this contact. Only works when one is pending.",
    params: z.object({ id: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ id }): Promise<PageActionResult> => {
      if (id !== contactId) return err("That contact is not the one open here.");              // E-1
      if (!hasPendingCallProfile(contactRef.current)) return err("There's no pending call-intel proposal on this contact.");  // E-11
      const r = await reviewCallIntel("dismiss");
      return r.ok ? ok("Dismissed the call-intel proposal.") : err(r.error ?? "Couldn't update the proposal.");
    },
  },

  // eslint-disable-next-line react-hooks/exhaustive-deps
], [contactId]); // contactId for the id guard; contact/activities read via refs

useRegisterPageActions(contactDetailActions);
```

> `hasPendingCallProfile(contact)` is a tiny pure predicate (§4) that reads `contact?.properties?.callProfile` and returns whether a `pending` variant exists — the same signal `usePendingReview` uses to show its bar (`call-intel.tsx:69-71`). It lets the action fail cleanly (E-11) instead of POSTing a no-op review. The action ids stay `contacts.approveCallIntel`/`contacts.dismissCallIntel`; the detail page registers all seven detail actions (so on `/contacts/[id]` the manifest is exactly those seven, AC-1).

---

## 4. The pure extractions (the only edits to existing handlers — all behaviour-preserving)

Some handlers read component `useState` directly (`handleCreateContact` reads `createForm`; `performCascadeDelete` reads `cascadeTarget`; `startCall` toasts + navigates; the call-intel review lives inside a component hook). To call them from `run` with explicit args **without duplicating logic**, extract the network body into a small `useCallback` that both the existing handler and the `run` call. Each extraction is a **pure move** (same fetch URL, same body shape, same refetch) — the button/setter/checkbox path is rewired to call the extraction so there is exactly one copy.

| Extraction (new, `useCallback`/pure) | Body (lifted verbatim from) | Old caller rewired to use it |
|---|---|---|
| `submitCreateContact(input)` → `{ ok; error? }` | the `POST /api/contacts` + `refetchLoadedContacts()` from `handleCreateContact` `:331-340` | `handleCreateContact` builds `input` from `createForm`, calls `submitCreateContact`, keeps `setShowCreate(false)`/`setCreateForm(reset)`/`toast` |
| `deleteSelectedContacts(cascade)` → `{ ok; deleted; error? }` | the per-id `DELETE /api/contacts/${id}` waves + counters from `performCascadeDelete` `:431-470`, driven off the **current selection** (not the modal's `cascadeTarget`) | `openBulkCascadeDelete`/`performCascadeDelete` keep the modal UX; the action calls `deleteSelectedContacts(cascade)` directly on `selectedRows` (it does not need the modal's count-preview). *(See note below — the action bypasses the count-preview modal because CLE-05's confirm card is the agent's confirmation surface.)* |
| `startCallResult()` → `{ ok; error? }` | the `POST /api/calls/start` + error-code mapping from `startCall` `:124-137` (returns `{ok:false,error:<message>}` instead of toasting), and on success `router.push("/call-mode")` | `startCall` calls `startCallResult()`, keeps its `setDialing`/toast for the human-button path |
| `reviewCallIntel(action)` → `{ ok; error? }` | a new page-level `POST /api/call-intel/review { entityType:"contact", entityId:contactId, action }` — the **same** request `usePendingReview.act` issues (`call-intel.tsx:77-81`) | only the two call-intel actions use it; the card keeps its own `act` (the page action is a second caller of the same REST contract, §1.2) |
| `hasPendingCallProfile(contact)` → boolean | new tiny pure predicate over `contact?.properties?.callProfile` (mirrors the `usingPending` signal `call-intel.tsx:69-71`) | only the two call-intel actions use it |
| `describeContactFilters(params)` → string | new tiny pure formatter for the `applyFilter` summary (no existing equivalent) | only `applyFilter` uses it |

`setColumnFilters`, `setSearchQuery`, `selectAllMatching`, `bulkEnrichSelected`, `bulkFindMobile`, `bulkMergeSelected`, `restoreContacts`, `scoreAllContacts`, `setShowSmartImport`, `fileRef.current?.click()`, `updateField`, `reassignContactOwner`, and `setEmailComposer` are already callable as-is — **no extraction needed**; the `run`s call them directly.

> **The `bulkDelete` modal decision.** The human flow is: select → bulk-bar "Delete" → `openBulkCascadeDelete` opens the `<CascadeDeleteModal>` with live related-counts → the user ticks cascade keys → `performCascadeDelete`. For the agent path, CLE-05's confirm card is **already** the confirmation surface (`confirm:"always"`), and the `cascade` keys come as params — so re-opening the count-preview modal would be a *second* confirmation. The chosen design: `bulkDelete.run` calls `deleteSelectedContacts(cascade)` (the §4 extraction of the per-id delete loop), which performs exactly the same `DELETE /api/contacts/:id { cascade }` requests `performCascadeDelete` issues, on the live `selectedRows`, **without** the modal. The human's button still opens the modal (unchanged). This keeps one copy of the delete loop and one confirmation for the agent (the CLE-05 card), not two. *(If product later wants the agent to also surface the related-counts before deleting, that is a CLE-05 card-enrichment, not a CLE-08 change.)*

> **Verification of behaviour-preservation (AC-13):** after each extraction, the button/setter/checkbox path must produce byte-identical network calls and UI. The test for each action asserts the same `fetch` URL+body the page sent before; a snapshot/grep confirms the URL string appears **once** in the file.

---

## 5. Data flow (model → tool → directive → confirm gate → existing handler → page)

```
 user: "select all CTOs and find their mobiles"   (on /contacts)
        │
        ▼ POST /api/chat  body.pageActions = getActionManifest()  (CLE-03 dock)
 ┌─────────────────────────── SERVER (CLE-04) ───────────────────────────┐
 │ model calls listPageActions() → sees contacts.* for THIS page          │
 │ model calls invokePageAction("contacts.applyFilter", {title:["CTO"]})  │  (confirm:never → execute)
 │ model calls invokePageAction("contacts.selectAll", {})                 │  (confirm:never → execute)
 │ model calls invokePageAction("contacts.bulkFindMobile", {})            │
 │   • entry found; jsonSchemaToZod.safeParse ok                          │
 │   • decideAction({mutating:true,cost:"credits",confirm:"risky",role})  │
 │        → confirm  →  requireConfirm = true                             │
 │   • return { ...invokeActionDirective(uuid, id, params, true) }        │
 └───────────────────────────────────┬────────────────────────────────────┘
                                      │ tool result carries _uiDirective
                                      ▼
 ┌────────────────────── CLIENT (CLE-03 + CLE-05) ───────────────────────┐
 │ applyFilter/selectAll (requireConfirm:false) → run immediately:        │
 │     setColumnFilters(...) → list re-fetches; selectAllMatching() runs   │
 │ bulkFindMobile (requireConfirm:true) → CLE-05 confirm card             │
 │     ("Uses credits" badge from cost:"credits")                         │
 │   user Approves → runRegisteredAction("contacts.bulkFindMobile", {})    │
 │        → registry resolves to OUR run() (CLE-08)                        │
 │            • selectedRef.current.size > 0                               │
 │            • bulkFindMobile()  ◀── existing handler :553-582            │
 │                 → POST /api/contacts/fullenrich-enrich {contactIds}     │
 │            • returns ok("Searching mobiles for 57 contacts …")         │
 │   → encodeActionResult(uuid, result) → chat.sendMessage("[[action-result]]…")
 └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼  the list filtered + selected + deep-enrich firing, visibly
 next POST /api/chat carries the envelope → model reads ok+summary → "Done — searching 57 mobiles."
```

For **`contacts.openImport`** (`confirm:"never"`), `decideAction → execute → requireConfirm:false`, so CLE-03 runs it immediately: `fileRef.current?.click()` opens the OS dialog and the action returns "picker open — pick a file". **No upload happens** until the human selects a file (the file-picker boundary, §2). For **`contacts.call`** (`outbound:true`, `confirm:"always"`), `decideAction → confirm`, so CLE-05 shows a card (badge: "Sends externally"); on approve, `startCallResult()` → `POST /api/calls/start` → `router.push("/call-mode")`.

---

## 6. Failure handling (every branch returns a `PageActionResult`; nothing throws)

| Failure | Where caught | Result |
|---|---|---|
| Empty selection (bulkEnrich/bulkFindMobile/bulkDelete/bulkRestore) | `selectedRef.current.size === 0` (§3.1) | `{ ok:false, summary:"Select some contacts first." }`; no network call (E-3). |
| `bulkMerge` with <2 | `selectedRef.current.size < 2` (§3.1) | `{ ok:false, summary:"Select at least 2 contacts to merge." }`; no navigation (E-4). |
| Unknown `score` grade (applyFilter) | the `z.enum` on `score` (§3.1) | client+server schema reject `{ ok:false, error }`; no `setColumnFilters` (E-2). |
| `createContact` with neither firstName nor email | `!p.firstName?.trim() && !p.email?.trim()` (§3.1) | `{ ok:false, error:"First name or email required." }`; no POST (E-6). |
| `scoreAll` re-entrancy | `scoringRef.current` true (§3.1) | `{ ok:false, summary:"A scoring run is already in progress." }`; no POST (E-9). |
| Wrong `id` (any detail action) | `id !== contactId` (§3.2) | `{ ok:false, error:"That contact is not the one open here." }`; no request (E-1). |
| Invalid email (updateField) | `updateField`'s own regex guard `[id]/page.tsx:92` returns `false` | `{ ok:false, error:"That doesn't look like a valid email address." }`; page already toasted; no PUT (AC-9). |
| `call` server rejection (no_phone/dnc/quiet_hours/voice_not_configured) | the error-code mapping in `startCallResult` (§4, lifted from `:131-135`) | `{ ok:false, error:<page message> }`; no navigation (E-10). |
| `sendEmail`/`suggestReply` with no email / unknown activity | the `to`/`act` guards (§3.2) | `{ ok:false, error }`; composer not opened. |
| No pending call-intel proposal | `hasPendingCallProfile` false (§3.2) | `{ ok:false, summary:"There's no pending call-intel proposal on this contact." }`; no review POST (E-11). |
| Server bulk/POST/PUT/DELETE non-OK | the existing handler's own non-OK branch (toasts) + the §4 extractions return `{ok:false,error}` | `{ ok:false, error }`; optimistic state rolled back by the existing handler where applicable. |
| `openImport`/`openSmartImport` — model tries to pass a file | no file field exists in `z.object({})` (§3.1) | params reject any extra field at the schema; even valid `{}` only opens the picker/modal — upload unreachable (E-7 / §2). |
| Action invoked off-page | CLE-04 `invokePageAction` unknown-id refusal; CLE-03 `runRegisteredAction` `action_not_registered` | refusal/error; no effect (AC-11 / E-5). Not CLE-08 code — inherited. |
| `run` throws unexpectedly | CLE-03 `runRegisteredAction` try/catch (CLE-03 §2.3 / E-7) | `{ ok:false, error:<msg> }` round-trips; chat loop intact. Our `run`s avoid throwing by construction; the safety net is upstream. |

---

## 7. Security

- **No new runnable surface, no new endpoints.** Every `run` calls an existing page handler that hits an existing API route the page already calls (`/api/contacts`, `/api/contacts/:id`, `/api/contacts/restore`, `/api/contacts/related-counts`, `/api/enrich-contacts`, `/api/contacts/fullenrich-enrich`, `/api/score-contacts`, `/api/calls/start`, `/api/call-intel/review`, `/api/contacts/merge` via navigation). The agent gets **exactly** the surface a human on these pages already has — parity by construction (README §1.1, CLE-03 §7 security). No `eval`, no DOM-by-vision.
- **The file-picker boundary is structural, not a check.** `openImport`/`openSmartImport` have no file param and only open a surface; the upload routes (`/api/import`, `/api/import/smart/preview`) are unreachable from the registry (§2, E-7). The agent cannot read or submit a local file — that capability simply does not exist in the PAR. This is the README §2 human-bound exclusion realized as *absence of mechanism*.
- **Params validated twice.** Client-side against the action's live Zod schema in `runRegisteredAction` (CLE-03 §2.3) and server-side against the manifest JSON Schema in `invokePageAction` (CLE-04 §2.4). `field`/`linkedin`/`phone`/`score` enums and `id` non-empty are enforced before any handler runs.
- **Credits gating.** `bulkEnrich`/`bulkFindMobile` are `cost:"credits"` → CLE-05 renders a "Uses credits" badge and an editable card (`confirm:"risky"` → `decideAction` → confirm) **before** any spend; a viewer is refused outright (`mutating:true`). The actual credit accounting is unchanged — it stays in the existing endpoints (`/api/enrich-contacts`, `/api/contacts/fullenrich-enrich`); the action adds no new spend path, only routes through the same one behind a confirmation.
- **Outbound gating (`call`).** `contacts.call` is `outbound:true` + `confirm:"always"` → `decideAction` forces a confirm card (badge "Sends externally") regardless of approval mode; a viewer is refused. The call itself is started by the existing `/api/calls/start` route, which already enforces DNC / quiet-hours / voice-config (the `data.code` branches, `[id]/page.tsx:131-135`) — the action surfaces those rejections, it does not bypass them. Placing/answering/hanging-up the live call is **device/human-bound and excluded** (README §2).
- **Tenant isolation unchanged.** The reused API routes are the same tenant-scoped endpoints (`WHERE tenantId` app-layer, as the pages already rely on). The actions add no DB access of their own.
- **Role gating via `decideAction` (CLE-04 §2.1).** A viewer invoking any `mutating`/`outbound` action (`bulkEnrich`/`bulkFindMobile`/`bulkDelete`/`bulkRestore`/`scoreAll`/`createContact`/`updateField`/`reassignOwner`/`call`/`approveCallIntel`/`dismissCallIntel`) is **refused** inside `invokePageAction`. A viewer can still drive the read-only/open-only actions (`applyFilter`/`smartSearch`/`selectAll`/`openImport`/`openSmartImport`/`sendEmail`/`suggestReply`) — they mutate nothing and send nothing. No extra gating code in CLE-08; it inherits the plane.
- **Destructive `bulkDelete` is `confirm:"always"`** → always a card, regardless of approval mode. The agent path deliberately does **not** re-open the count-preview modal (§4) — the CLE-05 card is the single confirmation, and `cascade` is an explicit, enum-bounded param.

---

## 8. Test strategy

Unit/RTL with **vitest** + **@testing-library/react** (the pattern CLE-03/05/06 tests use). Mock `fetch`; spy the existing handlers/setters; assert `run → effect → result`. No live server except eval step 17.

- **`contacts-actions.list.test.tsx`** — mount a harness rendering the list page (or a thin extraction of `contactListActions` built against fixture `contacts`/`selectedRows` + spied setters):
  - **manifest membership + metadata** (AC-1): ids present; `bulkDelete.confirm==="always"`, `applyFilter.confirm==="never"`, `bulkEnrich.cost==="credits"`+`confirm==="risky"`, `bulkFindMobile.cost==="credits"`, `openImport.mutating===false`+`confirm==="never"`, `openSmartImport.mutating===false`, `scoreAll.mutating===true`, `bulkMerge.confirm==="risky"`. Detail ids absent.
  - **applyFilter** (AC-2/E-2): `setColumnFilters` chip shape for title/industry/score; summary names filters; unknown grade → schema reject, no setter.
  - **smartSearch** (AC-3): `setSearchQuery` with the query; empty → cleared.
  - **selectAll** (AC-4): `selectAllMatchingIds` spied / `selectAllMatching` called; count summary; NL-filter fallback summary.
  - **bulkEnrich + bulkFindMobile** (AC-5/E-3): with selection → the `/api/enrich-contacts` (chunked) / `/api/contacts/fullenrich-enrich` calls; empty → `ok:false` no call; `cost:"credits"` asserted.
  - **bulkMerge** (AC-6/E-4): ≥2 → `router.push("/contacts/merge?ids=…")`; <2 → `ok:false` no push.
  - **bulkDelete + bulkRestore** (AC-7/E-8): `confirm:"always"`; per-id DELETE with cascade via `deleteSelectedContacts`; default cascade `[]`; bad key rejected; restore POST; empty → `ok:false`.
  - **scoreAll + createContact** (AC-8/E-6/E-9): score POST + re-entrancy guard; create mapped POST + refetch; neither firstName nor email → no POST.
  - **the REQUIRED human-bound named test** (AC-10/E-7): spy `fileRef.current.click` + `global.fetch`; `openImport()` → `click()` once **and `fetch("/api/import")` NEVER called**; `openSmartImport()` → `setShowSmartImport(true)`, no `/api/import/smart/preview` fetch; both `mutating:false`.
  - **edge guards**: empty-selection bulk (E-3), <2 merge (E-4), unknown grade (E-2), scoreAll re-entrancy (E-9).
- **`contacts-actions.detail.test.tsx`** — mount the detail harness with a fixture `contact`/`activities`:
  - manifest = the seven detail ids (AC-1); list-only ids absent.
  - **updateField + reassignOwner** (AC-9/E-1): PUT bodies via the page handlers; invalid email → `ok:false` no PUT; wrong id → `ok:false`.
  - **the REQUIRED confirm test — `call`** (AC-12/E-10): assert `call.confirm==="always"`+`outbound:true`+`reversible:false`; run → confirm gate then `POST /api/calls/start` + `router.push("/call-mode")`; `code:"no_phone"` → `ok:false` no push; wrong id → `ok:false`.
  - **sendEmail + suggestReply**: `setEmailComposer` called with the right draft; `mutating:false`; no send; wrong id / unknown activity → `ok:false`.
  - **approveCallIntel + dismissCallIntel** (E-11): with a pending `callProfile` → `POST /api/call-intel/review {action}`; no pending → `ok:false`.
- **`contacts-actions.dedup.test.ts(x)`** — assert (by spying `global.fetch` / `router.push`) that the **button/setter/checkbox path** and the **action path** issue the same URL+body for enrich / find-mobile / delete / restore / score / create / calls-start / review, and the same `router.push` for merge — proving one shared implementation (AC-13). Plus a static check (or review note) that each fetch URL string appears once per file.
- **off-page degradation** (AC-11/E-5): reuse CLE-03's lifecycle test shape — unmount the list page, assert ids gone + `runRegisteredAction("contacts.bulkEnrich",…)` → `action_not_registered`.
- **pure-helper units**: `describeContactFilters` (readable, emoji-free), `hasPendingCallProfile` (true only when `callProfile.pending` exists), the §4 extractions' body shapes.
- **Regression:** `pnpm tsc --noEmit` 0; `regression.sh` green; CLE-03/04/05 tests untouched; the pages' manual flows (filters, search, select-all, bulk bar, import button, create modal, inline edit, call, composer) verified unchanged by the dedup tests (same network shape) + eval step 17.

Coverage target: 100% of the new `run` branches (each error path + happy path) and the §4 extractions. No new runtime dependency. No new API route.
