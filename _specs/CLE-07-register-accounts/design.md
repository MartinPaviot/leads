# CLE-07 — Register the `/accounts` page actions (list + detail) — Design

> Implements the **consumption** side of README §3.2 (`PageAction`) and §3.3 (`useRegisterPageActions`) for the accounts pages. It introduces **no** new contract and **no** new framework code; it declares `PageAction[]`s whose `run`s call handlers that already exist (cited file:line below) and calls the CLE-03 hook. The metadata each action carries is what CLE-04's `decideAction` reads to set `requireConfirm`, and what CLE-05's confirm card renders.
> Builds on: `_specs/CLE-03-action-directive-and-registry/design.md` (the `PageAction`/`PageActionResult` types §2.2, `useRegisterPageActions`/`runRegisteredAction` §2.3), `_specs/CLE-04-page-action-tools/design.md` (`decideAction` §2.1 maps our `confirm`/`mutating`/`reversible`/`cost`/`outbound` → a disposition; the manifest is read by `listPageActions`), `_specs/CLE-05-action-confirmation-ux/design.md` (the editable confirm card rendered when `requireConfirm:true`; the risk badge from `cost`/`outbound`). Same shape as `_specs/CLE-06-register-opportunities/design.md` (the pilot) and `_specs/CLE-08-register-contacts/design.md` (the sibling list page).
> Real code anchored: `app/apps/web/src/app/(dashboard)/accounts/page.tsx` (list, 2828 lines) and `.../accounts/[id]/page.tsx` (detail, 504 lines), plus `app/apps/web/src/app/(dashboard)/accounts/_persona-search.tsx` (the NL→ICP modal), `components/company-dossier.tsx` (the dossier card) and `components/call-intel.tsx` (the call-intel review path).

---

## 1. System fit — the handlers we reuse (file:line)

The whole feature is a thin declarative layer over functions that already exist. **Nothing below is re-implemented**; the `run` closures call these.

### 1.1 List page — `app/apps/web/src/app/(dashboard)/accounts/page.tsx`

| Concern | Existing handler / state (file:line) | What it does today | Action that reuses it |
|---|---|---|---|
| Source tab | `filter`/`setFilter` `:158`; the tab buttons `:1713-1714`; `tabCounts` `:1478` | `all` / `tam` (Sourced) / `manual` (Added) partition; runs server-side via `serializeAccountFilters` `:518` | `accounts.applyFilter` (sourceTab) |
| Enrichment partition | `enrichmentFilter`/`setEnrichmentFilter` `:162`; the partition buttons `:1755`; `→ fEnriched` param `:519-520` | isolates unenriched / enriched accounts | `accounts.applyFilter` (enrichmentPartition) |
| Column filters (9) | `columnFilters`/`setColumnFilters` `:166`; `<ColumnFilter onChange>` (per-header); the `ENUM_PARAM`/`TEXT_PARAM` map `:521-525`; the debounce→server effect (`debouncedColumnFilters` `:170`); the clear-all `:1780` | client filter state → server fetch `/api/accounts` across ALL accounts | `accounts.applyFilter` (industry/geography/size/revenue/stage/score + name/domain/linkedin) |
| Smart search (NL→filters) | the `<SmartSearchBar resourceType="account" onFilters>` `:1796-1812` → `setSmartFilters`/`setSmartMeta` `:228-229,1803-1804`; the text `searchQuery`/`setSearchQuery` `:198,1799` (debounced server search) | NL query → `FilterCondition[]` + an industry-aware text search | `accounts.smartSearch` |
| View toggles | the Excluded toggle `:1593` (`setSelectedRows(new Set()); setViewDeleted(false); setViewExcluded(v=>!v)`); the Archive toggle `:1599` (`setViewExcluded(false); setViewDeleted(v=>!v)`); "Back to active" `:1663` (both false); `viewExcluded` `:213`, `viewDeleted` `:216` | active / excluded ("not a fit") / archive (soft-deleted) views | `accounts.setView` |
| Select all matching | `selectAllMatching()` `:1081-1097` → `selectAllMatchingIds` `?idsOnly=true` (`lib/infra/select-all-matching.ts:26`); `selectedRows`/`setSelectedRows` `:210`; `filteredAccounts` `:1457`; the cap toast `:1094-1096`; the residual-NL-filter early-out `:1084` | selects every row the active view+filters match (up to the server id cap) | `accounts.selectAll` |
| Bulk enrich (credits) | `runEnrich(criteria, ids)` `:278-294` (`useCallback`) → `enrichStream.start` (chains 100-id batches); the bulk-bar `EnrichMenu onEnrich` `:1522`; the "Nothing to enrich" early-return `:284-287` | streaming criteria enrich over the selection | `accounts.bulkEnrich` / `accounts.enrichAccount` |
| Bulk score | `bulkScoreSelected()` `:785-808` (`chunkedBulkCall` → `/api/score`, `companyIds`); reads `selectedRows` `:787`; partial-failure summary `:798-802` | scores the selection (or unscored when none) | `accounts.bulkScore` / `accounts.scoreAccount` |
| Bulk detect signals | `detectSignals()` `:865-892` (`chunkedBulkCall` → `/api/signals`); filters to the *enriched* subset `:866` (`isEnriched` `:1268`) | detects signals over enriched accounts | `accounts.bulkDetectSignals` |
| Bulk extract contacts (credits) | `extractContactsSelected()` `:896-940` (`POST /api/accounts/extract-contacts`, **50-id fan-out** `:908`); reads `selectedRows` `:897`; created-contacts summary `:926-933` | sources real contacts (Apollo) for the selection | `accounts.bulkExtractContacts` |
| Bulk exclude / restore-from-excluded | `bulkSetExclusion("exclude"\|"include")` `:1027-1052` (`chunkedBulkCall`, **500-id chunks** → `/api/accounts/exclude`); reads `selectedRows` `:1028`; summaries `:1044-1049` | mark "not a fit" / un-exclude | `accounts.bulkExclude` / `accounts.bulkRestore` (Excluded view) |
| Bulk restore-from-archive | `restoreAccounts(ids)` `:1101-1121` (`POST /api/accounts/restore { ids }`); the bulk-bar contextual Restore `:1543-1556` (Archive→`restoreAccounts`, Excluded→`bulkSetExclusion("include")`) | un-delete from the Archive view | `accounts.bulkRestore` (Archive view) |
| Single-row exclude / restore | `rowSetExclusion(id, action)` `:1054-1071` (`POST /api/accounts/exclude { ids:[id], action }`) | per-row not-a-fit / restore | `accounts.excludeAccount` |
| Bulk / single delete (cascade) | `openCascadeDelete(ids, label)` `:1128-1158` (loads related counts) → `performCascadeDelete(selectedKeys)` `:1176-1205` (`DELETE /api/accounts/batch { ids, cascade }`, soft-delete, `refetchLoadedAccounts`); `openBulkCascadeDelete()` `:1162` (selection→label); `cascadeTarget` state `:187` | soft-delete account(s) + optional related rows | `accounts.bulkDelete` / `accounts.deleteAccount` |
| Send to Call Mode | the bulk-bar Call Mode action `:1535-1542` (`window.location.href = "/call-mode?accounts=<ids>"`) | open the softphone seeded with the selection | `accounts.sendToCallMode` |
| TAM build (credits) | `startTamBuild()` `:460-482` (`useCallback`) → `tamStream.start(BuildRequest)` (`hooks/use-tam-stream.ts`, `BuildRequest` `lib/tam-stream/events.ts`); the `sourceIcpId`/`sourceProfiles` branching `:471-481`; loaded usable profiles `:441-457`; the "Find more accounts" button `:1673` | streams new sourced accounts from an ICP profile | `accounts.startTamBuild` |
| Persona search (NL→ICP) | `setShowPersona(true)` `:206,1610,1693`; `<PersonaSearch onClose onSaved>` `:1693` (the modal owns `parse`/`save`, `_persona-search.tsx:67,157-178`) | open the "describe your ideal accounts" modal; the modal's own Save `POST /api/icp/apply` | `accounts.openPersonaSearch` (+ optional `accounts.personaSearch`) |
| List lookup (validation) | `accounts` state `:148`; `filteredAccounts` `:1457`; `totalAccounts` `:151`; `sourceProfiles` `:441` | the loaded list + counts + usable ICP profiles | E-1/E-6 guards; `selectAll` cap; `startTamBuild` icpId validation |

> **All bulk handlers read `selectedRows` directly** (`:787,:897,:1028`, and `performCascadeDelete` reads `cascadeTarget` `:1177`). To let a `run` pass an explicit id set (so the agent can act on `selectAll`'s resolved set, or a caller-supplied `accountIds`) **without duplicating logic**, §4 extracts each network body into a `useCallback` that both the existing handler and the `run` call. `runEnrich` and `startTamBuild` are already `useCallback` (stable, args-driven) — no extraction needed; the `run`s call them directly.

### 1.2 Detail page — `app/apps/web/src/app/(dashboard)/accounts/[id]/page.tsx`

| Concern | Existing handler (file:line) | What it does | Action |
|---|---|---|---|
| Inline field edit | the `PUT /api/accounts/${accountId}` inside the field `onKeyDown` `:368-382` (5 fields: name/domain/industry/size/revenue `:351-357`); optimistic `setAccount` `:375` | edit one firmographic field | `contacts`-style `accounts.updateField` (via the extracted `saveField`, §4) |
| Reassign owner | `reassignAccountOwner(ownerId)` `:81-92` — optimistic; `PUT /api/accounts/${accountId} { ownerId }` | change the responsible member | `accounts.reassignOwner` |
| Refresh AI summary | the `POST /api/accounts/${accountId}/generate-summary` inside the refresh-button `onClick` `:162-182`; sets `aiSummary`/`aiHowTheyMakeMoney` `:170-171` | regenerate the AI account summary | `accounts.refreshSummary` (via the extracted `refreshSummary`, §4) |
| Generate dossier | `generateDossier()` inside `<CompanyDossier>` `:124-145` (`POST /api/research/dossier { company: accountDomain }`); the no-domain guard `:94-97,124-125,173` | build the research dossier | `accounts.generateDossier` (via a lifted callback, §2) |
| Approve / dismiss call intel | `act("approve"\|"dismiss")` inside `usePendingReview` (`components/call-intel.tsx:73-93`, `POST /api/call-intel/review { entityType:"company", entityId, action }`); the page renders `<AccountCallIntel properties={account.properties} entityId={accountId} />` `:268`, which self-extracts `properties.callIntel` (live) / `pendingCallIntel` (pending) | apply / dismiss the account-level post-call proposal | `accounts.approveCallIntel` / `accounts.dismissCallIntel` (via the §4 helper) |
| Open-account identity | `accountId = params.id` `:42`; `account` state `:43` | the single account this page shows | E-9 id guard; summary/dossier/intel guards |

> **The call-intel + dossier decision (the one non-trivial reuse).** Neither Approve/Dismiss nor Generate-dossier is a page-level handler today: Approve/Dismiss lives inside the `usePendingReview` hook that `<AccountCallIntel>` owns (`call-intel.tsx:57-96`), and `generateDossier` lives inside `<CompanyDossier>` (`company-dossier.tsx:124-145`). The detail page only *renders* these cards; it owns no function we can call. **This is the CLE-08 call-intel situation** (a display component with no page handler), and the resolution is the same, with the page-knowable seam each card exposes:
> - **Call intel** → CLE-08 §1.2's resolution exactly: add a tiny page-level helper `reviewCallIntel(action)` that POSTs to the **same** endpoint the card posts to (`/api/call-intel/review { entityType:"company", entityId:accountId, action }`, §4) — reusing the *endpoint contract* the card already calls, not duplicating any business logic (the server owns the live-vs-pending merge). The card keeps its own Approve/Dismiss buttons; the page action is a second caller of the same REST contract. A pure predicate `hasPendingCallIntel(account)` lets the action fail cleanly (E-10) instead of POSTing a no-op. (Alternative considered and rejected, identical to CLE-08: thread a callback into `<AccountCallIntel>` so the action drives the card's own `act` — it would require lifting `usePendingReview` state into the page and coupling the action's lifetime to the card's render. Recorded; v1 ships the helper.)
> - **Dossier** → `generateDossier` is *only* a `POST /api/research/dossier { company: domain }` (`company-dossier.tsx:129-133`) — no live-vs-pending merge, no in-component state the action needs. The cleanest reuse that also refreshes the visible card is a **lifted callback**: `<CompanyDossier>` gains an optional `onRegister?: (api: { generate: () => Promise<void>; hasDomain: boolean }) => void` prop; the component registers its own `generateDossier` (the existing function, unchanged) + a `hasDomain` flag on mount via a ref; the page captures it into a `dossierApiRef` and `accounts.generateDossier.run` calls `dossierApiRef.current?.generate()`. This drives the card's *own* tested handler (so the spinner/poll/refresh stay identical) — zero duplication, and the agent path and the button path are the same function. (Alternative considered: a page-level `POST /api/research/dossier` second caller, like call-intel — rejected for the dossier because, unlike the review endpoint, a second caller would NOT refresh the rendered card, so the user wouldn't *see* it, defeating the "live on the page" purpose; the lifted callback drives the card the user is looking at. Recorded; v1 ships the lifted callback.)

### 1.3 Where `useRegisterPageActions` is called

Each page declares its actions in a `useMemo` (stable array, ids constant) and registers them with a single hook call near the top of the component body, after the handlers it references are defined. The hook (CLE-03 §2.3) registers on mount, clears on unmount, so the manifest always reflects the current page (AC-1; CLE-03 AC-6).

- **List page:** at the end of the component's handler block (after `performCascadeDelete` `:1176`, and the §4 extractions, are defined — i.e. ~`:1207`, before the render `useMemo`s), add `useRegisterPageActions(accountListActions)` where `accountListActions` is the `useMemo` built in §3.1.
- **Detail page:** after `reassignAccountOwner` `:81` and the §4 extractions (`saveField`, `refreshSummary`, `reviewCallIntel`) are defined, add `useRegisterPageActions(accountDetailActions)` (§3.2).

> **Hook ordering constraint.** `useRegisterPageActions` is a hook → it must be called unconditionally at the top level of the component, **not** inside the early `if (loading) return …` / `if (!account) return …` branches on the detail page (`[id]/page.tsx:94-95`). The `run` closures capture the latest handlers via refs (§3), so an early return before data loads is fine: the actions are registered but their `run` guards on `account`/`accountId` being present (AC-1 / E-9). **Caveat (detail page):** the inline field-edit `PUT` (`:368-382`) and the summary-refresh `POST` (`:162-182`) currently live **inside JSX after** the `if (loading) return`/`if (!account) return` at `:94-95` (and the summary block only renders when `aiSummary || aiHowTheyMakeMoney`). The §4 extractions (`saveField`, `refreshSummary`) **hoist these network bodies into top-level `useCallback`s above the early returns**, so they are callable unconditionally by both the JSX handler and the `run`; the JSX is rewired to call them. `reassignAccountOwner` is already above the early returns (`:81`) — no move. `dossierApiRef`/the call-intel helper read live state via refs and are defined at the top level.

---

## 2. The cost / credits guardrail (the headline of this spec)

`/accounts` is the first PAR page with **cost-bearing** actions that create many rows. The guardrail is enforced **by metadata + `decideAction`**, three ways:

1. **`cost:"credits"` + `confirm:"always"` on the two spenders.** `accounts.bulkExtractContacts` (Apollo sourcing) and `accounts.startTamBuild` (TAM sourcing) carry `cost:"credits"` **and** `confirm:"always"`. `decideAction` (CLE-04 §2.1) returns `confirm` for `confirm:"always"` (step 5) **regardless of approval mode** — there is no mode (even `auto-high-confidence`) that lets them run silently. CLE-05 renders an editable confirm card whose badge reads **"Uses credits"** (`riskBadgesFor`, CLE-05 §5). The `save` branch of the optional `accounts.personaSearch` is likewise `confirm:"always"` (it overwrites the tenant ICP, which re-drives all sourcing).
2. **Scoped, reversible-by-irrelevance enrich is `confirm:"risky"`.** `accounts.bulkEnrich` / `accounts.enrichAccount` carry `cost:"credits"` + `confirm:"risky"` — they cost, but are scoped to the selection / one account and the page already skips already-enriched accounts (`runEnrich` `:284-287`). `decideAction` still returns `confirm` (step 5, reversible+risky → confirm), so the card shows with the "Uses credits" badge before any spend. They are not `confirm:"always"` because the spend is per-row-bounded, not a many-row create.
3. **No action here spends real money** (`cost:"money"`). Sourcing is paid in pre-bought credits, surfaced as `cost:"credits"`; buying a Twilio number (real money) lives on `/call-mode`, **not** `/accounts` (CLE-09). So there is no `outbound+cost:"money"` action on this page — see the final report's human-bound note.

> **The mode-independence is the required regression** (AC-12 / requirements §6 step 8 & 11): feeding `bulkExtractContacts`'s and `startTamBuild`'s scalars to `decideAction({ …, approvalMode:"auto-high-confidence", role:"member" })` must return `disposition:"confirm"`. The same scalars feed CLE-05's badge, so the "Uses credits" pill cannot drift from what the gate saw.

The non-mutating actions (`applyFilter` / `smartSearch` / `setView` / `selectAll` / `openPersonaSearch` / `sendToCallMode`) are `confirm:"never"` (pure client view-state or an internal navigation; no persistence, no spend) → `decideAction` → `execute` → no card. `bulkDelete` / `deleteAccount` are `confirm:"always"` (destructive, even though soft-delete is reversible). The remaining mutating-but-reversible server actions (`bulkScore` / `bulkDetectSignals` / `bulkExclude` / `bulkRestore` / `excludeAccount` / `updateField` / `reassignOwner` / `refreshSummary` / `generateDossier` / `approveCallIntel` / `dismissCallIntel`) are `confirm:"risky"` → `confirm` → CLE-05 cards them.

---

## 3. The exact `PageAction[]` arrays

Types imported from CLE-03: `import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types"; import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";` and `import { z } from "zod";`. `confirm`/`mutating`/etc. are the README §3.2 fields verbatim.

A small local helper keeps results uniform (not a contract — internal to each page):

```ts
const ok = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const err = (error: string, summary?: string): PageActionResult =>
  ({ ok: false, error, summary: summary ?? error });
```

### 3.1 List page — `accountListActions`

```ts
// Built with useMemo; the run()s read LIVE state via refs so the id set stays
// stable (CLE-03 keys registration by id list — a stable id set + ref-read params
// is the right pattern, identical to CLE-06 §3.1 / CLE-08 §3.1).
const selectedRef = useRef(selectedRows);
useEffect(() => { selectedRef.current = selectedRows; });
const accountsRef = useRef(accounts);
useEffect(() => { accountsRef.current = accounts; });
const totalRef = useRef(totalAccounts);
useEffect(() => { totalRef.current = totalAccounts; });
const viewRef = useRef({ excluded: viewExcluded, deleted: viewDeleted });
useEffect(() => { viewRef.current = { excluded: viewExcluded, deleted: viewDeleted }; });
const profilesRef = useRef(sourceProfiles);
useEffect(() => { profilesRef.current = sourceProfiles; });
const rescoringRef = useRef(rescoringAll);
useEffect(() => { rescoringRef.current = rescoringAll; });

const accountListActions: PageAction[] = useMemo(() => [

  // ── applyFilter (9 column filters + tab + enrichment partition) ────────
  {
    id: "accounts.applyFilter",
    title: "Filter the accounts list",
    description:
      "Apply the accounts list filters: source tab (all/sourced(tam)/added(manual)), enrichment partition " +
      "(all/unenriched/enriched), and the column filters — industry, geography, size, revenue, stage, score " +
      "grade (A+/A/B/C/D/F), name (text), domain (text), LinkedIn present/absent. Pass clear:true to reset " +
      "all filters. Replaces the current filter set; runs server-side across ALL accounts, not just the loaded page.",
    params: z.object({
      sourceTab: z.enum(["all", "tam", "manual"]).optional(),
      enrichmentPartition: z.enum(["all", "unenriched", "enriched"]).optional(),
      industry: z.array(z.string()).optional(),
      geography: z.array(z.string()).optional(),
      size: z.array(z.string()).optional(),
      revenue: z.array(z.string()).optional(),
      stage: z.array(z.string()).optional(),
      score: z.array(z.enum(["A+", "A", "B", "C", "D", "F"])).optional(),
      name: z.string().optional(),
      domain: z.string().optional(),
      linkedin: z.enum(["present", "absent"]).optional(),
      clear: z.boolean().optional(),
    }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (p): Promise<PageActionResult> => {
      if (p.clear) {
        setColumnFilters({}); setSmartFilters([]); setSmartMeta(null);            // the existing clear paths :1780,1957-1961
        setFilter("all"); setEnrichmentFilter("all"); setSearchQuery("");
        return ok("Cleared all filters.");
      }
      if (p.sourceTab) setFilter(p.sourceTab);                                     // :158
      if (p.enrichmentPartition) setEnrichmentFilter(p.enrichmentPartition);      // :162
      const next: Record<string, ColumnFilterState> = {};                         // shape = the page's columnFilters
      if (p.name) next.name = { text: p.name };
      if (p.domain) next.domain = { text: p.domain };
      for (const k of ["industry", "geography", "size", "revenue", "stage", "score"] as const) {
        const vals = p[k]; if (vals?.length) next[k] = { values: vals };
      }
      if (p.linkedin) next.linkedin = { presence: p.linkedin };
      if (Object.keys(next).length > 0) setColumnFilters(next);                    // same setter the <ColumnFilter> dropdowns call :166
      return ok("Filtered accounts by " + describeAccountFilters(p) + ".");        // §4 pure formatter; count is server-async (AC-2 / E-3)
    },
  },

  // ── smartSearch (NL → FilterCondition[] + industry-aware text) ─────────
  {
    id: "accounts.smartSearch",
    title: "Search accounts",
    description:
      "Type into the accounts search box — an industry-aware text match or a natural-language query " +
      "(e.g. 'SaaS in France, high fit'). Runs server-side across all accounts. Pass an empty query to clear it.",
    params: z.object({ query: z.string() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ query }): Promise<PageActionResult> => {
      const q = query.trim();
      if (!q) { setSearchQuery(""); setSmartFilters([]); setSmartMeta(null); return ok("Cleared the account search."); }
      // The SmartSearchBar resolves NL → FilterCondition[] via /api/search; reuse that
      // exact request path (§4 runSmartSearch), then apply via the bar's own callbacks.
      const r = await runSmartSearch(q);                                           // §4: POST the same body the bar sends (resourceType:"account")
      if (r.filters.length > 0) { setSmartFilters(r.filters); setSmartMeta(r.meta); }
      else { setSearchQuery(q); }                                                  // no structured filter → fall back to the text search
      return r.filters.length > 0
        ? ok("Applied " + r.filters.length + " smart filter" + (r.filters.length === 1 ? "" : "s") + " (" + (r.meta?.reasoning ?? "matched") + ").", { count: r.filters.length })
        : ok('Searched all fields for "' + q + '"; no structured filter applied.', { count: 0 });
    },
  },

  // ── setView (active / excluded / archived) ────────────────────────────
  {
    id: "accounts.setView",
    title: "Switch the accounts view",
    description:
      "Switch the accounts view: 'active' (working set), 'excluded' (accounts marked not a fit), " +
      "or 'archived' (soft-deleted accounts, restorable). Changes nothing persistent.",
    params: z.object({ view: z.enum(["active", "excluded", "archived"]) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ view }): Promise<PageActionResult> => {
      setSelectedRows(new Set());                                                  // exact toggle behaviour :1593-1599
      if (view === "excluded") { setViewDeleted(false); setViewExcluded(true); return ok("Showing accounts marked not a fit."); }
      if (view === "archived") { setViewExcluded(false); setViewDeleted(true); return ok("Showing the archive of removed accounts."); }
      setViewExcluded(false); setViewDeleted(false);
      return ok("Showing the active accounts.");
    },
  },

  // ── selectAll (honest cap) ────────────────────────────────────────────
  {
    id: "accounts.selectAll",
    title: "Select all matching accounts",
    description:
      "Select every account that matches the active view + filters (not just the loaded page), so a bulk " +
      "action can run on the whole set. Use before a bulk enrich/score/detect-signals/extract-contacts/" +
      "exclude/delete. The selection is capped at the server's id limit (up to 50,000) and reports honestly when capped.",
    params: z.object({ matchingCurrentFilter: z.literal(true) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (): Promise<PageActionResult> => {
      const beforeVisible = filteredAccountsRef.current.length;                    // ref mirror of filteredAccounts (§3 note)
      await selectAllMatching();                                                   // :1081-1097 — ticks visible, then resolves ?idsOnly=true ∪ visible
      const n = selectedRef.current.size;                                         // read live after the await
      // selectAllMatching toasts the honest cap (:1094) / NL-filter fallback (:1084); mirror it in the summary.
      const hasResidualNl = smartFiltersRef.current.some((c) => c.field !== "score");
      if (hasResidualNl && n === beforeVisible)
        return ok("Selected the " + n + " loaded account" + (n === 1 ? "" : "s") + " (a text/NL filter can't be resolved server-side, so only the loaded rows were selected).", { count: n });
      return ok("Selected " + n.toLocaleString() + " matching account" + (n === 1 ? "" : "s") + ".", { count: n });
    },
  },

  // ── bulkEnrich (credits) ──────────────────────────────────────────────
  {
    id: "accounts.bulkEnrich",
    title: "Enrich the selected accounts",
    description:
      "Enrich every currently-selected account (industry, description, size, etc.) via the streaming enrich. " +
      "Uses enrichment credits. Select accounts first (accounts.selectAll). Confirms before spending. " +
      "Optionally pass criteria (the fields to fill) and/or accountIds to override the selection.",
    params: z.object({ criteria: z.array(z.string()).optional(), accountIds: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "credits", confirm: "risky",
    run: async ({ criteria, accountIds }): Promise<PageActionResult> => {
      const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (ids.length === 0) return err("No accounts selected — select some first (or say 'select all matching').");   // E-1
      runEnrich(criteria ?? ["industry", "description"], ids);                     // :278-294 — itself skips already-complete (E-11)
      return ok("Enriching " + ids.length + " account" + (ids.length === 1 ? "" : "s") + "…", { count: ids.length });
    },
  },

  // ── bulkScore ─────────────────────────────────────────────────────────
  {
    id: "accounts.bulkScore",
    title: "Score the selected accounts",
    description:
      "Re-score the selected accounts for ICP fit. Select accounts first. Confirms first. " +
      "(For a whole-library re-score of every account against every profile, use the headless scoring tool — that is not this action.)",
    params: z.object({ accountIds: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountIds }): Promise<PageActionResult> => {
      const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (ids.length === 0) return err("No accounts selected — select some first (or say 'select all matching').");   // E-1
      const r = await scoreByIds(ids);                                            // §4 extraction of bulkScoreSelected's chunkedBulkCall
      return r.failed === 0
        ? ok("Scored " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + ".", { count: r.succeeded })
        : ok("Scored " + r.succeeded + " of " + r.total + "; " + r.failed + " failed.", { count: r.succeeded });
    },
  },

  // ── bulkDetectSignals ─────────────────────────────────────────────────
  {
    id: "accounts.bulkDetectSignals",
    title: "Detect signals for the selected accounts",
    description:
      "Detect buying/intent signals for the selected accounts (only the enriched ones are eligible). Confirms first.",
    params: z.object({ accountIds: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountIds }): Promise<PageActionResult> => {
      const base = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (base.length === 0) return err("No accounts selected — select some first (or say 'select all matching').");  // E-1
      const r = await detectSignalsByIds(base);                                   // §4 extraction of detectSignals — itself scopes to enriched (:866)
      return r.failed === 0
        ? ok("Detected signals for " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + ".", { count: r.succeeded })
        : ok("Detected signals for " + r.succeeded + " of " + r.total + "; " + r.failed + " failed.", { count: r.succeeded });
    },
  },

  // ── bulkExtractContacts (CREDITS, ALWAYS confirm) ─────────────────────
  {
    id: "accounts.bulkExtractContacts",
    title: "Extract contacts for the selected accounts",
    description:
      "Source real decision-maker contacts (from Apollo) for the selected accounts and add them. Uses credits " +
      "and can create many contacts. Select accounts first. ALWAYS confirms before spending.",
    params: z.object({ accountIds: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "credits", confirm: "always",
    run: async ({ accountIds }): Promise<PageActionResult> => {
      const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (ids.length === 0) return err("No accounts selected — select some first (or say 'select all matching').");   // E-1
      const r = await extractContactsByIds(ids);                                  // §4 extraction of extractContactsSelected (50-id fan-out)
      return r.totalCreated > 0
        ? ok("Added " + r.totalCreated + " contact" + (r.totalCreated === 1 ? "" : "s") + " across " + r.accountsProcessed + " account" + (r.accountsProcessed === 1 ? "" : "s") + ".", { created: r.totalCreated })
        : ok("No new contacts found for the selected accounts.", { created: 0 });
    },
  },

  // ── bulkExclude ───────────────────────────────────────────────────────
  {
    id: "accounts.bulkExclude",
    title: "Mark the selected accounts as not a fit",
    description: "Exclude the selected accounts ('not a fit'). Reversible (restore later). Confirms first.",
    params: z.object({ accountIds: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountIds }): Promise<PageActionResult> => {
      const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (ids.length === 0) return err("No accounts selected — select some first (or say 'select all matching').");   // E-1
      const r = await setExclusionByIds(ids, "exclude");                          // §4 extraction of bulkSetExclusion (500-id chunks)
      return r.succeeded === 0
        ? err("Couldn't exclude the accounts.")
        : ok("Marked " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + " as not a fit." + (r.failed > 0 ? " " + r.failed + " failed." : ""), { count: r.succeeded });
    },
  },

  // ── bulkRestore (view-dependent) ──────────────────────────────────────
  {
    id: "accounts.bulkRestore",
    title: "Restore the selected accounts",
    description:
      "Restore the selected accounts. In the Excluded view this un-excludes them; in the Archive view it " +
      "un-deletes them. Confirms first.",
    params: z.object({ accountIds: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountIds }): Promise<PageActionResult> => {
      const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (ids.length === 0) return err("No accounts selected — select some first.");                                 // E-1
      const { excluded, deleted } = viewRef.current;                              // read live view flags (E-7)
      if (deleted) { const r = await restoreAccountsResult(ids); return r.ok ? ok("Restored " + r.restored + " account" + (r.restored === 1 ? "" : "s") + ".") : err(r.error ?? "Couldn't restore."); }
      if (excluded) { const r = await setExclusionByIds(ids, "include"); return r.succeeded > 0 ? ok("Restored " + r.succeeded + " account" + (r.succeeded === 1 ? "" : "s") + ".") : err("Couldn't restore."); }
      return ok("Nothing to restore in this view.");                              // E-7 — neither special view
    },
  },

  // ── bulkDelete (DESTRUCTIVE, ALWAYS confirm) ──────────────────────────
  {
    id: "accounts.bulkDelete",
    title: "Delete the selected accounts",
    description:
      "Soft-delete the selected accounts (they move to the Archive and can be restored). Optionally cascade to " +
      "their contacts, deals, activities, notes, and/or tasks. ALWAYS confirms first.",
    params: z.object({
      accountIds: z.array(z.string()).optional(),
      cascade: z.array(z.enum(["contacts", "deals", "activities", "notes", "tasks"])).optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ accountIds, cascade }): Promise<PageActionResult> => {
      const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (ids.length === 0) return err("No accounts selected — select some first (or say 'select all matching').");   // E-1
      const r = await deleteAccountsByIds(ids, cascade ?? []);                    // §4 extraction of performCascadeDelete's DELETE /api/accounts/batch
      return r.ok
        ? ok("Moved " + r.deleted + " account" + (r.deleted === 1 ? "" : "s") + (r.extra > 0 ? " + " + r.extra + " related record" + (r.extra === 1 ? "" : "s") : "") + " to Archive.", { deleted: r.deleted })
        : err(r.error ?? "Failed to delete the accounts.");
    },
  },

  // ── sendToCallMode (navigation) ───────────────────────────────────────
  {
    id: "accounts.sendToCallMode",
    title: "Send the selected accounts to Call Mode",
    description: "Open Call Mode (the softphone) seeded with the selected accounts. Navigates; changes nothing persistent.",
    params: z.object({ accountIds: z.array(z.string()).optional() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ accountIds }): Promise<PageActionResult> => {
      const ids = accountIds?.length ? accountIds : Array.from(selectedRef.current);
      if (ids.length === 0) return err("No accounts selected.");                  // E-1
      window.location.href = "/call-mode?accounts=" + encodeURIComponent(ids.join(","));  // exact bulk-bar nav :1537-1541
      return ok("Opening Call Mode with " + ids.length + " account" + (ids.length === 1 ? "" : "s") + ".", { count: ids.length });
    },
  },

  // ── enrichAccount (single row, credits) ───────────────────────────────
  {
    id: "accounts.enrichAccount",
    title: "Enrich one account",
    description: "Enrich a single account by id (industry, description, etc.). Uses credits. Confirms first.",
    params: z.object({ accountId: z.string().min(1), criteria: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "credits", confirm: "risky",
    run: async ({ accountId, criteria }): Promise<PageActionResult> => {
      runEnrich(criteria ?? ["industry", "description"], [accountId]);            // :278-294
      return ok("Enriching the account…");
    },
  },

  // ── scoreAccount (single row) ─────────────────────────────────────────
  {
    id: "accounts.scoreAccount",
    title: "Score one account",
    description: "Re-score a single account by id for ICP fit. Confirms first.",
    params: z.object({ accountId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId }): Promise<PageActionResult> => {
      const r = await scoreByIds([accountId]);                                    // §4, scoped to one id
      return r.failed === 0 ? ok("Scored the account.") : err("Couldn't score the account.");
    },
  },

  // ── excludeAccount (single row) ───────────────────────────────────────
  {
    id: "accounts.excludeAccount",
    title: "Mark one account as not a fit (or restore it)",
    description: "Exclude a single account ('not a fit'), or restore:true to un-exclude it. Confirms first.",
    params: z.object({ accountId: z.string().min(1), restore: z.boolean().optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId, restore }): Promise<PageActionResult> => {
      await rowSetExclusion(accountId, restore ? "include" : "exclude");          // :1054-1071
      return ok(restore ? "Restored the account to the active list." : "Marked the account as not a fit.");
    },
  },

  // ── deleteAccount (single row, DESTRUCTIVE, ALWAYS confirm) ────────────
  {
    id: "accounts.deleteAccount",
    title: "Delete one account",
    description:
      "Soft-delete a single account by id (moves to the Archive, restorable). Optionally cascade to its " +
      "contacts/deals/activities/notes/tasks. ALWAYS confirms first.",
    params: z.object({
      accountId: z.string().min(1),
      cascade: z.array(z.enum(["contacts", "deals", "activities", "notes", "tasks"])).optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ accountId, cascade }): Promise<PageActionResult> => {
      const r = await deleteAccountsByIds([accountId], cascade ?? []);            // §4
      return r.ok ? ok("Moved the account to Archive.") : err(r.error ?? "Failed to delete the account.");
    },
  },

  // ── startTamBuild (CREDITS, ALWAYS confirm) ───────────────────────────
  {
    id: "accounts.startTamBuild",
    title: "Build a TAM (source new accounts)",
    description:
      "Source new accounts from your ICP and stream them into the list live. Pass icpId for one profile, " +
      "allProfiles:true for every usable profile, or neither for the tenant-wide planner. Uses sourcing " +
      "credits and creates many rows. ALWAYS confirms before sourcing.",
    params: z.object({ icpId: z.string().optional(), allProfiles: z.boolean().optional(), targetCount: z.number().optional() }),
    mutating: true, reversible: true, cost: "credits", confirm: "always",
    run: async ({ icpId, allProfiles, targetCount }): Promise<PageActionResult> => {
      if (icpId && !profilesRef.current.some((p) => p.id === icpId)) return err("No such ICP profile.");             // E-6
      await startTamBuildWith({ icpId, allProfiles, targetCount });               // §4 thin arg-driven wrapper around startTamBuild's BuildRequest
      return ok("Sourcing new accounts from your ICP — rows stream in live.");
    },
  },

  // ── openPersonaSearch (opens the NL→ICP modal) ────────────────────────
  {
    id: "accounts.openPersonaSearch",
    title: "Describe your ideal accounts (open the persona modal)",
    description:
      "Open the 'describe who you want to reach' modal so the user can phrase an ICP in natural language. " +
      "Opens the modal only; the user reviews and saves it there.",
    params: z.object({}),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (): Promise<PageActionResult> => {
      setShowPersona(true);                                                       // :206 — opens the modal ONLY
      return ok("Opened the persona search — describe your ideal accounts and save it there.");
    },
  },

  // eslint-disable-next-line react-hooks/exhaustive-deps
], []); // stable id set; run() reads live values via refs / stable setters

useRegisterPageActions(accountListActions);
```

> **Why `useMemo([], [])` is safe here.** State **setters** (`setColumnFilters`, `setFilter`, `setEnrichmentFilter`, `setSearchQuery`, `setSmartFilters`, `setSmartMeta`, `setViewExcluded`, `setViewDeleted`, `setSelectedRows`, `setShowPersona`) are referentially stable across renders (React guarantee). `runEnrich` and `startTamBuild` are `useCallback` (stable). The §4 extractions are `useCallback`. The existing handlers called directly (`selectAllMatching`, `rowSetExclusion`) are function declarations whose identity does not matter because the `run`s read live state via refs, not via the closure. Live *values* (`selectedRows`, `accounts`, `totalAccounts`, `viewExcluded`/`viewDeleted`, `sourceProfiles`, `filteredAccounts`, `smartFilters`) are read through refs (`selectedRef`, `accountsRef`, `totalRef`, `viewRef`, `profilesRef`, plus `filteredAccountsRef`/`smartFiltersRef` mirrors for `selectAll`). This makes the action **id set** stable, so CLE-03's `useRegisterPageActions` (keyed on `actions.map(a=>a.id).join("|")`, CLE-03 §2.3) does not re-register on every list/selection change — exactly the pattern CLE-03 designed for (same justification as CLE-06 §3.1 / CLE-08 §3.1).

> **Optional `accounts.personaSearch` (two-step, mutating on save).** Not in the headline set above (the modal is the user's review surface). If product wants the agent to also *save* a phrased ICP without the human clicking Save, declare a second action `accounts.personaSearch` `{ describe: string; save?: boolean }`, `mutating` only when `save`, `confirm:"always"` when `save` (it overwrites the tenant ICP → re-drives all sourcing) else `confirm:"never"`. Its `run` opens the modal pre-filled and, on `save`, calls the modal's own `save()` (`POST /api/icp/apply`, `_persona-search.tsx:157-178`) reached via a lifted callback identical to the dossier pattern (§2). v1 ships `openPersonaSearch` only; `personaSearch(save)` is the recorded extension, gated `confirm:"always"`.

### 3.2 Detail page — `accountDetailActions`

```ts
const accountRef = useRef(account);
useEffect(() => { accountRef.current = account; });
// saveField / refreshSummary / reviewCallIntel are the §4 page-level helpers
// (hoisted above the early returns); dossierApiRef captures the lifted
// <CompanyDossier> callback (§2).

const accountDetailActions: PageAction[] = useMemo(() => [

  // ── updateField (inline edit, 5 fields) ───────────────────────────────
  {
    id: "accounts.updateField",
    title: "Edit a field on this account",
    description:
      "Inline-edit the open account's name, domain, industry, size, or revenue. Use when the user wants to fix or set one of these.",
    params: z.object({
      accountId: z.string().min(1),
      field: z.enum(["name", "domain", "industry", "size", "revenue"]),
      value: z.string().nullable(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId, field, value }): Promise<PageActionResult> => {
      if (accountId !== accountIdConst) return err("That account is not the one open here.");      // E-9
      const r = await saveField(field, value);                                    // §4 extraction of the inline PUT :368-382
      return r.ok ? ok('Set ' + field + ' to "' + (value ?? "") + '".') : err(r.error ?? "Couldn't save that change.");
    },
  },

  // ── reassignOwner ─────────────────────────────────────────────────────
  {
    id: "accounts.reassignOwner",
    title: "Reassign this account's owner",
    description: "Set or clear the member responsible for the open account. Pass ownerId (or null to un-assign).",
    params: z.object({ accountId: z.string().min(1), ownerId: z.string().nullable() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId, ownerId }): Promise<PageActionResult> => {
      if (accountId !== accountIdConst) return err("That account is not the one open here.");      // E-9
      await reassignAccountOwner(ownerId);                                        // :81-92 (optimistic PUT)
      return ok(ownerId ? "Reassigned the account." : "Un-assigned the account.");
    },
  },

  // ── refreshSummary ────────────────────────────────────────────────────
  {
    id: "accounts.refreshSummary",
    title: "Refresh this account's AI summary",
    description: "Regenerate the AI summary for the open account. Confirms first.",
    params: z.object({ accountId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId }): Promise<PageActionResult> => {
      if (accountId !== accountIdConst) return err("That account is not the one open here.");      // E-9
      const r = await refreshSummary();                                          // §4 extraction of the inline POST :162-182
      return r.ok ? ok("Refreshed the account summary.") : err(r.error ?? "Couldn't refresh the summary.");
    },
  },

  // ── generateDossier (lifted callback) ─────────────────────────────────
  {
    id: "accounts.generateDossier",
    title: "Generate this account's research dossier",
    description:
      "Generate (or refresh) the research dossier for the open account — leadership, funding, tech stack, " +
      "competitive landscape, outreach recommendations. Needs a domain on the account. Confirms first.",
    params: z.object({ accountId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId }): Promise<PageActionResult> => {
      if (accountId !== accountIdConst) return err("That account is not the one open here.");      // E-9
      const api = dossierApiRef.current;
      if (!api || !api.hasDomain) return err("This account has no domain, so a dossier can't be generated.");        // E-10 (mirrors the card's no-domain guard :94-97)
      await api.generate();                                                       // drives <CompanyDossier>'s own generateDossier :124-145 (spinner+poll+refresh on the card)
      return ok("Generating the research dossier — it appears on the account shortly.");
    },
  },

  // ── approveCallIntel / dismissCallIntel ───────────────────────────────
  {
    id: "accounts.approveCallIntel",
    title: "Approve the account call-intel proposal",
    description:
      "Apply the post-call proposal pending on this account (stack / competitors / triggers captured from the last call). " +
      "Only works when a proposal is pending.",
    params: z.object({ accountId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId }): Promise<PageActionResult> => {
      if (accountId !== accountIdConst) return err("That account is not the one open here.");      // E-9
      if (!hasPendingCallIntel(accountRef.current)) return err("There is no pending call intel to approve.");        // E-10
      const r = await reviewCallIntel("approve");                                // §4 → POST /api/call-intel/review {entityType:"company",...}
      return r.ok ? ok("Applied the call intel to the account.") : err(r.error ?? "Couldn't update the proposal.");
    },
  },
  {
    id: "accounts.dismissCallIntel",
    title: "Dismiss the account call-intel proposal",
    description: "Dismiss the post-call proposal pending on this account. Only works when one is pending.",
    params: z.object({ accountId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ accountId }): Promise<PageActionResult> => {
      if (accountId !== accountIdConst) return err("That account is not the one open here.");      // E-9
      if (!hasPendingCallIntel(accountRef.current)) return err("There is no pending call intel to dismiss.");        // E-10
      const r = await reviewCallIntel("dismiss");
      return r.ok ? ok("Dismissed the call-intel proposal.") : err(r.error ?? "Couldn't update the proposal.");
    },
  },

  // eslint-disable-next-line react-hooks/exhaustive-deps
], [accountIdConst]); // accountIdConst (= params.id) for the id guard; account/intel read via refs

useRegisterPageActions(accountDetailActions);
```

> `accountIdConst` is the existing `accountId = params.id as string` (`[id]/page.tsx:42`), captured once. `hasPendingCallIntel(account)` is a tiny pure predicate (§4) over `account?.properties?.pendingCallIntel` — the same `pending` signal `usePendingReview` reads (`call-intel.tsx:69,423`). It lets the action fail cleanly (E-10) instead of POSTing a no-op review. The detail page registers exactly these six ids (so on `/accounts/[id]` the manifest is exactly these six, AC-1), and **none** of the list-only ids.

---

## 4. The pure extractions (the only edits to existing handlers — all behaviour-preserving)

Some handlers read component `useState` directly (the bulk handlers read `selectedRows`; `performCascadeDelete` reads `cascadeTarget`; the detail inline edit + summary refresh live inside JSX; call-intel/dossier live inside child components). To call them from `run` with explicit args **without duplicating logic**, extract the network body into a small `useCallback` that both the existing handler and the `run` call. Each extraction is a **pure move** (same fetch URL, same body shape, same chunk size, same refetch) — the button/menu/setter path is rewired to call the extraction so there is exactly one copy.

### 4.1 List page

| Extraction (new, `useCallback`) | Body (lifted verbatim from) | Old caller rewired to use it |
|---|---|---|
| `scoreByIds(ids)` → `{ total; succeeded; failed }` | the `chunkedBulkCall({ endpoint:"/api/score", buildPayload:({companyIds:chunk}) })` from `bulkScoreSelected` `:792-796` (+ `refetchLoadedAccounts` on success) | `bulkScoreSelected` computes ids from `selectedRows`/unscored, calls `scoreByIds(ids)`, keeps its toast |
| `detectSignalsByIds(ids)` → `{ total; succeeded; failed }` | the enriched-scoping `ids.filter(isEnriched)` + `chunkedBulkCall({ endpoint:"/api/signals", … })` from `detectSignals` `:866-877` (+ refetch) | `detectSignals` calls `detectSignalsByIds(accounts.map(a=>a.id))`, keeps its `setDetectingSignals`/toast |
| `extractContactsByIds(ids)` → `{ totalCreated; accountsProcessed; error? }` | the 50-id fan-out `POST /api/accounts/extract-contacts` loop from `extractContactsSelected` `:905-925` | `extractContactsSelected` computes ids from `selectedRows`, calls `extractContactsByIds(ids)`, keeps `setExtractingContacts`/toast |
| `setExclusionByIds(ids, action)` → `{ succeeded; failed }` | the `chunkedBulkCall({ chunkSize:500, endpoint:"/api/accounts/exclude", buildPayload:({ids:chunk,action}) })` from `bulkSetExclusion` `:1033-1038` (+ refetch) | `bulkSetExclusion` computes ids from `selectedRows`, calls `setExclusionByIds(ids, action)`, keeps its toast/`setSelectedRows` |
| `restoreAccountsResult(ids)` → `{ ok; restored; error? }` | the `POST /api/accounts/restore { ids }` from `restoreAccounts` `:1104-1113` | `restoreAccounts` calls `restoreAccountsResult(ids)`, keeps its toast/refetch |
| `deleteAccountsByIds(ids, cascade)` → `{ ok; deleted; extra; error? }` | the `DELETE /api/accounts/batch { ids, cascade }` from `performCascadeDelete` `:1180-1191` (+ refetch) — driven off the **passed ids**, not the modal's `cascadeTarget` | `performCascadeDelete` calls `deleteAccountsByIds(cascadeTarget.ids, selectedKeys)`, keeps the modal UX |
| `startTamBuildWith({ icpId, allProfiles, targetCount })` → `void` | the `BuildRequest` assembly + `tamStream.start(...)` from `startTamBuild` `:471-481`, parameterized: `allProfiles` → `{ icpIds: sourceProfiles.map(p=>p.id) }`, `icpId` → `{ icpId }`, neither → `{}`; keeps the `apolloOverrides` from the active filters | `startTamBuild` (the button) calls `startTamBuildWith({ icpId: sourceIcpId==="all" ? undefined : sourceIcpId ?? undefined, allProfiles: sourceIcpId==="all" })` — same `BuildRequest` it builds today |
| `runSmartSearch(query)` → `{ filters: FilterCondition[]; meta }` | the same request the `SmartSearchBar` issues internally for `resourceType:"account"` (the bar's `onFilters` is the consumer `:1802-1810`); a thin POST helper mirroring the bar's fetch | only `accounts.smartSearch` uses it; the bar keeps its own internal request (the action is a second caller of the same endpoint, like CLE-08 §1.2 call-intel) |
| `describeAccountFilters(params)` → string | new tiny pure formatter for the `applyFilter` summary (no existing equivalent) | only `accounts.applyFilter` uses it |

`setColumnFilters`/`setFilter`/`setEnrichmentFilter`/`setSearchQuery`/`setSmartFilters`/`setSmartMeta`, the view setters (`setViewExcluded`/`setViewDeleted`/`setSelectedRows`), `selectAllMatching`, `runEnrich`, `rowSetExclusion`, `startTamBuild`, and `setShowPersona` are already callable as-is — **no extraction needed**; the `run`s call them directly. (`selectAll`'s summary reads `selectedRef` after the `await`, and `filteredAccountsRef`/`smartFiltersRef` mirrors for the honest-cap branch — refs, no extraction.)

> **`runSmartSearch` note.** If the `SmartSearchBar` does not expose its request as an importable helper, `runSmartSearch` is a tiny new `useCallback` that POSTs the **same** body+endpoint the bar posts (verify the bar's fetch in `components/ui/smart-search-bar.tsx` at build time and reuse the exact shape) — one copy, used by the action; the bar is untouched. This mirrors CLE-08's "second REST caller of the same contract" for call-intel (CLE-08 §1.2) and is the recorded approach.

### 4.2 Detail page

| Extraction (new, `useCallback`/pure) | Body (lifted verbatim from) | Old caller rewired to use it |
|---|---|---|
| `saveField(field, value)` → `{ ok; error? }` | the `PUT /api/accounts/${accountId} { [field]: value ?? null }` + optimistic `setAccount` from the inline `onKeyDown` `:368-382`, **hoisted above the early returns** | the field `onKeyDown` (Enter) calls `saveField(field.key, editValue || null)` then `setEditingField(null)` — same PUT |
| `refreshSummary()` → `{ ok; error? }` | the `POST /api/accounts/${accountId}/generate-summary` + `setAiSummary`/`setAiHowTheyMakeMoney` from the refresh-button `onClick` `:162-182`, **hoisted above the early returns** | the refresh button's `onClick` calls `refreshSummary()` then keeps its `setRefreshingSummary`/toast |
| `reviewCallIntel(action)` → `{ ok; error? }` | a new page-level `POST /api/call-intel/review { entityType:"company", entityId:accountId, action }` — the **same** request `usePendingReview.act` issues (`call-intel.tsx:77-81`) | only the two call-intel actions use it; `<AccountCallIntel>` keeps its own `act` (the page action is a second caller of the same REST contract, §1.2) |
| `hasPendingCallIntel(account)` → boolean | new tiny pure predicate over `account?.properties?.pendingCallIntel` (mirrors the `usingPending` signal `call-intel.tsx:69,423`) | only the two call-intel actions use it |
| `<CompanyDossier onRegister>` lifted callback (§2) | the component registers its existing `generateDossier` `:124-145` + `hasDomain` (`!!accountDomain`) via the new optional `onRegister` prop on mount | the page captures it into `dossierApiRef`; `accounts.generateDossier.run` calls `dossierApiRef.current.generate()` — drives the card's own handler |

`reassignAccountOwner` (`:81-92`) is already a top-level function callable as-is — **no extraction**; the `run` calls it directly.

> **Verification of behaviour-preservation (AC-13):** after each extraction, the button/menu/setter/checkbox/inline-edit path must produce byte-identical network calls and UI. The test for each action asserts the same `fetch` URL+body+chunk size the page sent before; a snapshot/grep confirms each URL string appears **once** per file (or in the one shared extracted helper / lifted child callback). The `<CompanyDossier onRegister>` prop is additive (optional) — the component renders identically when the page does not pass it (the existing `/accounts/[id]` render is unchanged except for the registration).

---

## 5. Data flow (model → tool → directive → confirm gate → existing handler → list)

```
 user: "filter to health-care accounts that are A-grade, select all, and enrich them"  (on /accounts)
        │
        ▼ POST /api/chat  body.pageActions = getActionManifest()  (CLE-03 dock)
 ┌─────────────────────────── SERVER (CLE-04) ───────────────────────────┐
 │ model calls listPageActions() → sees accounts.* for THIS page          │
 │ model calls invokePageAction("accounts.applyFilter",                   │  (confirm:never → execute)
 │                 { industry:["Hospital & Health Care"], score:["A+","A"] })
 │ model calls invokePageAction("accounts.selectAll", {matchingCurrentFilter:true}) (confirm:never → execute)
 │ model calls invokePageAction("accounts.bulkEnrich", {})                │
 │   • entry found; jsonSchemaToZod.safeParse ok                          │
 │   • decideAction({mutating:true,cost:"credits",confirm:"risky",role}) │
 │        → confirm  →  requireConfirm = true                             │
 │   • return { ...invokeActionDirective(uuid, id, params, true) }        │
 └───────────────────────────────────┬────────────────────────────────────┘
                                      │ tool result carries _uiDirective
                                      ▼
 ┌────────────────────── CLIENT (CLE-03 + CLE-05) ───────────────────────┐
 │ applyFilter/selectAll (requireConfirm:false) → run immediately:        │
 │     setColumnFilters(...) → list re-fetches server-side; selectAllMatching() resolves ?idsOnly=true
 │ bulkEnrich (requireConfirm:true) → CLE-05 confirm card                 │
 │     ("Uses credits" badge from cost:"credits")                        │
 │   user Approves → runRegisteredAction("accounts.bulkEnrich", {})       │
 │        → registry resolves to OUR run() (CLE-07)                       │
 │            • selectedRef.current.size > 0                              │
 │            • runEnrich(criteria, ids)  ◀── existing handler :278       │
 │                 → enrichStream.start (100-id batches)                  │
 │            • returns ok("Enriching 240 accounts…")                     │
 │   → encodeActionResult(uuid, result) → chat.sendMessage("[[action-result]]…")
 └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼  the list filtered + every row ticked + the enrich stream firing, visibly
 next POST /api/chat carries the envelope → model reads ok+summary → "Done — enriching 240 accounts."
```

For **`accounts.bulkExtractContacts`** and **`accounts.startTamBuild`** (`cost:"credits"`, `confirm:"always"`), `decideAction → confirm` **regardless of approval mode**, so CLE-05 always shows a card ("Uses credits") before any spend; on approve, `extractContactsByIds`/`startTamBuildWith` run the existing sourcing. For **`accounts.bulkDelete`/`deleteAccount`** (`confirm:"always"`), the card shows ("Updates a record" / no money badge — it is reversible soft-delete), then `deleteAccountsByIds` issues the same `DELETE /api/accounts/batch`. For `applyFilter`/`setView`/`selectAll`/`sendToCallMode`/`openPersonaSearch` (`confirm:"never"`), `decideAction → execute → requireConfirm:false`, so CLE-03 runs them immediately (no card) and the list updates live.

---

## 6. Failure handling (every branch returns a `PageActionResult`; nothing throws)

| Failure | Where caught | Result |
|---|---|---|
| Empty selection (`bulkEnrich`/`bulkScore`/`bulkDetectSignals`/`bulkExtractContacts`/`bulkExclude`/`bulkRestore`/`bulkDelete`/`sendToCallMode` with no selection and no `accountIds`) | the `ids.length === 0` guard in each `run` (§3.1) | `{ ok:false, summary:"No accounts selected — select some first (or say 'select all matching')." }`; the underlying handler (itself early-returning on `ids.length===0`, `:790,898,1029`) is **not** entered; no request (E-1). |
| `selectAll` server cap hit | `selectAllMatching` resolves `?idsOnly=true`; `truncated` toast `:1094` | summary states "Selected N matching accounts" (or the loaded-rows fallback when a residual NL filter is active); the selection is the capped set (E-2). |
| Filter / smartSearch yields 0 | `applyFilter`/`smartSearch` (§3.1) | `{ ok:true, summary:"…" }`; the list shows its existing empty state `:1946-1963`; never an error (E-3 / AC-2 / AC-3). |
| Cost-bearing under any approval mode | `decideAction` (CLE-04 §2.1, step 5 `confirm:"always"`) | `bulkExtractContacts`/`startTamBuild`/`personaSearch(save)` always reach a confirm card; no mode runs them silently; badge "Uses credits" (E-4 / AC-12). |
| `startTamBuild` unknown `icpId` | the `profilesRef` check (§3.1) | `{ ok:false, error:"No such ICP profile." }`; no build (E-6). |
| `bulkRestore` view-dependence | the `viewRef` branch (§3.1) | Excluded → `setExclusionByIds(_,"include")`; Archive → `restoreAccountsResult`; neither → `{ ok:true, summary:"Nothing to restore in this view." }` (E-7). |
| `bulkEnrich`/`enrichAccount` already-complete | `runEnrich`'s own "No accounts need enrichment" early-return `:284-287` | the stream simply doesn't start; the action's summary is still `ok:true` (E-11) — parity with the existing toast. |
| `updateField` wrong page / unknown field | `accountId !== accountIdConst` (§3.2) / `field` `z.enum` | `{ ok:false, error:"That account is not the one open here." }`; bad `field` rejected at the schema boundary (E-9). |
| `generateDossier` no domain | `dossierApiRef.current.hasDomain` false (§3.2, mirrors `:94-97`) | `{ ok:false, error:"This account has no domain, so a dossier can't be generated." }` (E-10). |
| `approveCallIntel`/`dismissCallIntel` no pending intel | `hasPendingCallIntel` false (§3.2) | `{ ok:false, error:"There is no pending call intel to approve/dismiss." }`; no review POST (E-10). |
| Server bulk/POST/PUT/DELETE non-OK | the existing handler's own non-OK branch (toasts) + the §4 extractions return `{ok:false,error}` / `{succeeded,failed}` | `{ ok:false, error }` or a partial-count `ok:true`; optimistic state rolled back by the existing handler where applicable. |
| Action invoked off-page | CLE-04 `invokePageAction` unknown-id refusal; CLE-03 `runRegisteredAction` `action_not_registered` | refusal/error; no effect (AC-14 / E-5). Not CLE-07 code — inherited. |
| `run` throws unexpectedly | CLE-03 `runRegisteredAction` try/catch (CLE-03 §2.3 / E-7) | `{ ok:false, error:<msg> }` round-trips; chat loop intact. Our `run`s avoid throwing by construction; the safety net is upstream. |
| Page unmount mid-run | the list owns its streams; CLE-03 dock owns the fire-and-forget promise (CLE-03 E-3) | in-flight fetch/stream settles, the result round-trips; an unmounted setter is a no-op React warning at worst; actions are reversible → clean re-sync on next mount (E-12). |

---

## 7. Security

- **No new runnable surface, no new endpoints.** Every `run` calls an existing page handler that hits an existing API route the pages already call (`/api/accounts`, `/api/accounts/:id`, `/api/accounts/exclude`, `/api/accounts/restore`, `/api/accounts/batch`, `/api/accounts/related-counts`, `/api/accounts/extract-contacts`, `/api/accounts/:id/generate-summary`, `/api/score`, `/api/signals`, `/api/enrich/stream` via `enrichStream`, `/api/tam/build` via `tamStream`, `/api/icp/apply` via the persona modal, `/api/research/dossier` via the dossier card, `/api/call-intel/review`, the `/call-mode` navigation, the `/api/search` smart-search). The agent gets **exactly** the surface a human on these pages already has — parity by construction (README §1.1, CLE-03 §7 security). No `eval`, no DOM-by-vision.
- **Params validated twice.** Client-side against the action's live Zod schema in `runRegisteredAction` (CLE-03 §2.3) and server-side against the manifest JSON Schema in `invokePageAction` (CLE-04 §2.4). The `score`/`linkedin`/`view`/`field`/`cascade` enums, `matchingCurrentFilter:z.literal(true)`, and the non-empty `accountId` are enforced before any handler runs.
- **Credits gating is the headline (the spend guardrail).** `bulkExtractContacts`/`startTamBuild` are `cost:"credits"` + `confirm:"always"` → `decideAction` returns `confirm` **regardless of approval mode** (CLE-04 §2.1 step 5) → CLE-05 renders a "Uses credits" badge and an editable card **before** any spend (AC-12 / E-4). `bulkEnrich`/`enrichAccount` are `cost:"credits"` + `confirm:"risky"` → also carded. The actual credit accounting is unchanged — it stays in the existing endpoints (`/api/accounts/extract-contacts`, `/api/tam/build`, `/api/enrich/stream`); the actions add no new spend path, only route through the same ones behind a confirmation. **No `cost:"money"` action exists on this page** (buying a phone number is `/call-mode`, CLE-09).
- **Destructive `bulkDelete`/`deleteAccount` are `confirm:"always"`** → always a card, regardless of approval mode. The agent path deliberately does **not** re-open the count-preview cascade modal (§4 — like CLE-08's `bulkDelete`): the CLE-05 card is the single confirmation, and `cascade` is an explicit, enum-bounded param. (If product later wants the related-counts surfaced before deleting, that is a CLE-05 card-enrichment, not a CLE-07 change.)
- **`sendToCallMode` is an internal navigation only.** It sets `window.location.href = "/call-mode?accounts=<ids>"` (the same nav the bulk bar does, `:1537-1541`) — same-origin, no outbound, no spend (`confirm:"never"`). It does not place a call (placing/answering a call is device/human-bound and lives on `/call-mode`, CLE-09).
- **Persona / dossier / call-intel reuse the same contracts.** `openPersonaSearch` opens the modal only (the human saves there); `personaSearch(save)`, if shipped, is `confirm:"always"` because it overwrites the tenant ICP. `generateDossier` drives the card's own handler. `approveCallIntel`/`dismissCallIntel` POST the same `/api/call-intel/review` the card posts — the server owns the live-vs-pending merge; the action adds no business logic.
- **Tenant isolation unchanged.** The reused API routes are the same tenant-scoped endpoints (`WHERE tenantId` app-layer, as the pages already rely on). The actions add no DB access of their own.
- **Role gating via `decideAction` (CLE-04 §2.1).** A viewer invoking any `mutating` action (`bulkEnrich`/`bulkScore`/`bulkDetectSignals`/`bulkExtractContacts`/`bulkExclude`/`bulkRestore`/`bulkDelete`/`startTamBuild`/`enrichAccount`/`scoreAccount`/`excludeAccount`/`deleteAccount`/`updateField`/`reassignOwner`/`refreshSummary`/`generateDossier`/`approveCallIntel`/`dismissCallIntel`) is **refused** inside `invokePageAction`. A viewer can still drive the read-only/navigation actions (`applyFilter`/`smartSearch`/`setView`/`selectAll`/`sendToCallMode`/`openPersonaSearch`) — they mutate nothing and send nothing. No extra gating code in CLE-07; it inherits the plane.

---

## 8. Test strategy

Unit/RTL with **vitest** + **@testing-library/react** (the pattern CLE-03/05/06/08 tests use). Mock `fetch`/streams; spy the existing handlers/setters; assert `run → effect → result`. No live server except eval step 16.

- **`accounts-actions.list.test.tsx`** — mount a harness rendering the list page (or a thin extraction of `accountListActions` built against fixture `accounts`/`selectedRows`/`sourceProfiles` + spied setters):
  - **manifest membership + metadata** (AC-1): ids present; `bulkDelete.confirm==="always"`, `deleteAccount.confirm==="always"`, `bulkExtractContacts.confirm==="always"`+`cost==="credits"`, `startTamBuild.confirm==="always"`+`cost==="credits"`, `bulkEnrich.confirm==="risky"`+`cost==="credits"`, `enrichAccount.cost==="credits"`, `applyFilter.confirm==="never"`, `smartSearch.confirm==="never"`, `setView.confirm==="never"`, `selectAll.confirm==="never"`, `sendToCallMode.mutating===false`, `openPersonaSearch.mutating===false`. Detail ids absent.
  - **applyFilter incl. clear + 0-result** (AC-2/E-3): `{industry:["…"],score:["A+"],sourceTab:"tam"}` → `setColumnFilters`/`setFilter` got the equivalent state, summary names the filters; `{clear:true}` → `setColumnFilters({})`/`setSmartFilters([])`/`setFilter("all")`; a 0-match filter → `ok:true`.
  - **smartSearch** (AC-3/E-3): spy `runSmartSearch`; `{query:"SaaS in France, high fit"}` → `resourceType:"account"` request, `setSmartFilters` got the parsed conditions, summary names the count; no-match → `ok:true` "searched all fields"; empty query → cleared.
  - **setView** (AC-4): `{view:"excluded"}` → `setViewDeleted(false)`+`setViewExcluded(true)`; `{view:"archived"}` → archive setters; `{view:"active"}` → both flags false.
  - **selectAll incl. the cap — REQUIRED named test** (AC-5/E-2): spy `selectAllMatchingIds`; run on a board with `accounts.length < totalAccounts` → `?idsOnly=true` requested, the selection replaced with the resolved set, the summary reports the count. Force `truncated:true` → the page's cap toast fires and the summary reports the capped count. Add a non-score NL smart filter → assert the selection honestly stays the visible rows + a summary saying so. `{matchingCurrentFilter:false}` → schema reject.
  - **bulkEnrich + empty-selection guard — REQUIRED named test** (AC-6/E-1/E-11): non-empty selection → `runEnrich` called with the selected ids; result names the count. Empty selection (no `accountIds`) → `ok:false` "No accounts selected…", `runEnrich` **not** entered with ids. Already-complete → `runEnrich` early-returns; `ok:true`.
  - **bulkScore / bulkDetectSignals** (AC-7/E-1): spy `chunkedBulkCall`; non-empty → `/api/score` resp. `/api/signals` over the ids (signals scoped to enriched); count summary; partial-failure summary. Empty → `ok:false`.
  - **bulkExtractContacts requires confirm + sources — REQUIRED cost test** (AC-8/AC-12/E-1/E-4): feed its scalars to `decideAction({approvalMode:"auto-high-confidence",role:"member"})` → `confirm`. Then run (post-confirm) over a selection → the 50-id `POST /api/accounts/extract-contacts` fan-out + the created-contacts summary. Empty → `ok:false`.
  - **bulkExclude / bulkRestore / bulkDelete** (AC-9/E-7/E-8): `bulkExclude` → `/api/accounts/exclude` (exclude, 500-id chunks). `bulkRestore` view-dependence: Excluded view → include; Archive view → `/api/accounts/restore`; neither → no-op `ok:true`. `bulkDelete` `confirm:"always"`; on approve → `DELETE /api/accounts/batch {ids,cascade}`; default cascade `[]`; bad cascade key rejected.
  - **sendToCallMode** (AC-10): non-empty → asserts the `/call-mode?accounts=<ids>` navigation; empty → `ok:false`.
  - **startTamBuild requires confirm + builds — REQUIRED cost test** (AC-11/AC-12/E-6/E-4): `decideAction` under `auto-high-confidence` → `confirm`. Then `{allProfiles:true}` → `startTamBuildWith` with the all-profiles `BuildRequest`; `{icpId:"x"}` → single-profile request; unknown id → `ok:false`, no build.
  - **single-row actions** (E-9 n/a here): `enrichAccount`/`scoreAccount`/`excludeAccount`/`deleteAccount` over one id → the same handler scoped to `[id]`; `deleteAccount` `confirm:"always"`.
  - **decideAction cross-check** (security §7): every read-only/nav action → `execute`; every mutating one → `confirm`; the three cost-bearing → `confirm` **even** under `auto-high-confidence`; viewer + any mutating → `refuse`; viewer + `applyFilter` → `execute`.
  - **edge guards**: empty-selection bulk (E-1), unknown grade in `applyFilter.score` (schema reject), `selectAll` cap (E-2).
- **`accounts-actions.detail.test.tsx`** — mount the detail harness with a fixture `account` (with/without a pending `callIntel`, with/without a domain):
  - manifest = the six detail ids (AC-1); list-only ids absent.
  - **updateField + reassignOwner** (AC + E-9): `updateField({field:"size",value:"200-500"})` → one `PUT /api/accounts/:id {size:"200-500"}` (the extracted `saveField`), local state updated, `ok:true`; wrong `accountId` → `ok:false`; bad `field` → schema reject. `reassignOwner` → `PUT {ownerId}` (and `ownerId:null` un-assigns).
  - **refreshSummary** (AC): `POST …/generate-summary` (the extracted `refreshSummary`); wrong id → `ok:false`.
  - **generateDossier** (E-10): with a domain → `dossierApiRef.generate()` drives `<CompanyDossier>`'s own handler (`POST /api/research/dossier`); no domain → `ok:false`, no POST.
  - **approveCallIntel + dismissCallIntel** (E-10): with a pending `properties.pendingCallIntel` → `POST /api/call-intel/review {entityType:"company",entityId,action}`; no pending → `ok:false`, no POST; wrong id → `ok:false`.
- **`accounts-actions.dedup.test.ts(x)`** — assert (by spying `global.fetch` / `window.location`) that the **button/menu/setter/checkbox/inline-edit path** and the **action path** issue the same URL+body+chunk size for score / signals / extract-contacts / exclude / restore / batch-delete / generate-summary / inline-PUT / review, and the same navigation for Call Mode — proving one shared implementation (AC-13). Plus a static check (or review note) that each fetch URL string appears once per file (or in the one shared extracted helper / lifted child callback).
- **pure-helper units**: `describeAccountFilters` (readable, emoji-free), `hasPendingCallIntel` (true only when `pendingCallIntel` exists), the §4 extractions' body shapes (`scoreByIds`/`extractContactsByIds`/`setExclusionByIds`/`deleteAccountsByIds`/`startTamBuildWith` request shapes).
- **off-page degradation** (AC-14/E-5): reuse CLE-03's lifecycle test shape — unmount the list page, assert ids gone + `runRegisteredAction("accounts.bulkDelete",…)` → `action_not_registered`.
- **Regression:** `pnpm tsc --noEmit` 0; `regression.sh` green; CLE-03/04/05/06 tests untouched; the pages' manual flows (column filters, smart search, tabs, views, select-all, the six bulk-bar actions, TAM build, persona modal, inline edit / owner / summary / dossier / call-intel) verified unchanged by the dedup tests (same network shape) + eval step 16. The `<CompanyDossier onRegister>` prop is additive — a render-snapshot of the card without the prop is unchanged.

Coverage target: 100% of the new `run` branches (each error path + happy path) and the §4 extractions. No new runtime dependency. No new API route.
