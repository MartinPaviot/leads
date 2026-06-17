# CLE-09 — Register the `/call-mode` page actions (non-dial) — Design

> Implements the **consumption** side of README §3.2 (`PageAction`) and §3.3 (`useRegisterPageActions`) for the Call Mode cockpit. It introduces **no** new contract and **no** new framework code; it declares a `PageAction[]` whose `run`s call handlers that already exist (cited `file:line` below) and calls the CLE-03 hook. The metadata each action carries is what CLE-04's `decideAction` reads to set `requireConfirm`, and what CLE-05's confirm card + risk badges render.
> The defining constraint of this page: it is the **densest** surface and the one with the most **human-bound** flows. The hard boundary around live telephony + money is enforced **by omission** (those actions are never declared) **plus** a guardrail test (an id-disjointness assertion). This mirrors README §2 verbatim ("l'agent prépare et navigue, l'humain exécute").
> Builds on: `_specs/CLE-03-action-directive-and-registry/design.md` (the `PageAction`/`PageActionResult` types §2.2, `useRegisterPageActions`/`runRegisteredAction` §2.3, the JSON-Schema serialization §4), `_specs/CLE-04-page-action-tools/design.md` (`decideAction` §2.1 maps our `confirm`/`mutating`/`outbound`/`reversible`/`cost` → a disposition; the manifest is read by `listPageActions`; outbound → `confirm`), `_specs/CLE-05-action-confirmation-ux/design.md` (the editable confirm card + `riskBadgesFor` rendered when `requireConfirm:true`). Mirrors the CLE-06 pilot (`_specs/CLE-06-register-opportunities/design.md`) one-for-one in shape.
> Real code anchored: `app/apps/web/src/app/(dashboard)/call-mode/page.tsx` (the cockpit, 2041 lines) + `_list-selector.tsx` + `_call-actions.tsx` + `_call-script.tsx` + `_edit-campaign-modal.tsx` + `_panels.tsx` + `_find-mobile.ts` + `components/meeting-scheduler.tsx`.

---

## 1. System fit — the handlers we reuse (file:line)

The whole feature is a thin declarative layer over functions that already exist. **Nothing below is re-implemented**; the `run` closures call these. Handlers already at page scope are called directly; handlers that today live **inside child components** are made callable via a minimal, behaviour-preserving lift (§4).

### 1.1 Page-scope handlers — `app/apps/web/src/app/(dashboard)/call-mode/page.tsx`

| Concern | Existing handler / state (file:line) | What it does today | Action that reuses it |
|---|---|---|---|
| Activate a sector list | `handleActivateSector(id)` `:901-916` — `POST /api/calls/lists/${id}/activate`; `setBusySectorId`; `reloadCampaignQueue()` on success | switches the daily top-up audience to that sector and reloads the queue + selector counts | `callMode.activateSectorList` |
| Back to whole ICP | `handleActivateAll()` `:918-930` — `POST /api/calls/lists/all/activate`; reload | clears the sprint, ranks the whole ICP by fit | `callMode.activateAllIcp` |
| Create a sector list from a phrase | `handleCreateList(phrase)` `:933-958` — `POST /api/calls/lists {phrase}`; on success `handleActivateSector(newId)`; `creatingList` guard | LLM resolves sector × persona, creates the list, activates it | `callMode.createSectorList` |
| Reload the campaign queue | `reloadCampaignQueue()` `:870-886` — `GET /api/calls/campaign` + `/api/calls/lists`; `setQueue`/`setSelectedId`/`setListsData` | the shared post-mutation refresh the activate/create handlers call | (used by the above; not its own action) |
| Edit the plan (open) | `setEditingPlan(true)` `:1076` opens `<EditCampaignModal>` `:1084-1095`; the `PATCH /api/calls/campaign` lives in `EditCampaignModal.save` `_edit-campaign-modal.tsx:70-91` | opens the goal+cadence modal; on save PATCHes + regenerates today's list | `callMode.editPlan` (calls the lifted PATCH, §4) |
| Select a prospect | `selectedId` / `setSelectedId` `:295`; the queue is `queue`/`filteredQueue` `:277,498-506` | the brief + script + softphone follow the selection | `callMode.selectProspect` |
| From-number override | `fromNumberOverride` / `setFromNumberOverride` `:271-276`; persisted + self-healed `:433-444`; the pool is `config.pool` `:90-95` | pins the outbound caller ID (or `null` = automatic local presence) | `callMode.setFromNumber` |
| By-day view | `handleSelectSystem(id)` `:889-892` — sets `selectedSystemId` (`today`/`callbacks_due`/`new`), persists; pure client filter `filteredQueue` `:498-506` | filters the loaded queue by attempt state | `callMode.byDayView` |
| Queue sort | `handleSortChange(s)` `:895-898` — sets `sortKey` (`CallListSort`), persists; pure re-order `sortQueueItems` `:505` | re-orders the current view (fit / oldest callback / fewest attempts) | `callMode.sortQueue` |
| Row enrich (Zeliq) | `handleEnrich(contactId)` `:465-494` — `POST /api/contacts/${contactId}/zeliq-enrich`; invalidates the brain cache | async deep enrich (email+phone) for the focal contact | `callMode.rowEnrich` |
| Drop a role-obsolete row | the `onRoleObsolete` callback `:1427-1434` — removes the contact from `queue` + advances `selectedId` | the page-side effect after the brief flags a left role | `callMode.markRoleObsolete` (post-PUT effect) |
| Campaign presence | `campaign` state `:324`; `needsOnboarding` `:323`; `accountScope` `:320` | whether a calling campaign exists (vs onboarding / scoped-account mode) | E-3 guard for the campaign actions |

### 1.2 Child-component handlers (lifted in §4) — sub-files

| Concern | Existing handler (file:line) | What it does | Action |
|---|---|---|---|
| Find a mobile (FullEnrich) | `requestFindMobile(contactIds)` — `call-mode/_find-mobile.ts:14-29` — `POST /api/contacts/fullenrich-enrich {contactIds}` (caps 100) | EU/CH waterfall mobile lookup; writes the number back later. **Already a shared module-level fn** (no lift needed — import it) | `callMode.rowFindMobile` / `callMode.bulkFindMobile` |
| Regenerate the script | `regenerate()` — `_call-script.tsx:185-208` — `POST /api/calls/script/generate {sector, contactId}`; `setDraft`+`setEditing(true)` | drafts a new script into the panel **for review** | `callMode.regenerateScript` |
| Save the script | `save()` — `_call-script.tsx:165-183` — `PUT /api/calls/script {sector, fields}` | persists the edited script | `callMode.editScript` |
| Flag role obsolete | `markRoleObsolete()` — `_panels.tsx:496-508` — `PUT /api/contacts/${id} {roleObsolete:true}`; then `onRoleObsolete?.(contactId)` | marks the sourced title stale + (via callback) drops the row | `callMode.markRoleObsolete` |
| Draft the email | `writeEmail()` — `_call-actions.tsx:34-57` — `POST /api/calls/draft-email {contactId, purpose:"meeting_request"}`; opens `EmailComposerPanel` (does NOT send) | AI-drafts then opens the composer for the human to send | `callMode.writeEmailDraft` |
| Book the meeting | `bookMeeting()` — `components/meeting-scheduler.tsx:60-108` — `POST /api/meetings/book {contactId, startTime, durationMinutes, conferencing, …}` (calendar event **+ invite**) | books the discovery meeting + sends the invite | `callMode.bookMeeting` |

### 1.3 Where `useRegisterPageActions` is called

The page declares its actions in a `useMemo` (stable id set) and registers them with a single hook call near the top of the component body, **after** the handlers it references are defined and **before** the early `if (loading) return …` / `if (needsOnboarding) return …` / `if (!config?.configured) return …` returns (`page.tsx:966-1030`). The hook (CLE-03 §2.3) registers on mount, clears on unmount, so the manifest always reflects the current page (AC-1).

> **Hook ordering constraint (important here — the page has four early returns).** `useRegisterPageActions` is a hook → it must be called unconditionally at the top level, **not** inside the `loading`/`needsOnboarding`/`!configured`/`!ready` branches. The `run` closures read live state via refs (§3) and guard on `campaign`/`selectedId`/the lifted script ref being present (E-3/E-5b), so registering before data loads is fine: the actions exist, but their `run` returns an honest `{ ok:false, error }` until the precondition is met. Placement: immediately after `handleCreateList` is defined (`page.tsx:958`) and after the §4 lifts, above the first `if (loading)`.

---

## 2. The human-bound boundary (the defining decision of this page)

CLE-06 had **zero** human-bound actions; CLE-09 has the most. The boundary is enforced two ways, both required:

1. **By omission.** The excluded flows (dial/`handleAppeler`, hang-up/`handleHangup`, voicemail-drop/`handleDropVoicemail`, in-call disposition/`handleDisposition`, call-again/skip, buy-number/`handleBuyNumber`) are simply **never wrapped** in a `PageAction`. They are not in the `useMemo` array, so they are not in the manifest, so `invokePageAction` cannot resolve them (CLE-04 §2.3 unknown-id refusal) and `runRegisteredAction` cannot run them (CLE-03 §2.3 `action_not_registered`). There is no code path from the chat to these handlers.

2. **By guardrail test.** A frozen `HUMAN_BOUND_IDS` set is asserted **disjoint** from the registered ids (requirements §7 step 10 / AC-11). This is a regression tripwire: if a future edit ever adds, say, `callMode.dropVoicemail`, the test fails. The set is co-located with the actions file as a documented constant so the intent is legible:

```ts
// call-mode page actions — the IDs we INTENTIONALLY do NOT register.
// Live WebRTC telephony + mic capture + in-call disposition are human-bound
// (README §2: "l'agent prépare et navigue, l'humain exécute"); buying a number
// spends real money and is admin-only. The agent PREPARES the call; the human
// PLACES and DISPOSITIONS it, and BUYS numbers. A test asserts the registered
// id set is disjoint from this — adding any of these would be a boundary breach.
export const CALLMODE_HUMAN_BOUND_IDS = [
  "callMode.call", "callMode.dial", "callMode.hangUp",
  "callMode.dropVoicemail", "callMode.disposition",
  "callMode.callAgain", "callMode.skip", "callMode.buyNumber",
] as const;
```

> **Why omission + a test, not a `surfaces` restriction or a role gate?** A `surfaces` restriction (README §3.2) narrows *where* an action is offered; it does not make an action *non-existent*. A role gate (`decideAction` refuse) still puts the action in the manifest and would let an admin run it. For a hard line ("the agent never dials, never disposes, never buys"), the action must not exist at all. The test guarantees it stays that way. This is the strongest, simplest expression of README §2.

> **The model's mental model (taught via the action descriptions + CLE-04 prompt).** The DECLARED actions' `description` strings say what the agent *can* do ("prepare the call: activate the list, pick the from-number, draft the script, tee up the meeting"). The CLE-04 `<page_actions>` prompt block already teaches the model to fall back to a headless tool when a page action is unavailable. Together, when asked to "call/hang up/leave a voicemail/log it/buy a number", the model finds no such action, and (per the prompt) explains it has prepared the call and the human places/dispositions it (and buys numbers in the header/Settings). It can still *read* prior outcomes via headless tools — it just cannot *set* a disposition or *place* a call.

> **Buy-number — the one contract-adjacent tension (flagged in §7).** The README money rule permits a paid action at `confirm:"always"` + admin-only as a *floor*. This spec chooses the **stricter** option (human-bound, undeclared) for blast-radius and prompt-injection reasons (requirements §3). The floor is recorded as the documented alternative; v1 ships buy-number excluded.

---

## 3. The exact `PageAction[]` array

Types imported from CLE-03: `import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types"; import { useRegisterPageActions } from "@/lib/chat/page-actions/registry";` and `import { z } from "zod";`. `confirm`/`mutating`/`outbound`/`reversible`/`cost` are the README §3.2 fields verbatim.

A small local helper keeps results uniform (not a contract — internal to the page, identical to CLE-06 §3):

```ts
const ok = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const err = (error: string, summary?: string): PageActionResult =>
  ({ ok: false, error, summary: summary ?? error });
```

Live-value refs so `run` reads the LIVE cockpit without re-registering on every state change (the CLE-06 §3.1 pattern — a stable id set + ref-read params):

```ts
const queueRef = useRef(queue);        useEffect(() => { queueRef.current = queue; });
const campaignRef = useRef(campaign);  useEffect(() => { campaignRef.current = campaign; });
const configRef = useRef(config);      useEffect(() => { configRef.current = config; });
const selectedIdRef = useRef(selectedId); useEffect(() => { selectedIdRef.current = selectedId; });
// Imperative handles for the child-component handlers (set by the lifts, §4).
const scriptApiRef = useRef<ScriptPanelApi | null>(null);   // { regenerate, save } | null when panel unmounted
const planApiRef   = useRef<EditPlanApi | null>(null);       // { patch(payload) } — always available (page owns the campaign)
const emailApiRef  = useRef<CallActionsApi | null>(null);    // { writeDraft } | null when no prospect
const meetingApiRef = useRef<CallActionsApi | null>(null);   // { book(slot) } | null when no prospect
```

```ts
const callModeActions: PageAction[] = useMemo(() => [

  // ── activateSectorList ─────────────────────────────────────
  {
    id: "callMode.activateSectorList",
    title: "Switch the call list to a sector",
    description:
      "Activate one of the saved sector lists so today's call queue is drawn from that audience " +
      "(e.g. the EMS directors, the Geneva foundations). Use when the user wants to call a specific segment. " +
      "This changes WHO is in the queue; it does not place any call.",
    params: z.object({ listId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ listId }): Promise<PageActionResult> => {
      if (!campaignRef.current) return err("No calling campaign yet — set up your calling plan first.");   // E-3
      const before = listsDataRef.current?.sector.find((l) => l.id === listId);
      await handleActivateSector(listId);                                                                   // reuses the page handler verbatim
      const after = listsDataRef.current?.sector.find((l) => l.id === listId);
      // handleActivateSector toasts + returns void; treat a queue reload as success, the toast path as failure.
      return ok(`Activated the "${before?.name ?? "selected"}" list — ${after?.counts.callable ?? queueRef.current.length} contacts to call.`);
    },
  },

  // ── activateAllIcp ─────────────────────────────────────────
  {
    id: "callMode.activateAllIcp",
    title: "Call the whole ICP",
    description: "Clear any sector filter and rank the entire ICP by fit for today's queue.",
    params: z.object({}),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async (): Promise<PageActionResult> => {
      if (!campaignRef.current) return err("No calling campaign yet — set up your calling plan first.");   // E-3
      await handleActivateAll();
      return ok(`Back to the whole ICP — ${queueRef.current.length} contacts.`);
    },
  },

  // ── createSectorList ───────────────────────────────────────
  {
    id: "callMode.createSectorList",
    title: "Create a sector call list from a phrase",
    description:
      "Create a new sector list from a plain-language phrase (e.g. 'the DGs of EMS in French Switzerland') " +
      "and activate it. The phrase is resolved to a sector × persona segment. Use when the user describes a NEW audience to call.",
    params: z.object({ phrase: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ phrase }): Promise<PageActionResult> => {
      if (!campaignRef.current) return err("No calling campaign yet — set up your calling plan first.");   // E-3
      if (creatingListRef.current) return err("A list is already being created — try again in a moment.");  // E-8
      const p = phrase.trim();
      if (!p) return err("Describe the audience to create a list.");                                        // AC-4 (mirrors selector guard)
      await handleCreateList(p);                                                                            // creates + activates + reloads
      return ok(`Created and activated "${p}".`);
    },
  },

  // ── editPlan ───────────────────────────────────────────────
  {
    id: "callMode.editPlan",
    title: "Edit the calling plan",
    description:
      "Change the calling goal and cadence: goal type (calls/meetings), target, window, max attempts per " +
      "contact, retry window in days, list frequency, working days. The server recomputes the daily quota " +
      "and regenerates today's list. Use when the user wants to change how many/how often they call.",
    params: z.object({
      goalType: z.enum(["calls", "meetings"]).optional(),
      target: z.number().positive().optional(),
      window: z.enum(["day", "week", "month"]).optional(),
      maxAttempts: z.number().int().positive().optional(),
      windowDays: z.number().int().positive().optional(),
      listFrequency: z.enum(["daily", "weekly"]).optional(),
      workingDays: z.array(z.number().int().min(0).max(6)).optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async (p): Promise<PageActionResult> => {
      if (!campaignRef.current) return err("No calling campaign yet — set up your calling plan first.");   // E-3
      if (p.target != null && p.target <= 0) return err("The target must be a positive number.");          // AC-5 (mirrors form guard)
      const r = await planApiRef.current!.patch(p);   // §4 lift of EditCampaignModal.save's PATCH (campaign always present here)
      return r.ok
        ? ok(`Calling plan updated — ${r.perDay ?? "?"}/day.`)
        : err(r.error ?? "Couldn't update the plan.");
    },
  },

  // ── selectProspect ─────────────────────────────────────────
  {
    id: "callMode.selectProspect",
    title: "Open a prospect in the cockpit",
    description:
      "Select a contact from the current call list so their brief, script and softphone load. " +
      "Navigation only — it does NOT call them. Use when the user wants to look at a specific prospect next.",
    params: z.object({ contactId: z.string().min(1) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ contactId }): Promise<PageActionResult> => {
      const item = queueRef.current.find((q) => q.contactId === contactId);
      if (!item) return err("That contact is not in the current call list.");                               // E-1
      setSelectedId(contactId);
      return ok(`Opened ${item.contactName}.`);
    },
  },

  // ── setFromNumber ──────────────────────────────────────────
  {
    id: "callMode.setFromNumber",
    title: "Choose the outbound caller ID",
    description:
      "Pick which of your provisioned numbers you call from, or 'automatic' for local-presence matching. " +
      "This sets your caller ID for upcoming calls; it does NOT place a call and does NOT buy a number.",
    params: z.object({ number: z.string().min(1) }),  // an E.164 in the pool, or the literal "automatic"
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ number }): Promise<PageActionResult> => {
      if (number === "automatic") { setFromNumberOverride(null); return ok("Caller ID set to automatic (local presence)."); }
      const pool = configRef.current?.pool ?? [];
      if (pool.length === 0) return err("No outbound number provisioned. Buy one in the header (admin) or Settings → Voice."); // E-4
      if (!pool.some((p) => p.e164 === number)) return err("That number isn't in your pool. Buy one in the header (admin) or Settings → Voice.");
      setFromNumberOverride(number);
      return ok(`Calling from ${formatE164(number)}.`);   // reuses the page's formatE164
    },
  },

  // ── byDayView ──────────────────────────────────────────────
  {
    id: "callMode.byDayView",
    title: "Switch the by-day view",
    description: "Filter the loaded queue by attempt state: today (all), callbacks (already attempted), new (never attempted).",
    params: z.object({ view: z.enum(["today", "callbacks", "new"]) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ view }): Promise<PageActionResult> => {
      const id = view === "callbacks" ? "callbacks_due" : view;   // E-6 friendly→internal map
      handleSelectSystem(id as "today" | "callbacks_due" | "new");
      const n = view === "callbacks"
        ? queueRef.current.filter((q) => (q.attemptCount ?? 0) > 0).length
        : view === "new"
          ? queueRef.current.filter((q) => (q.attemptCount ?? 0) === 0).length
          : queueRef.current.length;
      return ok(view === "callbacks" ? `Showing callbacks due (${n}).` : view === "new" ? `Showing new contacts (${n}).` : `Showing all (${n}).`);
    },
  },

  // ── sortQueue ──────────────────────────────────────────────
  {
    id: "callMode.sortQueue",
    title: "Sort the call queue",
    description: "Re-order the current queue: by fit (score), by oldest callback, or by fewest attempts.",
    params: z.object({ sort: z.enum(["fit", "callback", "attempts"]) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ sort }): Promise<PageActionResult> => {
      const key = sort === "callback" ? "oldest_callback" : sort === "attempts" ? "fewest_attempts" : "fit";  // E-6
      handleSortChange(key);
      return ok(sort === "callback" ? "Sorted by oldest callback." : sort === "attempts" ? "Sorted by fewest attempts." : "Sorted by fit.");
    },
  },

  // ── regenerateScript ───────────────────────────────────────
  {
    id: "callMode.regenerateScript",
    title: "Regenerate the call script",
    description:
      "Draft a fresh call script for the current sector from your product + ICP. The draft loads into the " +
      "script panel for you to REVIEW and save — it is not applied automatically. Use when the user wants a new script.",
    params: z.object({ sector: z.string().optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ sector }): Promise<PageActionResult> => {
      const api = scriptApiRef.current;
      if (!api) return err("Open a prospect first so the script panel is available.");                       // E-5b
      const r = await api.regenerate(sector);
      return r.ok
        ? ok(`Drafted a new script${sector ? ` for ${sector}` : ""} — review it in the panel.`)
        : err(r.error ?? "Couldn't generate a script.");
    },
  },

  // ── editScript ─────────────────────────────────────────────
  {
    id: "callMode.editScript",
    title: "Save changes to the call script",
    description:
      "Update and save the call script's fields (opener, problems/enjeux, validation question, booking ask, " +
      "the 'if no' response). Persists immediately for this sector. Use when the user dictates a script change.",
    params: z.object({
      opener: z.string().optional(),
      problems: z.array(z.string()).optional(),
      permissionCheck: z.string().optional(),
      bookingAsk: z.string().optional(),
      noResponse: z.string().optional(),
      sector: z.string().optional(),
    }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async (p): Promise<PageActionResult> => {
      const api = scriptApiRef.current;
      if (!api) return err("Open a prospect first so the script panel is available.");                       // E-5b
      const r = await api.save(p);   // merges supplied fields over the current script, PUTs
      return r.ok ? ok("Script saved.") : err(r.error ?? "Couldn't save the script.");
    },
  },

  // ── rowEnrich (Zeliq, credits) ─────────────────────────────
  {
    id: "callMode.rowEnrich",
    title: "Enrich this contact",
    description:
      "Run deep enrichment (Zeliq) on a contact to fill in their email and phone. Uses credits and runs " +
      "in the background — the details land on the contact shortly. Use when a contact is missing coordinates.",
    params: z.object({ contactId: z.string().min(1) }),
    mutating: true, reversible: false, cost: "credits", confirm: "risky",
    run: async ({ contactId }): Promise<PageActionResult> => {
      const r = await enrichContactResult(contactId);   // §4 thin wrapper around handleEnrich's POST
      return r.ok
        ? ok("Enrichment started — email and phone will fill in shortly.")
        : err(r.error ?? "Enrichment unavailable.");
    },
  },

  // ── rowFindMobile (FullEnrich, credits) ────────────────────
  {
    id: "callMode.rowFindMobile",
    title: "Find a mobile for this contact",
    description:
      "Look up a mobile number for a contact via the EU/CH waterfall (FullEnrich). Uses credits; the number " +
      "lands on the contact shortly. Use when a contact has no callable number.",
    params: z.object({ contactId: z.string().min(1) }),
    mutating: true, reversible: false, cost: "credits", confirm: "risky",
    run: async ({ contactId }): Promise<PageActionResult> => {
      const r = await requestFindMobile([contactId]);   // imported shared helper, no duplication
      return r.ok ? ok("Looking for a mobile — it'll land on the contact shortly.") : err(r.error ?? "Couldn't request a mobile.");
    },
  },

  // ── bulkFindMobile (FullEnrich, credits) ───────────────────
  {
    id: "callMode.bulkFindMobile",
    title: "Find mobiles for several contacts",
    description:
      "Request mobile lookups for a set of contacts in the current call list that have no number (FullEnrich, " +
      "uses credits, capped at 100). Use when the user wants to fill in missing numbers for the loaded queue.",
    params: z.object({ contactIds: z.array(z.string().min(1)) }),
    mutating: true, reversible: false, cost: "credits", confirm: "risky",
    run: async ({ contactIds }): Promise<PageActionResult> => {
      if (contactIds.length === 0) return err("No contacts to enrich.");                                     // AC-8 (mirrors helper guard)
      const r = await requestFindMobile(contactIds);   // helper caps at 100 (E-9)
      return r.ok ? ok(`Requested mobiles for ${r.requested ?? contactIds.length} contacts.`) : err(r.error ?? "Couldn't request mobiles.");
    },
  },

  // ── markRoleObsolete ───────────────────────────────────────
  {
    id: "callMode.markRoleObsolete",
    title: "Flag a contact as having left their role",
    description:
      "Mark a contact's sourced job title as obsolete (they left the role) and drop them from the call list. " +
      "Reversible. Use when the user knows a prospect no longer holds the position.",
    params: z.object({ contactId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ contactId }): Promise<PageActionResult> => {
      const item = queueRef.current.find((q) => q.contactId === contactId);
      if (!item) return err("That contact is not in the current call list.");                               // E-1
      const r = await markRoleObsoleteResult(contactId);   // §4 wrapper around the brief's PUT
      if (!r.ok) return err(r.error ?? "Couldn't flag the role.");
      // page-side effect: same as the brief's onRoleObsolete (drop row + advance selection)
      const remaining = queueRef.current.filter((q) => q.contactId !== contactId);
      setQueue(remaining);
      if (selectedIdRef.current === contactId) setSelectedId(remaining[0]?.contactId ?? null);
      return ok(`Flagged ${item.contactName} as having left the role — removed from the list.`);
    },
  },

  // ── writeEmailDraft (opens composer; NO send) ──────────────
  {
    id: "callMode.writeEmailDraft",
    title: "Draft the follow-up email",
    description:
      "AI-draft a meeting-request email to the selected prospect and OPEN it in the composer for you to review " +
      "and send. It does NOT send — you send from the composer. Uses credits for the draft.",
    params: z.object({ contactId: z.string().min(1) }),
    mutating: false, outbound: false, reversible: true, cost: "credits", confirm: "never",
    run: async ({ contactId }): Promise<PageActionResult> => {
      const api = emailApiRef.current;
      if (!api) return err("Open a prospect first so the email composer is available.");                     // E-5b
      const r = await api.writeDraft(contactId);
      return r.ok
        ? ok("Drafted the email — review and send it in the composer.")
        : ok("Opened a blank email — the AI draft was unavailable, write it by hand in the composer.");      // existing fallback (still opens)
    },
  },

  // ── bookMeeting (OUTBOUND — calendar + invite) ─────────────
  {
    id: "callMode.bookMeeting",
    title: "Book the discovery meeting",
    description:
      "Book the discovery meeting with the selected prospect — creates the calendar event AND sends them an " +
      "invite. Pass startTime (ISO), optional duration (default 45m) and conferencing (sovereign/google_meet/teams/zoom). " +
      "This SENDS an invite externally, so it always asks you to confirm first.",
    params: z.object({
      contactId: z.string().min(1),
      startTime: z.string().min(1),
      durationMinutes: z.number().int().positive().optional(),
      conferencing: z.enum(["sovereign", "google_meet", "teams", "zoom"]).optional(),
      title: z.string().optional(),
    }),
    mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
    run: async (p): Promise<PageActionResult> => {
      const api = meetingApiRef.current;
      if (!api) return err("Open a prospect first so the meeting can be booked.");                           // E-5b
      const start = new Date(p.startTime);
      if (Number.isNaN(start.getTime())) return err("That date and time doesn't look valid.");              // AC-10 (mirrors card guard)
      if (start.getTime() <= Date.now()) return err("Pick a time in the future.");                          // E-7
      const r = await api.book(p);
      return r.ok
        ? ok(`Meeting booked — invite sent.`, { joinUrl: r.joinUrl ?? null })
        : err(r.error ?? "Couldn't book the meeting.");
    },
  },

  // eslint-disable-next-line react-hooks/exhaustive-deps
], []); // stable id set; run() reads live values via refs / lifted handles (stable)

useRegisterPageActions(callModeActions);
```

> **Why `useMemo([], [])` is safe here (same justification as CLE-06 §3.1).** State **setters** (`setSelectedId`, `setFromNumberOverride`, `setQueue`) are referentially stable (React guarantee). The page functions (`handleActivateSector`, `handleActivateAll`, `handleCreateList`, `handleSelectSystem`, `handleSortChange`, `formatE164`) are `useCallback`/module-level and stable. The §4 wrappers (`enrichContactResult`, `markRoleObsoleteResult`, `planApiRef`/`scriptApiRef`/`emailApiRef`/`meetingApiRef`) are stable refs or `useCallback`. Live *values* (`queue`, `campaign`, `config`, `selectedId`, `listsData`, `creatingList`) are read through refs. This keeps the action **id set** stable, so CLE-03's `useRegisterPageActions` (keyed on `actions.map(a=>a.id).join("|")`, CLE-03 §2.3) does not re-register on every queue change — exactly the pattern CLE-03 designed for. (`listsDataRef`/`creatingListRef` are added alongside the other refs.)

> **`writeEmailDraft` and the existing `composeEmail` directive.** Per the constitution, opening the composer is already a first-class directive (`{ kind: "composeEmail" }`, README §3.1). `writeEmailDraft` deliberately keeps the *send* human: its `run` drafts (the LLM call) then opens the composer via the existing `CallActions.writeEmail` path (which sets the composer state). The action is `mutating:false, outbound:false` — nothing is sent until the human clicks Send in the composer. We do **not** add a new "send email" page action on Call Mode; sending stays the human's click, consistent with the page's whole prepare-not-execute posture. (If a future page wants agent-send, that is a separate, outbound `confirm:"always"` action — not here.)

---

## 4. The handler lifts (the only edits to existing components — all behaviour-preserving)

Three handlers today live **inside** child components and read component `useState` directly, so they cannot be called from the page's `run` closures without a lift. Each lift is a **pure exposure** of the existing function via an imperative handle (`useImperativeHandle` on a `ref` the page passes down) or a lifted callback — **same body, same fetch URL, same effects** — with the button rewired to call the exposed handle so there is exactly one copy (AC-13). The page-scope handlers (`handleActivateSector`, `handleActivateAll`, `handleCreateList`, `handleSelectSystem`, `handleSortChange`, `setSelectedId`, `setFromNumberOverride`) need **no** lift — the `run`s call them directly.

| Lift (new) | Body (exposed verbatim from) | Mechanism | Old caller rewired |
|---|---|---|---|
| `scriptApiRef → { regenerate(sector?), save(fields) }` | `_call-script.tsx` `regenerate()` `:185-208` and `save()` `:165-183` | `CallScriptPanel` gains a `apiRef` prop; `useImperativeHandle(apiRef, () => ({ regenerate, save }))`. `regenerate(sector?)` uses the supplied sector or the panel's current `sector` state; `save(fields)` merges `fields` over the current `draft ?? fields` then runs the existing PUT body. Returns `{ ok; error? }`. | the panel's "Régénérer"/"Enregistrer" buttons keep calling `regenerate()`/`save()` (now the same fns the handle exposes); the page passes `apiRef={scriptApiRef}` (`page.tsx:1474`). Ref is null when the panel is unmounted (no prospect) → E-5b. |
| `planApiRef → { patch(payload) }` | the `PATCH /api/calls/campaign` in `_edit-campaign-modal.tsx` `save()` `:70-91` | extract the PATCH into a page-level `useCallback` `patchPlan(partial)` that maps the partial to the same payload shape `useCallPlan(...).payload` produces and PATCHes; `EditCampaignModal.save` is rewired to call `patchPlan(payload)` then keep its `onUpdated`/`onClose`/toast. The page also updates `campaign`+`queue` from the response in `patchPlan` (the same `onUpdated` effect). Returns `{ ok; perDay?; error? }`. | the modal's "Save plan" button → `save()` → `patchPlan(...)`; the action → `patchPlan(partial)`. One PATCH copy. |
| `emailApiRef → { writeDraft(contactId) }` and `meetingApiRef → { book(slot) }` | `_call-actions.tsx` `writeEmail()` `:34-57` (draft + open composer) and `meeting-scheduler.tsx` `bookMeeting()` `:60-108` (POST /api/meetings/book) | `CallActions` gains `emailApiRef`/`meetingApiRef` props; it owns the composer + scheduler state, so it exposes `writeDraft(contactId)` (runs the existing draft+open) and `book(slot)` (calls the scheduler's book with the supplied slot). For `book`, the scheduler's `bookMeeting` body is lifted into a `bookWith(slot)` the card exposes via its own `onBooked`/ref, or `CallActions` calls `/api/meetings/book` through the same shared path — **whichever keeps one copy** (the scheduler already centralizes the POST; the cleanest lift is `MeetingSchedulerCard` exposing `book(slot)` via `useImperativeHandle`, and `CallActions` forwarding it). Returns `{ ok; joinUrl?; error? }`. | the brief's "Write email"/"Book meeting" buttons keep their behaviour; the page passes the refs. Null when no prospect → E-5b. |
| `enrichContactResult(contactId)` → `{ ok; error? }` | the `POST /api/contacts/${id}/zeliq-enrich` from `handleEnrich` `page.tsx:469-486` | a page-level `useCallback` lifting the fetch out of `handleEnrich`; `handleEnrich` calls it then keeps its `setEnriching`/`toast`/cache-invalidation. | `handleEnrich` (the brief's "à enrichir" button) → `enrichContactResult`; the action → `enrichContactResult`. One copy. |
| `markRoleObsoleteResult(contactId)` → `{ ok; error? }` | the `PUT /api/contacts/${id} {roleObsolete:true}` from `_panels.tsx` `markRoleObsolete` `:499-503` | the brief's `markRoleObsolete` is rewired to call a shared `requestRoleObsolete(contactId)` (a tiny module-level fn next to `requestFindMobile`, or a page-level `useCallback` passed down) then keep its `setMarkingLeft`/`onRoleObsolete`. The action calls the same fn, then applies the page-side drop. | the brief's "a quitté ce poste" button → `requestRoleObsolete`; the action → `requestRoleObsolete`. One PUT copy. |

> `requestFindMobile` (`_find-mobile.ts:14`) is **already** a shared module-level helper — the action imports it directly; no lift, no duplication (the per-row `ReachabilityInfo` and the bulk `ReachabilitySummary` already share it, `_reachability-info.tsx:43`, `_reachability-summary.tsx:36`).

> **Verification of behaviour-preservation (AC-13):** after each lift, the button/setter path must produce byte-identical network calls and UI. The test for each action asserts the same `fetch` URL+body the page/child sent before; a grep confirms each URL string appears **once**.

---

## 5. Data flow (model → tool → directive → confirm gate → existing handler → cockpit)

```
 user: "switch to the EMS list and book Tuesday 2pm"   (on /call-mode)
        │
        ▼ POST /api/chat  body.pageActions = getActionManifest()  (CLE-03 dock)
 ┌─────────────────────────── SERVER (CLE-04) ───────────────────────────┐
 │ model calls listPageActions() → sees callMode.* for THIS page          │
 │ model calls invokePageAction("callMode.activateSectorList",{listId})   │
 │   • entry found; jsonSchemaToZod.safeParse ok                          │
 │   • decideAction({mutating:true,reversible:true,confirm:"risky",role}) │
 │        → confirm  →  requireConfirm = true                             │
 │   • return { ...invokeActionDirective(uuid, id, params, true) }        │
 │ model calls invokePageAction("callMode.bookMeeting",{startTime,…})     │
 │   • decideAction({outbound:true,confirm:"always"}) → confirm          │
 │        → requireConfirm = true (outbound path, any mode)               │
 └───────────────────────────────────┬────────────────────────────────────┘
                                      │ each tool result carries _uiDirective
                                      ▼
 ┌────────────────────── CLIENT (CLE-03 + CLE-05) ───────────────────────┐
 │ parseUiDirective → {kind:"invokeAction", …, requireConfirm:true}        │
 │ runUiDirective → requireConfirm → CLE-05 confirm card (editable params, │
 │                  bookMeeting shows "Sends externally" badge)            │
 │   user Approves                                                         │
 │   → runRegisteredAction("callMode.activateSectorList", params)          │
 │        → registry resolves to OUR run() (CLE-09)                        │
 │            • campaign present → handleActivateSector(listId)  ◀── existing handler :901
 │                 → POST /api/calls/lists/:id/activate + reloadCampaignQueue
 │            • ok("Activated the \"EMS\" list — N contacts.")             │
 │   → encodeActionResult(uuid, result) → chat.sendMessage("[[action-result]]…")
 └───────────────────────────────────┬────────────────────────────────────┘
                                      ▼  the queue visibly changed; the meeting card is up to confirm
 next POST /api/chat carries the envelopes → model reads ok+summary → "Done — calling the EMS list; confirm the Tuesday meeting in the card."
```

For the `confirm:"never"` actions (`selectProspect`/`setFromNumber`/`byDayView`/`sortQueue`), `decideAction → execute → requireConfirm:false`, so CLE-03 runs them immediately (no card) and the cockpit updates live. For an **EXCLUDED** id (`callMode.call` etc.), `invokePageAction` finds no manifest entry and returns `{ error, availableActionIds }` with **no** `_uiDirective` — the client dispatches nothing; the model explains the human places the call (§2).

---

## 6. Failure handling (every branch returns a `PageActionResult`; nothing throws)

| Failure | Where caught | Result |
|---|---|---|
| No campaign (onboarding / scoped mode) | `campaignRef.current` null (§3) | `{ ok:false, error:"No calling campaign yet — set up your calling plan first." }`; no POST/PATCH (E-3). |
| Stale/unknown `contactId` (selectProspect/markRoleObsolete) | `queueRef.current.find` (§3) | `{ ok:false, error:"That contact is not in the current call list." }`; no state change/PUT (E-1). |
| Empty/whitespace `phrase` (createSectorList) | `phrase.trim()` guard (§3) | `{ ok:false, error:"Describe the audience to create a list." }`; no POST (AC-4). |
| Create already in flight | `creatingListRef.current` (§3) | `{ ok:false, error:"A list is already being created…" }`; no duplicate POST (E-8). |
| Non-positive `target` (editPlan) | `p.target <= 0` guard (§3) | `{ ok:false, error:"The target must be a positive number." }`; no PATCH (AC-5). |
| Script panel unmounted (regenerate/edit/writeEmail/book) | `scriptApiRef`/`emailApiRef`/`meetingApiRef` null (§3) | `{ ok:false, error:"Open a prospect first …" }`; no POST/PUT (E-5b). |
| Empty bulk list (bulkFindMobile) | `contactIds.length===0` (§3) | `{ ok:false, error:"No contacts to enrich." }`; helper not called (AC-8). |
| Invalid / past `startTime` (bookMeeting) | `Number.isNaN` / past-instant guards (§3) | `{ ok:false, error }`; no POST (AC-10 / E-7). |
| No pool number (setFromNumber to a specific number) | `pool.length===0` / not-in-pool (§3) | `{ ok:false, error:"No outbound number provisioned / not in your pool…" }`; no override change (E-4). |
| Server non-OK (activate/create/patch/generate/save/enrich/find/role/book) | the existing handler's own non-OK branch (toasts) + the §4 wrappers returning `{ok:false,error}` | `{ ok:false, error }`; the existing optimistic/loading state already settled by the handler. |
| EXCLUDED id invoked (call/hangUp/dropVoicemail/disposition/callAgain/skip/buyNumber) | CLE-04 `invokePageAction` unknown-id refusal (id not in manifest) | `{ error, availableActionIds }`, no directive; never a dial/voicemail/disposition/purchase (AC-11). Not CLE-09 code — the boundary holds because the id was never declared. |
| Action invoked off `/call-mode` | CLE-04 unknown-id refusal; CLE-03 `runRegisteredAction` `action_not_registered` | refusal/error; no effect (AC-12 / E-5). Inherited. |
| `run` throws unexpectedly | CLE-03 `runRegisteredAction` try/catch (CLE-03 §2.3 / E-7) | `{ ok:false, error:<msg> }` round-trips; chat loop intact. Our `run`s avoid throwing by construction; the safety net is upstream. |

---

## 7. Security

- **No new runnable surface, no new endpoints.** Every `run` calls an existing page/child handler that hits an existing API route the page already calls (`/api/calls/lists` + `/activate`, `/api/calls/campaign`, `/api/calls/script` + `/generate`, `/api/contacts/:id/zeliq-enrich`, `/api/contacts/fullenrich-enrich`, `/api/contacts/:id`, `/api/calls/draft-email`, `/api/meetings/book`). The agent gets **exactly** the non-dial surface a human on this page already has — parity by construction (README §1.1). No `eval`, no DOM-by-vision.
- **The live-telephony + money surface is NOT exposed (the headline security property).** `/api/calls/start` (dial + mic), `/api/calls/:id/voicemail-drop`, `/api/calls/:id/disposition`, and `/api/calls/numbers` (purchase) are reachable by `handleAppeler`/`handleDropVoicemail`/`handleDisposition`/`handleBuyNumber` **but no `PageAction` wraps them** (§2). The chat has **no** code path to place a call, drop a voicemail, set a disposition, or buy a number. The `CALLMODE_HUMAN_BOUND_IDS` disjointness test is the regression tripwire (AC-11). A prompt-injection-influenced model naming `callMode.buyNumber` resolves to the unknown-id refusal, never to a purchase.
- **Params validated twice.** Client-side against the action's live Zod schema in `runRegisteredAction` (CLE-03 §2.3) and server-side against the manifest JSON Schema in `invokePageAction` (CLE-04 §2.4). Enums (`conferencing`, `byDayView.view`, `sortQueue.sort`, `editPlan.goalType/window`) and non-empty ids are enforced before any handler runs.
- **Money / credits gating.** `bookMeeting` is the only DECLARED **outbound** action → `decideAction` returns `confirm` via the outbound path **regardless** of approval mode (CLE-04 §2.1), and CLE-05 surfaces a "Sends externally" badge. The credit-spending actions (`rowEnrich`/`rowFindMobile`/`bulkFindMobile`) are `cost:"credits"` + `confirm:"risky"` → always a confirm card with a "Uses credits" badge before the spend (CLE-05 §5). **Real money** (buy-number, `cost:"money"`) is not declared at all (stronger than the README floor of `confirm:"always"`+admin). No action is `cost:"money"`.
- **Role gating via `decideAction` (CLE-04 §2.1).** A viewer invoking any of the mutating/outbound actions is **refused** inside `invokePageAction` (`role:viewer + mutating/outbound → refuse`); a viewer can still drive the read-only ones (`selectProspect`/`byDayView`/`sortQueue`/`setFromNumber`). The excluded buy-number flow's existing admin gate (`useCan("billing:manage")`, `page.tsx:1729`) is untouched — we simply never expose the action. No extra gating code in CLE-09; it inherits the plane.
- **Tenant isolation unchanged.** The reused API routes are the same tenant-scoped endpoints the page already relies on (`WHERE tenantId` app-layer). The actions add no DB access of their own.
- **`setFromNumber` is config, not a leak.** It writes only the rep's own `localStorage` override (`page.tsx:443`); it cannot select a number outside the tenant's `config.pool` (the guard rejects non-pool values, E-4). It never buys, never dials.

---

## 8. Test strategy

Unit/RTL with **vitest** + **@testing-library/react** (the pattern CLE-03/05/06 tests use). Mock `fetch`; spy the existing handlers/setters or the lifted refs; assert `run → effect → result`. No live server except eval step 13.

- **`callmode-actions.test.tsx`** — mount a harness rendering the Call Mode page (or a thin extraction of `callModeActions` built against a fixture `queue`/`campaign`/`config`/`listsData` + spied setters and lifted refs):
  - **manifest membership + metadata** (AC-1): the §2 ids present with correct scalars (`bookMeeting.outbound===true`+`confirm==="always"`; `rowEnrich.cost==="credits"`+`confirm==="risky"`; `setFromNumber.mutating===false`+`confirm==="never"`; `selectProspect.mutating===false`; `writeEmailDraft.outbound===false`+`cost==="credits"`). **The EXCLUDED ids are absent** (the required boundary assertion, AC-11).
  - **activate/create/editPlan** (AC-2/AC-3/AC-4/AC-5): the right POST/PATCH + reload; guard branches (no campaign, empty phrase, target<=0, create-in-flight) → no network.
  - **view/config actions** (AC-6/E-6): `selectProspect`/`setFromNumber`/`byDayView`/`sortQueue` → the right setter + enum mapping; unknown contact / non-pool number → `ok:false`.
  - **script actions** (AC-7/E-5b): `regenerate`/`save` via the lifted ref; "review" vs "saved" summaries; panel-unmounted → `ok:false`.
  - **credit actions** (AC-8/E-9): `rowEnrich`/`rowFindMobile`/`bulkFindMobile` → their POST behind `confirm:"risky"`; "started"/"requested" summaries; empty bulk → `ok:false`; cap respected.
  - **markRoleObsolete** (AC-9/E-1): PUT + row drop + selection advance; unknown id → `ok:false`.
  - **writeEmailDraft/bookMeeting** (AC-10/E-7): draft opens composer (no send); book is `confirm:"always"`, POST, `joinUrl` in `data`; past/invalid time → `ok:false` no POST.
- **`callmode-actions.boundary.test.ts(x)`** — **the required named test**: assert the registered id set is **disjoint** from `CALLMODE_HUMAN_BOUND_IDS` (§2); assert no `run` references `handleAppeler`/`handleHangup`/`handleDropVoicemail`/`handleDisposition`/`handleBuyNumber` (static check / grep note). (AC-11.)
- **`callmode-actions.dedup.test.ts(x)`** — **the second required named test**: assert (by spying `global.fetch`) that the button/setter path and the action path issue the **same** URL+body for activate / create / editPlan / regenerate / save / enrich / find-mobile / role-obsolete / draft-email / book — proving one shared implementation (AC-13). Plus a static check that each fetch URL string appears once across the page + child files (post-lift).
- **off-page degradation** (AC-12/E-5): reuse CLE-03's lifecycle test shape — unmount the page, assert the `callMode.*` ids are gone + `runRegisteredAction("callMode.activateSectorList",…)` → `action_not_registered`.
- **Regression:** `pnpm tsc --noEmit` 0; `regression.sh` green; CLE-03/04/05/06 tests untouched; the page's manual flows (list selector, edit-plan, from-number incl. **buy**, by-day, sort, script regen/edit, enrich, find-mobile, role-obsolete, write-email, book-meeting, **and the full live dial→disposition path**) verified unchanged by the dedup tests (same network shape) + eval step 13.

Coverage target: 100% of the new `run` branches (each error path + happy path) and the §4 lifts. No new runtime dependency. No new API route.
