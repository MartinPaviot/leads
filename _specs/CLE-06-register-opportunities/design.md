# CLE-06 — Register the `/opportunities` page actions (PILOT) — Design

> Implements the **consumption** side of README §3.2 (`PageAction`) and §3.3 (`useRegisterPageActions`) for the opportunities pages. It introduces **no** new contract and **no** new framework code; it declares `PageAction[]`s whose `run`s call handlers that already exist (cited file:line below) and calls the CLE-03 hook. The metadata each action carries is what CLE-04's `decideAction` reads to set `requireConfirm`, and what CLE-05's confirm card renders.
> Builds on: `_specs/CLE-03-action-directive-and-registry/design.md` (the `PageAction`/`PageActionResult` types §2.2, `useRegisterPageActions`/`runRegisteredAction` §2.3), `_specs/CLE-04-page-action-tools/design.md` (`decideAction` §2.1 maps our `confirm`/`mutating`/`reversible` → a disposition; the manifest is read by `listPageActions`), `_specs/CLE-05-action-confirmation-ux/design.md` (the editable confirm card rendered when `requireConfirm:true`).
> Real code anchored: `app/apps/web/src/app/(dashboard)/opportunities/page.tsx` (list, 1550 lines) and `.../opportunities/[id]/page.tsx` (detail, 1266 lines), plus `components/close-reason-dialog.tsx`.

---

## 1. System fit — the handlers we reuse (file:line)

The whole feature is a thin declarative layer over functions that already exist. **Nothing below is re-implemented**; the `run` closures call these.

### 1.1 List page — `app/apps/web/src/app/(dashboard)/opportunities/page.tsx`

| Concern | Existing handler / state (file:line) | What it does today | Action that reuses it |
|---|---|---|---|
| Stage move (commit + rollback) | `commitStageChange(id, newStage, prev, closeReason?)` — `:399-418` | `PUT /api/deals/${id}` with `{ stage, closeReason? }`; optimistic `setDeals` is done by the caller; rollback `setDeals(prev)` on failure; `fetchAnalytics()` on success | `opportunities.moveStage` |
| Stage move (drag entry + close gate) | `handleDrop` `:379-397`; `pendingClose` state `:373-377`; `setPendingClose` `:393`; `handleCloseReasonConfirm` `:420-425`; `handleCloseReasonCancel` `:427-432`; `<CloseReasonDialog>` `:1523-1533` | drag drops a card → optimistic move → if Won/Lost, hold `pendingClose` and open the dialog; else `commitStageChange` | `opportunities.moveStage` (Won/Lost gate) |
| Create deal | `handleCreate(e)` `:313-337` — the `POST /api/opportunities` body `:318-327`; `fetchDeals(); fetchAnalytics()` `:329` | posts `{ name, stage, value?, companyId, contactId, expectedCloseDate?, ownerId? }`; refetches | `opportunities.createDeal` |
| Filters | `activeFilters`/`setActiveFilters` `:194`; `stalledOnly`/`setStalledOnly` `:200`; `searchQuery`/`setSearchQuery` `:177`; the `ActiveFilter` shape `:91-96`; clear-all `:924`; the `filteredDeals` consumer `:539-568` | client-side filter state the board + table read | `opportunities.applyFilter` |
| View mode + archive | `viewMode`/`setViewMode` `:183`; `viewDeleted`/`setViewDeleted` `:186`; the Archive toggle button `:846-857` (`setViewDeleted(true); setViewMode("table"); setSelectedRows(new Set()); setShowAnalytics(false); setShowForecast(false)`) | board/table toggle + archive view | `opportunities.setView` |
| Forecast / analytics panels | `showForecast`/`setShowForecast` `:166`; `fetchForecast` `:246-256`; `showAnalytics`/`setShowAnalytics` `:163` | open/close the panels (forecast lazy-fetches on open `:825-829`) | `opportunities.toggleForecast` / `.toggleAnalytics` (optional) |
| Delete (cascade) | `openCascadeDelete(ids, label)` `:439-460` (loads related counts); `performCascadeDelete(selectedKeys)` `:477-526` (per-id `DELETE /api/opportunities/${id}` with `{ cascade }`, optimistic remove, rollback) | soft-delete one/many deals + optional related rows | `opportunities.delete` |
| Restore | `restoreDeals(ids)` `:261-278` — `POST /api/opportunities/restore { ids }` | un-delete from the archive | `opportunities.restore` |
| Analyze pipeline | `analyzeDeals()` `:339-357` — `POST /api/deals/analyze { dealIds }` (`deals.map(d=>d.id)`); `fetchDeals(); fetchAnalytics()` | AI deal analysis over the loaded deals | `opportunities.analyzePipeline` |
| Stage list (validation) | `activeStages` `:532-534`; `STAGES` const `:98`; `stageOptions` `:536` | the live set of valid stages | validates `moveStage.stage`, `createDeal.stage` |
| Deal lookup | `deals` state `:141`; the drag's `deals.find(d=>d.id===id)` + `deal.stage===newStage` guards `:385` | the currently-loaded board | E-1/E-2/E-6 guards |

### 1.2 Detail page — `app/apps/web/src/app/(dashboard)/opportunities/[id]/page.tsx`

| Concern | Existing handler (file:line) | What it does | Action |
|---|---|---|---|
| Auto-progress (apply) | `applySuggestion()` `:278-302` — `POST /api/opportunities/${dealId}/auto-progress { apply: true }`; `setDeal(... stage: suggestion.next)`; `fetchIntel()` | advances the deal to the suggested next stage | `opportunities.autoProgress` |
| Current suggestion | `suggestion` state `:152`; `dealId` `:144`; `deal` `:145` | the pending stage suggestion (null when none) | `autoProgress` precondition |

### 1.3 Where `useRegisterPageActions` is called

Each page declares its actions in a `useMemo` (stable array, ids constant) and registers them with a single hook call near the top of the component body, after the handlers it references are defined. The hook (CLE-03 §2.3) registers on mount, clears on unmount, so the manifest always reflects the current page (AC-1; CLE-03 AC-6).

- **List page:** at the end of the component's handler block (after `analyzeDeals`/`restoreDeals`/`performCascadeDelete` are defined), add `useRegisterPageActions(opportunityListActions)` where `opportunityListActions` is the `useMemo` built in §3.1.
- **Detail page:** after `applySuggestion` is defined, add `useRegisterPageActions(opportunityDetailActions)` (§3.2).

> **Hook ordering constraint.** `useRegisterPageActions` is a hook → it must be called unconditionally at the top level of the component, **not** inside the early `if (loading) return …` / `if (!deal) return …` branches on the detail page (`[id]/page.tsx:341-342`). The `run` closures capture the latest handlers via the `useMemo` dependency list (or a `useRef` mirror for values that change every render, §3.3), so an early return before data loads is fine: the actions are registered but their `run` guards on `deal`/`suggestion` being present (AC-7 / E-7).

---

## 2. The close-reason architecture (the one non-trivial decision)

`moveStage` to Won/Lost must honour the same gate a human drag hits: **a close reason is mandatory** (`close-reason-dialog.tsx:23-26,67-69` — the dialog refuses to confirm without a reason; "other" also requires a note). There are two ways the agent can satisfy this, and the action supports **both**:

1. **Reason supplied in params** (`closeReason: { reason, note? }`): the model already collected it ("mark it Won, we won on pricing"). `run` calls `commitStageChange(dealId, stage, prev, { reason, note: note ?? null })` **directly**, bypassing the dialog. This is the clean, fully-automated path.
2. **Reason omitted for a Won/Lost target**: `run` cannot silently invent a reason (that would pollute the win-rate dashboard the dialog exists to protect). It **enforces the gate by opening the existing dialog** (`setPendingClose({ dealId, outcome, prev })`, the same call `handleDrop` makes) and returns a `PageActionResult` whose `summary` says a reason is being collected and `ok:false` with `error:"close_reason_required"`. The human picks the reason in the dialog; the existing `handleCloseReasonConfirm` commits it. The model reads the result and tells the user "I've teed up the move — pick a close reason in the dialog."

> **Why not make the action itself block on the dialog and resolve when the user confirms?** That would require threading a promise resolver through `pendingClose` into `handleCloseReasonConfirm` so the action's `run` awaits the human. It is doable but adds state the page does not have today (a pending resolver) and couples the action's lifetime to a modal — fragile if the user navigates. The chosen design keeps `run` synchronous-to-its-own-effect: with a reason it commits; without, it **opens the gate and returns**, and the actual commit flows through the page's own confirmed path. This matches README §2 spirit (the agent *prepares*; for the irreducibly-human decision — *why did we win/lose?* — the human supplies it) without declaring the whole action human-bound. **This is the one contract tension to flag** (§7) — it is an additional, action-local confirmation *inside* `run`, on top of CLE-05's `requireConfirm` card. It does not change any CLE contract; it is allowed because `PageActionResult` explicitly models `ok:false` + `summary` for "couldn't complete, here's why."

> **Interaction with CLE-05's confirm card.** `moveStage` is `confirm:"risky"` → `decideAction` → `confirm` → CLE-05 shows an editable card first (the user can edit `stage`/`closeReason` there). If the user fills `closeReason` in that card, path (1) runs (no dialog). If they approve a Won move with `closeReason` still empty, path (2) opens the dialog. So a fully-automated Won move is: model supplies reason → CLE-05 card (approve) → direct commit. A reason-less one is: CLE-05 card (approve) → dialog (pick reason) → commit. Two gates only when the reason is genuinely missing.

---

## 3. The exact `PageAction[]` arrays

Types imported from CLE-03: `import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types"; import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";` and `import { z } from "zod";`. `confirm`/`mutating`/etc. are the README §3.2 fields verbatim.

A small local helper keeps results uniform (not a contract — internal to each page):

```ts
const ok = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const err = (error: string, summary?: string): PageActionResult =>
  ({ ok: false, error, summary: summary ?? error });
```

### 3.1 List page — `opportunityListActions`

```ts
// Built with useMemo; deps include the handlers/state setters + a dealsRef
// (a useRef mirror of `deals`, refreshed each render) so run() reads the LIVE
// board without re-registering on every deal change (CLE-03 keys registration
// by id list, so a stable id set + ref-read params is the right pattern).
const dealsRef = useRef(deals);
useEffect(() => { dealsRef.current = deals; });
const stagesRef = useRef(activeStages);
useEffect(() => { stagesRef.current = activeStages; });

const opportunityListActions: PageAction[] = useMemo(() => [

  // ── moveStage ──────────────────────────────────────────────
  {
    id: "opportunities.moveStage",
    title: "Move a deal to a stage",
    description:
      "Move one deal on the board to a pipeline stage (e.g. demo, negotiation, won, lost). " +
      "Moving to Won or Lost requires a close reason; pass closeReason {reason, note?} to set it, " +
      "otherwise the user is asked to pick one. Use this when the user is on the pipeline and names a deal + a stage.",
    params: z.object({
      dealId: z.string().min(1),
      stage: z.string().min(1),
      closeReason: z.object({ reason: z.string().min(1), note: z.string().optional() }).optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ dealId, stage, closeReason }): Promise<PageActionResult> => {
      const list = dealsRef.current;
      const deal = list.find((d) => d.id === dealId);
      if (!deal) return err("Deal " + dealId + " is not in the current view.");           // E-1
      const valid = stagesRef.current.some((s) => s.id === stage)
        || STAGES.includes(stage as (typeof STAGES)[number]);
      if (!valid) return err('Unknown stage "' + stage + '".');                            // E-2
      if (deal.stage === stage) return ok(deal.name + " is already in " + stage + ".");     // E-6
      const lower = stage.toLowerCase();
      const prev = [...list];
      setDeals((p) => p.map((d) => (d.id === dealId ? { ...d, stage } : d)));               // optimistic, same as drag
      if (lower === "won" || lower === "lost") {
        if (!closeReason) {
          // Gate: open the existing dialog for the human to pick a reason (path 2, §2).
          setPendingClose({ dealId, outcome: lower as "won" | "lost", prev });
          return err("close_reason_required",
            "Moved " + deal.name + " toward " + stage + " — pick a close reason in the dialog to confirm.");
        }
        if (closeReason.reason === "other" && !closeReason.note?.trim()) {
          setDeals(prev);                                                                   // roll back the optimistic move
          return err('A note is required when the reason is "other".');                     // AC-3
        }
        await commitStageChange(dealId, lower, prev, { reason: closeReason.reason, note: closeReason.note?.trim() ?? null });
        return ok("Marked " + deal.name + " " + (lower === "won" ? "Won" : "Lost") + " (" + closeReason.reason + ").");
      }
      await commitStageChange(dealId, stage, prev);                                         // non-closing path (path 1)
      const moved = dealsRef.current.find((d) => d.id === dealId);
      return moved?.stage === stage
        ? ok("Moved " + deal.name + " to " + stage + ".")
        : err("The move to " + stage + " did not persist; it has been rolled back.");       // commitStageChange rolled back on PUT failure
    },
  },

  // ── createDeal ─────────────────────────────────────────────
  {
    id: "opportunities.createDeal",
    title: "Create an opportunity",
    description:
      "Create a new deal on the pipeline. Name is required; optionally set the account, contact, " +
      "stage (defaults to lead), value, expected close date, owner. Use this when the user wants to add a deal.",
    params: z.object({
      name: z.string().min(1),
      accountId: z.string().optional(),
      contactId: z.string().optional(),
      stage: z.string().optional(),
      value: z.number().optional(),
      expectedCloseDate: z.string().optional(),
      ownerId: z.string().optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async (p): Promise<PageActionResult> => {
      const name = p.name.trim();
      if (!name) return err("A deal name is required.");                                    // AC-4 (mirrors handleCreate guard)
      const stage = p.stage && stagesRef.current.some((s) => s.id === p.stage) ? p.stage : "lead";
      const r = await submitCreate({                                                        // §4 extraction of handleCreate's POST
        name, stage, value: p.value, companyId: p.accountId, contactId: p.contactId,
        expectedCloseDate: p.expectedCloseDate, ownerId: p.ownerId,
      });
      return r.ok ? ok('Created opportunity "' + name + '".') : err(r.error ?? "Failed to create opportunity.");
    },
  },

  // ── applyFilter ────────────────────────────────────────────
  {
    id: "opportunities.applyFilter",
    title: "Filter the pipeline",
    description:
      "Apply visible filters to the board/table: stage, owner, min/max value, close-date-before, risk level, " +
      "stalled-only (deals 14+ days in stage), and a text/sector search. Replaces the current filter set. Use when the user wants to narrow the pipeline.",
    params: z.object({
      stage: z.string().optional(),
      owner: z.string().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
      closeDateBefore: z.string().optional(),
      risk: z.enum(["high", "medium", "low", "none"]).optional(),
      stalledOnly: z.boolean().optional(),
      search: z.string().optional(),
    }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async (p): Promise<PageActionResult> => {
      const next: ActiveFilter[] = [];
      if (p.stage) next.push({ field: "stage", label: "Stage: " + p.stage, op: "eq", value: p.stage });
      if (p.owner) next.push({ field: "owner", label: "Owner: " + p.owner, op: "eq", value: p.owner });
      if (p.minValue != null) next.push({ field: "value", label: "Value >=: " + p.minValue, op: "gte", value: String(p.minValue) });
      if (p.maxValue != null) next.push({ field: "value", label: "Value <=: " + p.maxValue, op: "lte", value: String(p.maxValue) });
      if (p.closeDateBefore) next.push({ field: "expectedCloseDate", label: "Close <=: " + p.closeDateBefore, op: "lte", value: p.closeDateBefore });
      if (p.risk) next.push({ field: "risk", label: "Risk: " + p.risk, op: "eq", value: p.risk });
      setActiveFilters(next);
      if (p.stalledOnly != null) setStalledOnly(p.stalledOnly);
      if (p.search != null) setSearchQuery(p.search);                                       // server-side industry-aware search (debounced)
      // Count the resulting set with the SAME predicate the board uses (§4 extraction).
      const count = countMatching(dealsRef.current, next, p.stalledOnly ?? stalledOnly);
      const desc = describeFilters(p);
      return ok((count === 0 ? "No deals match " : "Filtered to " + count + " deal" + (count === 1 ? "" : "s") + " ") + "(" + desc + ").",
        { count });
    },
  },

  // ── setView ────────────────────────────────────────────────
  {
    id: "opportunities.setView",
    title: "Switch the pipeline view",
    description: "Switch between the board (kanban) and table layouts; optionally show the archive of removed deals.",
    params: z.object({ view: z.enum(["board", "table"]), archived: z.boolean().optional() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ view, archived }): Promise<PageActionResult> => {
      if (archived) {
        setViewDeleted(true); setViewMode("table"); setSelectedRows(new Set());
        setShowAnalytics(false); setShowForecast(false);                                    // exact Archive-toggle behaviour :850-852
        return ok("Showing the archive (table).");
      }
      if (viewDeleted) setViewDeleted(false);                                               // leaving archive
      setViewMode(view);
      return ok("Switched to " + view + " view.");
    },
  },

  // ── delete ─────────────────────────────────────────────────
  {
    id: "opportunities.delete",
    title: "Delete an opportunity",
    description:
      "Soft-delete a deal (it moves to the archive and can be restored). Optionally cascade to the deal's " +
      "activities, notes, and/or tasks. Always asks for confirmation first.",
    params: z.object({
      dealId: z.string().min(1),
      cascade: z.array(z.enum(["activities", "notes", "tasks"])).optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ dealId, cascade }): Promise<PageActionResult> => {
      const deal = dealsRef.current.find((d) => d.id === dealId);
      if (!deal) return err("Deal " + dealId + " is not in the current view.");             // E-1
      const r = await deleteDeals([dealId], cascade ?? []);                                 // §4 extraction of performCascadeDelete's per-id DELETE
      return r.ok ? ok("Moved " + deal.name + " to Archive.") : err(r.error ?? "Failed to delete the opportunity.");
    },
  },

  // ── restore ────────────────────────────────────────────────
  {
    id: "opportunities.restore",
    title: "Restore an archived opportunity",
    description: "Bring a soft-deleted deal back from the archive.",
    params: z.object({ dealId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ dealId }): Promise<PageActionResult> => {
      const r = await restoreDealsResult([dealId]);                                         // §4 thin wrapper around restoreDeals
      return r.ok ? ok("Restored the opportunity.") : err(r.error ?? "Couldn't restore.");
    },
  },

  // ── analyzePipeline ────────────────────────────────────────
  {
    id: "opportunities.analyzePipeline",
    title: "Analyze the pipeline",
    description:
      "Run AI deal analysis over the loaded deals (or a specific set of deal ids) — refreshes risk, " +
      "next steps and stage signals. Use when the user asks to analyze/score the pipeline.",
    params: z.object({ dealIds: z.array(z.string()).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ dealIds }): Promise<PageActionResult> => {
      const ids = dealIds ?? dealsRef.current.map((d) => d.id);                             // mirrors analyzeDeals default
      if (ids.length === 0) return err("No deals to analyze.", "No deals to analyze.");     // AC-9 / mirrors the guard
      const r = await analyzeDealsByIds(ids);                                               // §4 extraction of analyzeDeals' POST
      return r.ok ? ok("Analyzed " + ids.length + " deal" + (ids.length === 1 ? "" : "s") + ".") : err(r.error ?? "Failed to analyze deals.");
    },
  },

  // ── toggleForecast / toggleAnalytics (optional) ────────────
  {
    id: "opportunities.toggleForecast",
    title: "Show/hide the forecast",
    description: "Open or close the revenue-forecast panel.",
    params: z.object({ open: z.boolean().optional() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ open }): Promise<PageActionResult> => {
      const next = open ?? !showForecast;
      setShowForecast(next);
      if (next && !forecast) fetchForecast();                                               // lazy-fetch, same as the button :825-829
      return ok(next ? "Opened the forecast." : "Closed the forecast.");
    },
  },
  {
    id: "opportunities.toggleAnalytics",
    title: "Show/hide analytics",
    description: "Open or close the pipeline analytics KPI strip.",
    params: z.object({ open: z.boolean().optional() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ open }): Promise<PageActionResult> => {
      const next = open ?? !showAnalytics;
      setShowAnalytics(next);
      return ok(next ? "Opened analytics." : "Closed analytics.");
    },
  },

  // eslint-disable-next-line react-hooks/exhaustive-deps
], []); // stable id set; run() reads live values via refs / setters (which are stable)

useRegisterPageActions(opportunityListActions);
```

> **Why `useMemo([], [])` is safe here.** State **setters** (`setDeals`, `setActiveFilters`, `setViewMode`, …) are referentially stable across renders (React guarantee). The page functions `commitStageChange`, `setPendingClose`, `fetchForecast`, and the §4 extractions are defined in component scope; to keep them stable they are either already stable (setters) or wrapped where needed (the §4 helpers are `useCallback`). Live *values* (`deals`, `activeStages`, `forecast`, `showForecast`, `showAnalytics`, `stalledOnly`, `viewDeleted`) are read through refs or are read at call-time inside the setter-updater form. This makes the action **id set** stable, so CLE-03's `useRegisterPageActions` (keyed on `actions.map(a=>a.id).join("|")`, CLE-03 §2.3) does not re-register on every board change — exactly the pattern CLE-03 designed for. (Values read directly in a `run` that are NOT refs — `showForecast`/`showAnalytics`/`stalledOnly`/`viewDeleted`/`forecast` — are acceptable because they are only read inside `run` at invocation time via the closure; if a lint/staleness concern arises, mirror them into refs too. The mutation-critical reads (`deals`, `activeStages`) **are** ref-backed to guarantee freshness.)

### 3.2 Detail page — `opportunityDetailActions`

```ts
const suggestionRef = useRef(suggestion);
useEffect(() => { suggestionRef.current = suggestion; });

const opportunityDetailActions: PageAction[] = useMemo(() => [
  {
    id: "opportunities.autoProgress",
    title: "Advance this deal to its suggested stage",
    description:
      "Apply the suggested next-stage advance for the deal currently open. Only works when a suggestion is shown. " +
      "Use when the user agrees to move the deal forward as suggested.",
    params: z.object({ dealId: z.string().min(1), apply: z.literal(true) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ dealId }): Promise<PageActionResult> => {
      if (dealId !== (params.id as string)) return err("That deal is not the one open here.");  // E-1 (detail is single-deal)
      if (!suggestionRef.current) return err("There is no stage suggestion to apply for this deal.");  // AC-7
      const nextStage = suggestionRef.current.next;
      await applySuggestion();                                                              // reuses the detail handler verbatim
      // applySuggestion clears `suggestion` on success and toasts on failure; reflect that:
      return suggestionRef.current === null
        ? ok("Advanced " + (deal?.name ?? "the deal") + " to " + nextStage + ".")
        : err("Couldn't advance the deal — see the page for details.");
    },
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], [deal]); // deal name for the summary; suggestion read via ref

useRegisterPageActions(opportunityDetailActions);
```

> `apply` is a `z.literal(true)` because the only invocable detail action is *apply the suggestion* — a `false` would be a no-op the model should never send. The action id stays `opportunities.autoProgress` per the scope; the detail page registers only this one (so on `/opportunities/[id]` the manifest is exactly `[opportunities.autoProgress]`, AC-1).

---

## 4. The pure extractions (the only edits to existing handlers — all behaviour-preserving)

Some handlers read component `useState` directly (e.g. `handleCreate` reads `newName`, `newAccountId`, …; `performCascadeDelete` reads `cascadeTarget`; `analyzeDeals` reads `deals`; `restoreDeals` toasts + refetches). To call them from `run` with explicit args **without duplicating logic**, extract the network body into a small `useCallback` that both the existing handler and the `run` call. Each extraction is a **pure move** (same fetch URL, same body shape, same refetch) — the button path is rewired to call the extraction so there is exactly one copy.

| Extraction (new, `useCallback`) | Body (lifted verbatim from) | Old caller rewired to use it |
|---|---|---|
| `submitCreate(input)` → `{ ok: boolean; error?: string }` | the `POST /api/opportunities` + `fetchDeals(); fetchAnalytics()` from `handleCreate` `:318-329` | `handleCreate` builds `input` from state, calls `submitCreate`, keeps the `setShowCreate(false)` / `toast` UI bits |
| `deleteDeals(ids, cascade)` → `{ ok; error? }` | the per-id `DELETE /api/opportunities/${id}` loop + optimistic remove + rollback from `performCascadeDelete` `:481-525` | `performCascadeDelete` calls `deleteDeals(cascadeTarget.ids, selectedKeys)` then keeps its toast/`setCascadeBusy` UI |
| `restoreDealsResult(ids)` → `{ ok; error? }` | the `POST /api/opportunities/restore` from `restoreDeals` `:263-273` | `restoreDeals` calls `restoreDealsResult(ids)` then keeps its toast |
| `analyzeDealsByIds(ids)` → `{ ok; error? }` | the `POST /api/deals/analyze` + refetch from `analyzeDeals` `:343-349` | `analyzeDeals` calls `analyzeDealsByIds(deals.map(d=>d.id))` then keeps its toast/`setAnalyzing` |
| `countMatching(deals, filters, stalledOnly)` → number | the `filteredDeals` predicate `:539-568` (pure) | the existing `filteredDeals` memo can call it too (optional dedup); the action calls it for the count |
| `describeFilters(params)` → string | new tiny pure formatter (no existing equivalent) | only the action uses it (summary text) |

`commitStageChange` (`:399-418`), `setPendingClose`, `applySuggestion`, the filter/view **setters**, and `fetchForecast` are already callable as-is — **no extraction needed**; the `run`s call them directly.

> **Verification of behaviour-preservation (AC-11):** after each extraction, the button/drag/setter path must produce byte-identical network calls and UI. The test for each action asserts the same `fetch` URL+body the page sent before; a snapshot/grep confirms the URL string appears **once** in the file.

---

## 5. Data flow (model → tool → directive → confirm gate → existing handler → board)

```
 user: "move the Acme deal to Won, we won on price"   (on /opportunities)
        │
        ▼ POST /api/chat  body.pageActions = getActionManifest()  (CLE-03 dock)
 ┌─────────────────────────── SERVER (CLE-04) ───────────────────────────┐
 │ model calls listPageActions() → sees opportunities.* for THIS page     │
 │ model calls invokePageAction("opportunities.moveStage",                │
 │                 { dealId, stage:"won", closeReason:{reason:"price"} })  │
 │   • entry found in manifest; jsonSchemaToZod.safeParse ok               │
 │   • decideAction({mutating:true,reversible:true,confirm:"risky",role}) │
 │        → confirm  →  requireConfirm = true                              │
 │   • return { ...invokeActionDirective(uuid, id, params, true) }         │
 └───────────────────────────────────┬────────────────────────────────────┘
                                      │ tool result carries _uiDirective
                                      ▼
 ┌────────────────────── CLIENT (CLE-03 + CLE-05) ───────────────────────┐
 │ parseUiDirective → {kind:"invokeAction", …, requireConfirm:true}        │
 │ runUiDirective → requireConfirm → CLE-05 confirm card (editable params) │
 │   user Approves                                                         │
 │   → runRegisteredAction("opportunities.moveStage", editedParams)        │
 │        → registry resolves to OUR run()  (CLE-06)                       │
 │            • deal found, stage valid, not same                          │
 │            • Won + closeReason present  → commitStageChange(...)  ◀── existing handler :399
 │                 → PUT /api/deals/:id {stage,closeReason}  + optimistic setDeals
 │            • returns ok("Marked Acme Won (price).")                     │
 │   → encodeActionResult(uuid, result) → chat.sendMessage("[[action-result]]…")
 └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼  the card visibly moved to Won on the board
 next POST /api/chat carries the envelope → model reads ok+summary → "Done — Acme is in Won."
```

For a **reason-less** Won move the only difference is the inner branch: `run` calls `setPendingClose(...)` (opens the page's `CloseReasonDialog`) and returns `ok:false, error:"close_reason_required"` with a summary telling the user to pick a reason; the human confirms in the dialog and the page's own `handleCloseReasonConfirm → commitStageChange` commits (§2 path 2).

For `applyFilter`/`setView`/`toggleForecast`/`toggleAnalytics` (`confirm:"never"`), `decideAction → execute → requireConfirm:false`, so CLE-03 runs them immediately (no card) and the board updates live.

---

## 6. Failure handling (every branch returns a `PageActionResult`; nothing throws)

| Failure | Where caught | Result |
|---|---|---|
| Stale/unknown `dealId` (moveStage/delete/autoProgress) | `dealsRef.current.find` / detail id compare (§3) | `{ ok:false, error:"Deal <id> is not in the current view." }`; no PUT/DELETE (E-1). |
| Unknown `stage` (moveStage) | `stagesRef`/`STAGES` check (§3.1) | `{ ok:false, error:'Unknown stage "<x>".' }`; no PUT (E-2). |
| Same-stage move | `deal.stage === stage` (§3.1) | `{ ok:true, summary:"… already in <stage>." }`; no PUT (E-6). |
| Won/Lost without reason | the gate branch (§2 path 2) | dialog opened; `{ ok:false, error:"close_reason_required", summary:"… pick a close reason …" }`. Never silent success (AC-3). |
| Won/Lost reason="other" without note | the note check (§3.1) | optimistic move rolled back; `{ ok:false, error:'A note is required when the reason is "other".' }`. |
| Server PUT/POST/DELETE non-OK | the existing handler's own non-OK branch (`commitStageChange` rollback `:413`; `submitCreate`/`deleteDeals`/`analyzeDealsByIds` return `{ok:false,error}`) | `{ ok:false, error }`; optimistic state already rolled back by the existing handler. |
| Empty deal name (createDeal) | `name.trim()` guard (§3.1) | `{ ok:false, error:"A deal name is required." }`; no POST (AC-4). |
| 0 deals (analyzePipeline) | `ids.length===0` (§3.1) | `{ ok:false, summary:"No deals to analyze." }` (AC-9). |
| Filter yields 0 | `countMatching` (§3.1) | `{ ok:true, summary:"No deals match (…)" }` — not an error (E-3 / AC-5). |
| No suggestion (autoProgress) | `suggestionRef.current` null (§3.2) | `{ ok:false, error:"There is no stage suggestion to apply for this deal." }` (AC-7). |
| Action invoked off-page | CLE-04 `invokePageAction` unknown-id refusal; CLE-03 `runRegisteredAction` `action_not_registered` | refusal/error; no effect (AC-10 / E-5). Not CLE-06 code — inherited. |
| `run` throws unexpectedly | CLE-03 `runRegisteredAction` try/catch (CLE-03 §2.3 / E-7) | `{ ok:false, error:<msg> }` round-trips; chat loop intact. Our `run`s avoid throwing by construction, but the safety net is upstream. |

---

## 7. Security

- **No new runnable surface, no new endpoints.** Every `run` calls an existing page handler that hits an existing API route the page already calls (`/api/deals/:id`, `/api/opportunities`, `/api/opportunities/:id`, `/api/opportunities/restore`, `/api/opportunities/:id/auto-progress`, `/api/deals/analyze`). The agent gets **exactly** the surface a human on this page already has — parity by construction (README §1.1, CLE-03 §7 security). No `eval`, no DOM-by-vision.
- **Params validated twice.** Client-side against the action's live Zod schema in `runRegisteredAction` (CLE-03 §2.3) and server-side against the manifest JSON Schema in `invokePageAction` (CLE-04 §2.4). `stage`/`risk` enums and `dealId` non-empty are enforced before any handler runs.
- **Tenant isolation unchanged.** The reused API routes are the same tenant-scoped endpoints (`WHERE tenantId` app-layer, as the page already relies on). The actions add no DB access of their own.
- **Role gating via `decideAction` (CLE-04 §2.1).** A viewer invoking any of these (all `mutating:true` except the filter/view ones) is **refused** inside `invokePageAction` (`role:viewer + mutating → refuse`) — a viewer can still drive `applyFilter`/`setView`/`toggle*` (read-only). No extra gating code in CLE-06; it inherits the plane.
- **Destructive `delete` is `confirm:"always"`** → always a card, regardless of approval mode (`decideAction` returns `confirm` for it via the irreversible/always path; here it is reversible-but-`confirm:"always"`, which still yields `confirm`). The close-reason gate adds a second human checkpoint for Won/Lost specifically.
- **No outbound, no cost.** None of these actions send mail/SMS/calls or spend money (`outbound:false`, `cost:"free"` throughout), so they never hit the outbound guardrails (CLE-13) — correct, the pipeline page has no outbound flow.

---

## 8. Test strategy

Unit/RTL with **vitest** + **@testing-library/react** (the pattern CLE-03/05 integration tests use). Mock `fetch`; spy the existing handlers/setters; assert `run → effect → result`. No live server except eval step 13.

- **`opportunities-actions.list.test.tsx`** — mount a harness rendering the list page (or a thin extraction of `opportunityListActions` built against a fixture `deals`/`activeStages` + spied setters):
  - **manifest membership + metadata** (AC-1): ids present; `delete.confirm==="always"`, `applyFilter.confirm==="never"`, `moveStage.confirm==="risky"` and `reversible===true`, `analyzePipeline.mutating===true`. `autoProgress` absent.
  - **moveStage non-closing** (AC-2): PUT `{stage:"demo"}`, optimistic setDeals, ok; PUT-fail → rollback + `ok:false`.
  - **moveStage Won gate — REQUIRED named test** (AC-3/E-4): no reason → `setPendingClose` called, `commitStageChange` NOT called with a commit, result not a silent success; with `{reason:"product_fit"}` → `commitStageChange(...,"won",...,{reason:"product_fit",note:null})` once, ok; `{reason:"other"}` no note → `ok:false`.
  - **createDeal** (AC-4): mapped POST body (`companyId===accountId`), refetch, ok; empty name → no POST.
  - **applyFilter incl. 0-result** (AC-5/E-3): `setActiveFilters` chip set; summary names filters + count; zero-match board → `ok:true` "No deals match".
  - **setView** (AC-6): `setViewMode("table")`; `archived:true` → archive path setters fired.
  - **delete + restore** (AC-8/E-8): `confirm:"always"`; DELETE with cascade; default cascade `[]`; bad cascade key rejected; restore POST `{ids:[id]}`.
  - **analyzePipeline** (AC-9): default ids = board ids; POST; 0-deal → `ok:false` "No deals to analyze."
  - **edge guards** (E-1/E-2/E-6): unknown id, unknown stage, same-stage.
- **`opportunities-actions.detail.test.tsx`** — mount the detail harness with a fixture `suggestion`:
  - manifest = `[opportunities.autoProgress]` (AC-1); autoProgress applies (POST `{apply:true}`, `applySuggestion` called, ok); no-suggestion → `ok:false`; wrong dealId → `ok:false` (AC-7/E-1).
- **`opportunities-actions.dedup.test.ts(x)`** — assert (by spying `global.fetch`) that the **button/drag path** and the **action path** issue the same URL+body for create, delete, restore, analyze, moveStage — proving one shared implementation (AC-11). Plus a static check (or review note) that each fetch URL string appears once.
- **off-page degradation** (AC-10/E-5): reuse CLE-03's lifecycle test shape — unmount the page, assert ids gone + `runRegisteredAction("opportunities.moveStage",…)` → `action_not_registered`.
- **Regression:** `pnpm tsc --noEmit` 0; `regression.sh` green; CLE-03/04/05 tests untouched; the page's manual flows (drag, create, filter, archive, delete, analyze) verified unchanged by the dedup tests (same network shape) + eval step 13.

Coverage target: 100% of the new `run` branches (each error path + happy path) and the §4 extractions. No new runtime dependency. No new API route.
