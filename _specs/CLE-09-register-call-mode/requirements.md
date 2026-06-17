# CLE-09 — Register the `/call-mode` page actions (non-dial) — Requirements

> The **densest** page in the initiative, and the one where the human-bound boundary matters most. Call Mode is a three-column cold-call cockpit: a queue/list selector, a per-prospect brief + softphone, and an editable script rail. The agent can **prepare the call** end to end — build/activate the audience, pick the from-number, sort and page the queue, regenerate/edit the script, enrich the row, find the mobile, flag a stale role, draft the email, book the meeting — but the **human places and dispositions the call**. Live WebRTC telephony (dial, hang-up, voicemail-drop, in-call disposition, the six outcomes) and spending real money (buying a phone number) are **NOT** declared executable.
> Constitution: `_specs/chat-live-executor/README.md` — SSOT for every contract cited: §3.1 directive `invokeAction`, §3.2 `PageAction`, §3.3 `useRegisterPageActions`/`getActionManifest`/`runRegisteredAction`, §3.5 result envelope, §3.6 two-tier routing, and **§2 non-scope (the hard boundary)**: "Média temps réel piloté par l'agent : décrocher/raccrocher un appel WebRTC, drop voicemail, disposition *pendant* l'appel, capture micro du recorder. L'agent **prépare et navigue**, l'humain exécute." Buying a number spends real money → human-bound or `confirm:"always"`.
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` — §3 parity table, `/call-mode` row (line 96): covers headless today (`getCallList`, `applyCallSprint`, enrich, draft-email, book, script regen/edit), the actionment layer this feature adds (**"edit-plan, list-selector (activer secteur/ICP, créer liste), from-number picker, by-day view, sort"**), and the **device-bound column**: **"dial/hang-up/voicemail-drop (WebRTC live), disposition en appel, acheter un numéro (money)"**.
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-09-register-call-mode` (phase 1, milestone **M1** (the checkpoint milestone), `depends_on: ["CLE-04-page-action-tools", "CLE-05-action-confirmation-ux"]`, completeness target 8). Its summary mandates: "EXCLURE explicitement dial/hangup/voicemail/disposition (human-bound, contrat 2)."
> Depends on (must be present on the branch base): **CLE-03** (`useRegisterPageActions`, `PageAction`/`PageActionResult`, the registry, the executor + the `requireConfirm` seam), **CLE-04** (`listPageActions`/`invokePageAction`, `decideAction`, the prompt heuristic + envelope-reading), **CLE-05** (the editable confirm card rendered when `requireConfirm:true`, the risk badges).

This feature writes **no** new framework code. It calls `useRegisterPageActions(...)` from the Call Mode page, mapping each declared `PageAction.run` to a handler **that already exists** on the page or its sub-components (the list-selector activate/create handlers, the campaign PATCH, the from-number override setter, the by-day filter, the queue sort, the script regenerate/save, the Zeliq/FullEnrich row enrich, the role-obsolete PUT, the email-draft skill, the meeting-book POST). Zero handler logic is duplicated — each `run` closure invokes the same function the button/setter invokes. It mirrors the CLE-06 pilot shape.

This is the page where "declare only what is safe" is load-bearing. CLE-06 had **no** human-bound actions; CLE-09 has the most of any page. The requirements therefore include a **dedicated, non-negotiable section (§3) enumerating the EXCLUDED actions and why**, and a **required test** (§6 step 12) asserting that **no dial/hang-up/voicemail-drop/disposition/buy-number action is ever registered**.

---

## 1. User story

**As** the founder using the Elevay chat while on the Call Mode page,
**I want** to ask the agent in plain language to **prep my calls** — switch the audience to a sector list (or back to the whole ICP), spin up a new sector list from a phrase, change my calling plan, pick which number I call from, switch the by-day view, sort the queue, jump to a specific prospect, regenerate or tweak the script, enrich a row, find a missing mobile, flag someone who left their role, draft the follow-up email, and book the meeting —
**so that** my call list, my caller ID, my script and my next prospect are all **set up in front of me** before I dial, **and I am the one who places the call and logs how it went**. The agent prepares; I press Call (audit §2 G1/G4; README doctrine §1.1 "parity by construction"; README §2 "l'agent prépare et navigue, l'humain exécute").

Concretely: "call the EMS directors next" activates (or creates then activates) that sector list and reloads the queue; "make a list of the foundations in Geneva" creates a sector list from the phrase; "bump my plan to 30 calls a day" opens the edit-plan flow; "call from my Geneva number" pins the from-number; "show me the callbacks" flips the by-day view; "sort by oldest callback" re-orders the queue; "open Marie Dubois" selects that prospect; "regenerate the script for healthcare" drafts a new script for review; "find a mobile for this contact" fires the FullEnrich waterfall; "she left the company" flags the role obsolete and drops the row; "draft the meeting email" opens the composer; "book Tuesday at 2pm" books the discovery meeting (after a confirm card, because it sends a calendar invite). But **"call her now", "hang up", "leave a voicemail", "mark it as a callback", "buy a French number"** are **refused as not invocable** — the agent says it has prepared everything and the human places/dispositions the call (and buys numbers in Settings/the header, admin-only).

This is the densest registration of the M1 sweep and the one that proves the **human-bound boundary** is enforced by *omission* (the actions are simply never declared) plus a *guardrail test*, not by hoping the model behaves.

---

## 2. The action set (scope) — DECLARED, non-dial only

Each action has id `callMode.<verb>`, a `zod` `params` schema, a `run` mapped to an existing handler, and metadata. The metadata column drives `decideAction` (CLE-04 §2.1) → whether CLE-05 shows a confirm card. **All citations are `file:line` into the real Call Mode tree.**

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `callMode.activateSectorList` | `{ listId: string }` | `handleActivateSector(id)` (`call-mode/page.tsx:901-916`) → `POST /api/calls/lists/:id/activate` + `reloadCampaignQueue` | true | false | true (re-activate another) | free | **risky** |
| `callMode.activateAllIcp` | `{}` | `handleActivateAll()` (`page.tsx:918-930`) → `POST /api/calls/lists/all/activate` + reload | true | false | true | free | **risky** |
| `callMode.createSectorList` | `{ phrase: string }` | `handleCreateList(phrase)` (`page.tsx:933-958`) → `POST /api/calls/lists {phrase}` then activate | true | false | true (delete/deactivate) | free | **risky** |
| `callMode.editPlan` | `{ goalType?; target?; window?; maxAttempts?; windowDays?; listFrequency?; workingDays? }` | the `PATCH /api/calls/campaign` in `EditCampaignModal.save` (`_edit-campaign-modal.tsx:70-91`); opened via `setEditingPlan(true)` (`page.tsx:1076`) | true | false | true (re-PATCH) | free | **risky** |
| `callMode.selectProspect` | `{ contactId: string }` | `setSelectedId(contactId)` (`page.tsx:295`, set throughout) | **false** | false | true | free | **never** |
| `callMode.setFromNumber` | `{ number: string \| "automatic" }` | `setFromNumberOverride(number==="automatic" ? null : number)` (`page.tsx:271-276`, persisted `:433-444`) | **false** (local override, persisted to `localStorage`, not server state) | false | true | free | **never** |
| `callMode.byDayView` | `{ view: "today" \| "callbacks" \| "new" }` | `handleSelectSystem(id)` (`page.tsx:889-892`) — maps `callbacks→"callbacks_due"` | **false** | false | true | free | **never** |
| `callMode.sortQueue` | `{ sort: "fit" \| "callback" \| "attempts" }` | `handleSortChange(s)` (`page.tsx:895-898`) — maps to `CallListSort` (`fit`/`oldest_callback`/`fewest_attempts`) | **false** | false | true | free | **never** |
| `callMode.regenerateScript` | `{ sector?: string }` | `regenerate()` in `CallScriptPanel` (`_call-script.tsx:185-208`) → `POST /api/calls/script/generate` (drafts; rep reviews + saves) | true (writes a draft into the panel) | false | true | free | **risky** |
| `callMode.editScript` | `{ opener?; problems?; permissionCheck?; bookingAsk?; noResponse?; sector? }` | `save()` in `CallScriptPanel` (`_call-script.tsx:165-183`) → `PUT /api/calls/script` | true | false | true (PUT prior) | free | **risky** |
| `callMode.rowEnrich` | `{ contactId: string }` | `handleEnrich(contactId)` (`page.tsx:465-494`) → `POST /api/contacts/:id/zeliq-enrich` | true | false | false (enrichment writes coordinates) | **credits** | **risky** |
| `callMode.rowFindMobile` | `{ contactId: string }` | `requestFindMobile([contactId])` (`_find-mobile.ts:14-29`) → `POST /api/contacts/fullenrich-enrich` | true | false | false | **credits** | **risky** |
| `callMode.bulkFindMobile` | `{ contactIds: string[] }` | `requestFindMobile(ids)` (`_find-mobile.ts:14`, capped 100; same call the header bulk uses, `_reachability-summary.tsx:36`) | true | false | false | **credits** | **risky** |
| `callMode.markRoleObsolete` | `{ contactId: string }` | `markRoleObsolete()` in `PreCallBrief` (`_panels.tsx:496-508`) → `PUT /api/contacts/:id {roleObsolete:true}`, then `onRoleObsolete` drops the row (`page.tsx:1427-1434`) | true | false | true (clear the flag) | free | **risky** |
| `callMode.writeEmailDraft` | `{ contactId: string }` | `writeEmail()` in `CallActions` (`_call-actions.tsx:34-57`) → `POST /api/calls/draft-email` then **opens the composer** (does NOT send) | **false** (drafts only) | false | true | **credits** (LLM draft) | **never** (reuses the existing `composeEmail` directive UX — see §design) |
| `callMode.bookMeeting` | `{ contactId: string; startTime: string; durationMinutes?: number; conferencing?: "sovereign"\|"google_meet"\|"teams"\|"zoom"; title?: string }` | `bookMeeting()` in `MeetingSchedulerCard` (`components/meeting-scheduler.tsx:60-108`) → `POST /api/meetings/book` (calendar event **+ invite**) | true | **true** (sends a calendar invite to the prospect) | false (cancel is a separate flow) | free | **always** |

> **Surface scoping.** Every action above registers **only** on `/call-mode` (the page owns all these handlers). When the user navigates away, the registry clears them (CLE-03 unmount cleanup), so `listPageActions` only ever shows them while the cockpit is mounted (AC-1).

> **Confirm tiers, justified.**
> - `confirm:"never"` (pure local view/config state, no persistence, no spend): `selectProspect`, `setFromNumber`, `byDayView`, `sortQueue`. `decideAction` → `execute` → no card. (`setFromNumber` writes only `localStorage`; it is config, not a persistent mutation.)
> - `confirm:"never"` **but credits** for `writeEmailDraft`: it does not send — it drafts and opens the composer (the human sends from the composer, exactly the existing `composeEmail` path). It is `mutating:false`/`outbound:false`; the LLM-draft credit is disclosed via `cost:"credits"` so CLE-05's badge shows "Uses credits", but it does not gate (no send happens until the human clicks Send in the composer).
> - `confirm:"risky"` (reversible mutation, or credits-spend that is recoverable/idempotent): the two list-activate actions, `createSectorList`, `editPlan`, `regenerateScript`, `editScript`, `markRoleObsolete`, `rowEnrich`, `rowFindMobile`, `bulkFindMobile`. `decideAction` → `confirm` → CLE-05 card first. The credit-spending enrich actions deliberately card (so the user approves the spend) even though they are `cost:"credits"` not `"money"`.
> - `confirm:"always"` (irreversible **outbound** — a real calendar invite reaches the prospect): `bookMeeting`. `decideAction` returns `confirm` via the outbound path **regardless** of approval mode, and the spend/blast-radius is surfaced. This is the one DECLARED outbound action; it is intentionally the strictest non-excluded tier.

---

## 3. EXCLUDED / human-bound actions (the hard boundary — do NOT declare these)

These flows exist on the page and have working handlers, but they are **deliberately NOT registered** as `PageAction`s. The agent can **prepare** (build the list, pick the from-number, draft the script, draft the email, tee up the meeting) but the **human places the call and logs the outcome**, and **buys numbers**. This is README §2 verbatim ("média temps réel piloté par l'agent … l'humain exécute") and the feature record's explicit mandate. Each row says *why* and *what the agent does instead*.

| Excluded flow | Existing handler (file:line) — present but NOT wrapped | Why it is human-bound | What the agent does instead |
|---|---|---|---|
| **Place the call / dial** (`call`/`start`) | `handleAppeler(contactId)` (`page.tsx:536-709`) → `POST /api/calls/start` **then `@twilio/voice-sdk` `Device.connect()` attaches the rep's microphone** (`:670-701`) | Live WebRTC media driven by the agent + **mic capture**. README §2 first bullet ("décrocher … un appel WebRTC … capture micro"). The browser leg *is* the call — there is no agent-placeable version; the human's mic must attach. | Prepares everything (queue, from-number, script, brief) and tells the user it is ready to dial; the human presses **Call**. |
| **Hang up** | `handleHangup()` (`page.tsx:805-819`) → `deviceRef.current?.disconnectAll()` | Controls a live WebRTC device mid-call — real-time media the human owns. README §2. | N/A during a call; the agent never enters the live state. |
| **Drop voicemail** | `handleDropVoicemail(callId)` (`page.tsx:766-803`) → `POST /api/calls/:id/voicemail-drop` | Acts **during a live call** on the connected leg (drops a pre-recorded message into the prospect's voicemail). README §2 ("drop voicemail"). Outbound + real-time. | Not invocable. The human drops the voicemail from the live controls. |
| **In-call disposition (the 6 outcomes)** | `handleDisposition(outcome)` (`page.tsx:823-866`) → `POST /api/calls/:id/disposition`; outcomes `connected` / `meeting_booked` / `callback_requested` / `no_answer` / `voicemail_left` / `not_interested` (`DISPOSITION_OPTIONS`, `page.tsx:1637-1644`) | "Disposition *pendant* l'appel" — README §2 verbatim. The outcome is the human's judgement of a call only they were on; it also fans out cadence + CRM writes keyed to a live `callId` the agent has no handle to. | Not invocable. After the human logs it, the async post-call worker + the CRM capture it; the agent can *read* outcomes via headless tools, never *set* them. |
| **Call again / Skip (post-call, in the disposition modal)** | `onCallAgain` → `handleAppeler(selected.contactId)`; "Skip" → `setSoftphone({kind:"idle"})` (`DispositionModal`, `page.tsx:1101-1104`, `:1689-1694`) | "Call again" re-enters the dial path (same WebRTC+mic boundary as dial). "Skip" is a one-tap human choice inside a live post-call modal, not a chat-driven page flow. | Not invocable. The agent can `selectProspect` the next prospect (a navigation), but does not re-dial or operate the live modal. |
| **Buy a phone number** | `handleBuyNumber(country, area)` (`page.tsx:715-764`) → `POST /api/calls/numbers` (searches Twilio inventory **and purchases**); UI gated `useCan("billing:manage")`, admin-only (`page.tsx:1727-1729`) | **Spends real money** (`cost:"money"`) and is **admin-only** in the UI. README §2 spirit + the prompt's money rule: a paid action is at minimum `confirm:"always"` and admin-gated. The recommendation (and this spec's choice) is **human-bound** — it is rare, irreversible spend better done deliberately by an admin. | Not invocable. The agent can `setFromNumber` to an **existing** pool number; if none fits it tells the user to buy one in the header (admin) / Settings → Voice. |

**Stated boundary (must appear in the design + the model's mental model):** the agent can **PREPARE** the call — build/activate the list, pick the from-number, draft the script, draft the email, tee up the meeting — **but the human places the call and dispositions it**, and **buys numbers**. If asked to "call", "hang up", "leave a voicemail", "log it as X", or "buy a number", the agent explains it has prepared what it can and hands those steps to the human (falling back to a headless read tool where one exists, e.g. reading prior call outcomes).

> **Why not "declare buy-number with `confirm:"always"` + admin-only"?** That is the *floor* the README allows for a money action, and it is recorded here as the documented alternative. This spec chooses the **stricter** option (human-bound, undeclared) because: (a) it is rare, irreversible real spend; (b) it is already admin-only and lives one click away in the header/Settings; (c) keeping it out of the manifest removes any path for a prompt-injection-influenced model to *attempt* a purchase. If Martin prefers the floor, the change is additive (declare it `mutating:true, outbound:false, cost:"money", confirm:"always"`, `surfaces:["call-mode"]`, plus an admin-role guard) — but v1 ships it excluded. **This is the one contract-adjacent tension to flag (design §7).**

---

## 4. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: "the registry" = CLE-03 `lib/chat/page-actions/registry.ts`. "the manifest" = `getActionManifest()`. "invoke X" = the model calls `invokePageAction("callMode.X", params)` (CLE-04), which emits the directive that CLE-03's executor dispatches (after CLE-05's confirm gate when `requireConfirm:true`). Each criterion is testable in isolation against the action's `run` (the framework round-trip is already covered by CLE-03/04/05 tests).

### AC-1 — The page's actions appear in the manifest only while Call Mode is mounted
- **GIVEN** the user is on `/call-mode`,
- **WHEN** `getActionManifest()` is read,
- **THEN** it contains exactly the §2 `callMode.*` ids with correct `mutating`/`outbound`/`reversible`/`cost`/`confirm` scalars and a JSON Schema per `params`,
- **AND** it contains **none** of the excluded ids (no `callMode.dial`/`call`/`hangUp`/`dropVoicemail`/`disposition`/`callAgain`/`skip`/`buyNumber` — they do not exist),
- **AND** after navigating away from `/call-mode` the manifest contains **none** of the `callMode.*` ids (CLE-03 unmount cleanup).

### AC-2 — `activateSectorList` switches the audience and reloads the queue
- **GIVEN** the user is on `/call-mode` with a campaign and a sector list `L` exists,
- **WHEN** `callMode.activateSectorList({ listId: "L" })` runs (after the CLE-05 confirm card, `confirm:"risky"`),
- **THEN** the same `POST /api/calls/lists/L/activate` that `handleActivateSector` fires is sent, `reloadCampaignQueue` re-pulls the campaign queue + selector counts (the queue visibly changes), and the result is `{ ok: true, summary: "Activated the \"<list name>\" list — N contacts to call." }`,
- **AND** on a failed activate the existing toast path is taken and the result is `{ ok: false, error: "Couldn't switch to that list." }` (mirrors `handleActivateSector`'s non-OK branch).

### AC-3 — `activateAllIcp` returns to the whole-ICP audience
- **GIVEN** a sector list is currently active,
- **WHEN** `callMode.activateAllIcp({})` runs (`confirm:"risky"`),
- **THEN** the same `POST /api/calls/lists/all/activate` that `handleActivateAll` fires is sent, the queue reloads ranked by fit, and the result is `{ ok: true, summary: "Back to the whole ICP — N contacts." }`.

### AC-4 — `createSectorList` creates from a phrase then activates it
- **GIVEN** the user is on `/call-mode` with a campaign,
- **WHEN** `callMode.createSectorList({ phrase: "les DG des EMS romands" })` runs (`confirm:"risky"`),
- **THEN** the same `POST /api/calls/lists { phrase }` that `handleCreateList` sends is posted; on success the new list id is **activated** (the existing `handleActivateSector(newId)` chained call) and the queue reloads; the result is `{ ok: true, summary: "Created and activated \"<phrase>\"." }`,
- **AND** an empty/whitespace `phrase` is rejected at the schema/run boundary → `{ ok: false, error }`, no POST (mirrors the selector's `if (!p) return`, `_list-selector.tsx:76`),
- **AND** a server rejection surfaces the server message → `{ ok: false, error: <body.message> }` (mirrors `handleCreateList`'s non-OK branch).

### AC-5 — `editPlan` PATCHes the campaign and regenerates today's list
- **GIVEN** the user is on `/call-mode` with a campaign,
- **WHEN** `callMode.editPlan({ goalType: "calls", target: 30, window: "day", maxAttempts: 8, windowDays: 15 })` runs (`confirm:"risky"`),
- **THEN** the same `PATCH /api/calls/campaign` body the edit-plan form sends (built by `useCallPlan(...).payload`, `_edit-campaign-modal.tsx:67,76`) is sent, the campaign + queue update from the response (the existing `onUpdated` shape: `{campaign, calls}`), and the result is `{ ok: true, summary: "Calling plan updated — N/day." }`,
- **AND** a non-positive `target` is rejected (mirrors the form's `disabled={value.target <= 0}`, `_edit-campaign-modal.tsx:102`) → `{ ok: false, error }`, no PATCH,
- **AND** a server rejection → `{ ok: false, error: <body.error> }` (the form's `toast(data.error || "Couldn't update the plan")` path).

### AC-6 — `selectProspect`, `setFromNumber`, `byDayView`, `sortQueue` are instant, non-mutating, no card
- **GIVEN** the user is on `/call-mode`,
- **WHEN** `callMode.selectProspect({ contactId: "C" })` runs, **THEN** `setSelectedId("C")` is called (the brief + script switch to C), `confirm` is `never`, and the result is `{ ok: true, summary: "Opened <contact name>." }`; if `C` is not in the loaded queue → `{ ok: false, error: "That contact is not in the current call list." }` (defensive lookup, E-1), no selection change,
- **AND WHEN** `callMode.setFromNumber({ number: "+41225550000" })` runs, **THEN** `setFromNumberOverride("+41225550000")` is called (the header shows it as the caller ID), `confirm` is `never`, result `{ ok: true, summary: "Calling from +41 22 555 00 00." }`; `{ number: "automatic" }` → `setFromNumberOverride(null)` → `{ ok: true, summary: "Caller ID set to automatic (local presence)." }`; a `number` not in `config.pool` (and not `"automatic"`) → `{ ok: false, error: "That number isn't in your pool. Buy one in the header (admin) or Settings → Voice." }` (mirrors the self-heal guard, `page.tsx:439-442`),
- **AND WHEN** `callMode.byDayView({ view: "callbacks" })` runs, **THEN** `handleSelectSystem("callbacks_due")` is called (the queue filters to attempted rows), `confirm` is `never`, result `{ ok: true, summary: "Showing callbacks due (N)." }`,
- **AND WHEN** `callMode.sortQueue({ sort: "callback" })` runs, **THEN** `handleSortChange("oldest_callback")` is called (the queue re-orders), `confirm` is `never`, result `{ ok: true, summary: "Sorted by oldest callback." }`.

### AC-7 — `regenerateScript` drafts a script for review; `editScript` saves
- **GIVEN** the user is on `/call-mode` with a prospect selected (so the script panel is mounted),
- **WHEN** `callMode.regenerateScript({ sector: "sante" })` runs (`confirm:"risky"`),
- **THEN** the same `POST /api/calls/script/generate { sector, contactId }` that the panel's `regenerate()` sends is posted, the draft loads into the panel **in edit mode for the human to review** (the existing `setDraft(...); setEditing(true)` behaviour), and the result is `{ ok: true, summary: "Drafted a new script for <sector> — review it in the panel." }` (it does **not** claim the script is saved — the human reviews + saves),
- **AND WHEN** `callMode.editScript({ opener: "...", bookingAsk: "..." })` runs (`confirm:"risky"`), **THEN** the same `PUT /api/calls/script { sector, fields }` that the panel's `save()` sends is posted (merging the supplied fields over the current script), and the result is `{ ok: true, summary: "Script saved." }`,
- **AND** if the script panel is not mounted (no prospect selected) either action returns `{ ok: false, error: "Open a prospect first so the script panel is available." }` (E-5b), no POST/PUT.

### AC-8 — `rowEnrich` / `rowFindMobile` / `bulkFindMobile` spend credits behind a confirm card
- **GIVEN** the user is on `/call-mode`,
- **WHEN** `callMode.rowEnrich({ contactId: "C" })` runs, **THEN** because `cost:"credits"` + `confirm:"risky"`, CLE-05 shows a confirm card (with a "Uses credits" badge, CLE-05 §5) first; on approve, the same `POST /api/contacts/C/zeliq-enrich` that `handleEnrich` fires is sent and the result is `{ ok: true, summary: "Enrichment started — email and phone will fill in shortly." }` (async; "started", not "done" — mirrors the toast, `page.tsx:474-477`),
- **AND WHEN** `callMode.rowFindMobile({ contactId: "C" })` runs, **THEN** (confirm card first) the same `POST /api/contacts/fullenrich-enrich { contactIds: ["C"] }` that `requestFindMobile` fires is sent and the result is `{ ok: true, summary: "Looking for a mobile — it'll land on the contact shortly." }`,
- **AND WHEN** `callMode.bulkFindMobile({ contactIds: [...] })` runs, **THEN** the same call (capped at 100, `_find-mobile.ts:15`) is fired and the result is `{ ok: true, summary: "Requested mobiles for N contacts." }`; an empty list → `{ ok: false, error: "No contacts to enrich." }` (mirrors `requestFindMobile`'s `if (ids.length === 0)` guard),
- **AND** any non-OK response → `{ ok: false, error: <message> }` (the existing error surfaces: ZELIQ unconfigured, FullEnrich error, HTTP code).

### AC-9 — `markRoleObsolete` flags the role and drops the row
- **GIVEN** the user is on `/call-mode` with prospect `C` in the queue,
- **WHEN** `callMode.markRoleObsolete({ contactId: "C" })` runs (`confirm:"risky"`),
- **THEN** the same `PUT /api/contacts/C { roleObsolete: true }` that the brief's `markRoleObsolete` fires is sent, the contact is dropped from the queue (the existing `onRoleObsolete` callback removes the row + advances selection, `page.tsx:1427-1434`), and the result is `{ ok: true, summary: "Flagged <contact name> as having left the role — removed from the list." }`,
- **AND** if `C` is not the kind of action the page can target for `C` not loaded → `{ ok: false, error: "That contact is not in the current call list." }` (E-1), no PUT.

### AC-10 — `writeEmailDraft` opens the composer (no send); `bookMeeting` confirms then books
- **GIVEN** the user is on `/call-mode` with prospect `C` selected,
- **WHEN** `callMode.writeEmailDraft({ contactId: "C" })` runs,
- **THEN** the same `POST /api/calls/draft-email { contactId, purpose:"meeting_request" }` that `CallActions.writeEmail` fires is sent and the **email composer opens pre-filled** (reusing the existing `composeEmail` directive UX — the human edits + sends), `confirm` is `never` (it does not send), and the result is `{ ok: true, summary: "Drafted the email — review and send it in the composer." }`; on draft failure the composer still opens blank (the existing fallback, `_call-actions.tsx:46-47`) and the result notes it,
- **AND WHEN** `callMode.bookMeeting({ contactId: "C", startTime: "2026-06-23T13:00:00Z", durationMinutes: 45, conferencing: "sovereign" })` runs, **THEN** because `outbound:true` + `confirm:"always"`, CLE-05 shows a confirm card (with "Sends externally" badge) first; on approve the same `POST /api/meetings/book` that `MeetingSchedulerCard.bookMeeting` fires is sent (calendar event + invite) and the result is `{ ok: true, summary: "Meeting booked with <first name> — invite sent.", data: { joinUrl } }`,
- **AND** a missing/invalid `startTime` is rejected at the schema/run boundary (mirrors the card's `Number.isNaN(start.getTime())` guard, `meeting-scheduler.tsx:66-69`) → `{ ok: false, error }`, no POST; a server `!booked` → `{ ok: false, error: <body.error> }` (the card's non-OK branch).

### AC-11 — Excluded actions are NOT invocable (the boundary holds)
- **GIVEN** the user is on `/call-mode`,
- **WHEN** the model emits `invokePageAction("callMode.call", {...})` (or `hangUp`, `dropVoicemail`, `disposition`, `callAgain`, `skip`, `buyNumber`),
- **THEN** because none of these ids is in the manifest, CLE-04's `invokePageAction` refuses with `{ error, availableActionIds }` (id not found) — never a dial, never a hang-up, never a voicemail, never a disposition, never a purchase,
- **AND** the model is taught (CLE-04 prompt + this feature's action descriptions) that placing/hanging-up/voicemail/dispositioning a call and buying a number are **human steps**: it says it has prepared the call and the human places it (and buys numbers in the header/Settings).

### AC-12 — An action invoked while NOT on Call Mode degrades gracefully
- **GIVEN** the user is **not** on `/call-mode` (e.g. on `/contacts`), so the `callMode.*` actions are unregistered,
- **WHEN** the model nonetheless emits `invokePageAction("callMode.activateSectorList", ...)`,
- **THEN** CLE-04's tool refuses with `{ error, availableActionIds }` **or**, if a stale directive reaches the client, CLE-03's `runRegisteredAction` returns `{ ok:false, error:"action_not_registered" }` — never a crash, never an audience switch on a cockpit that isn't mounted,
- **AND** the model falls back to the headless call tools where one exists (`getCallList`, `applyCallSprint`/`proposeCallSprint`, the contact enrich tools) per the CLE-04 heuristic.

### AC-13 — No handler logic is duplicated
- **GIVEN** the implementation,
- **WHEN** the code is reviewed,
- **THEN** every `run` body calls an **existing** page function, sub-component handler, or state setter (`handleActivateSector`, `handleActivateAll`, `handleCreateList`, the `PATCH` extracted from `EditCampaignModal.save`, `setSelectedId`, `setFromNumberOverride`, `handleSelectSystem`, `handleSortChange`, the script panel's `regenerate`/`save`, `handleEnrich`, `requestFindMobile`, the brief's `markRoleObsolete`, `CallActions.writeEmail`, `MeetingSchedulerCard.bookMeeting`) — no second copy of a fetch URL, body shape, optimistic update, or reload exists for the agent path,
- **AND** because three of these handlers today live **inside** child components (`CallScriptPanel`, `CallActions`, `MeetingSchedulerCard`, `PreCallBrief`) with no parent-level callable, the minimal refactor to make them invocable is a **handler-lift** (an imperative-handle ref or a lifted callback) that leaves the button/setter behaviour byte-identical (design §4) — never a re-implementation.

---

## 5. Edge cases (each needs a test)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **`contactId` not in the loaded queue** (`selectProspect`/`markRoleObsolete`) | Resolve defensively against `queue`. Not found → `{ ok:false, error:"That contact is not in the current call list." }`; no state change, no PUT. (`rowEnrich`/`rowFindMobile` do **not** require queue membership — they act by id, like the headless enrich tools — so they post as-is and surface the server's response, parity with E-7 of CLE-06.) |
| E-2 | **`listId` not found** (`activateSectorList`) | Post as-is (the page doesn't pre-validate ids; the server is authoritative); a non-OK activate → `{ ok:false, error:"Couldn't switch to that list." }` (the existing toast path). The agent can `listPageActions`/refetch and retry, or use a headless tool. |
| E-3 | **No active campaign** (the page is in onboarding or scoped-account mode) | `createSectorList`/`activateSectorList`/`activateAllIcp`/`editPlan` require a campaign. When `campaign` is null (onboarding not done, or a manual `?accounts=` scoped queue, `page.tsx:323-324,354-367`) these actions return `{ ok:false, error:"No calling campaign yet — set up your calling plan first." }`, no POST/PATCH. (`selectProspect`/`sortQueue`/`byDayView`/`setFromNumber`/the row actions still work — they operate on the loaded queue regardless of campaign.) |
| E-4 | **Voice not configured / no pool number** | `setFromNumber` to a specific number when `config` has an empty pool → `{ ok:false, error:"No outbound number provisioned. Buy one in the header (admin) or Settings → Voice." }`. The from-number actions never *buy* (that's excluded); they only select from the existing pool. The page already renders a not-configured empty state (`page.tsx:996-1030`); the actions guard symmetrically. |
| E-5 | **Action invoked while NOT on the page** | Graceful refusal (AC-12). No throw, no effect. |
| E-5b | **Script panel not mounted** (`regenerateScript`/`editScript` with no prospect selected) | The script panel only renders when a prospect is selected (`page.tsx:1471-1497`). With none selected, the lifted script handler ref is null → `{ ok:false, error:"Open a prospect first so the script panel is available." }`, no POST/PUT. (AC-7.) |
| E-6 | **`byDayView`/`sortQueue` enum mapping** | `byDayView` maps the friendly `today`/`callbacks`/`new` to the internal `today`/`callbacks_due`/`new` (`SystemListEntry["id"]`); `sortQueue` maps `fit`/`callback`/`attempts` to `fit`/`oldest_callback`/`fewest_attempts` (`CallListSort`). An unknown enum value is rejected by the zod `enum` before `run`. The friendly vocabulary is what the model is taught (so it never sends an internal token). |
| E-7 | **`bookMeeting` with a past `startTime`** | The action does not silently book in the past: it validates `startTime` parses to a future instant (mirrors the card's date-validity guard) and, if in the past, returns `{ ok:false, error:"Pick a time in the future." }` before the POST. (The server is the final authority; this is the client courtesy guard.) |
| E-8 | **`createSectorList` while another create is in flight** | The selector guards re-entry (`creating` flag, `_list-selector.tsx:77`). The action reads/sets the same `creatingList` state (`page.tsx:933-936`); a second invoke while creating returns `{ ok:false, error:"A list is already being created — try again in a moment." }`, no duplicate POST. |
| E-9 | **`rowFindMobile`/`bulkFindMobile` over-cap** | `requestFindMobile` already caps at 100 ids (`_find-mobile.ts:15`); the action does not re-implement the cap — it passes the ids and the shared helper slices. The summary reports the requested count the helper returns (`requested`), not the raw input length. |
| E-10 | **Optimistic state + page unmount mid-run** | The page owns `setQueue`/`setSelectedId`/`setFromNumberOverride`/`setListsData`. If the user navigates away mid-`run`, the in-flight fetch settles (CLE-03 E-3 — the dock owns the promise) and the result still round-trips; a now-unmounted setter is a no-op React warning at worst, not a crash. Reversible actions re-sync cleanly on next mount. |

---

## 6. Out of scope

- **The PAR framework itself** (directive, registry, hook, executor, confirm card, server tools, `decideAction`, prompt) → CLE-03/04/05/10. CLE-09 only *calls* `useRegisterPageActions` and maps `run`s.
- **Audit-log / undo** for these mutating actions (`tool_call_events`, the outbound undo window for `bookMeeting`) → CLE-11. CLE-09 declares `reversible`/`outbound` honestly; the undo *mechanism* (and the cancellable-invite window for `bookMeeting`) is CLE-11.
- **Permission matrix** beyond what `decideAction` already enforces (viewer cannot mutate/outbound) → CLE-12. (Note: the **excluded** buy-number flow is admin-only today via `useCan("billing:manage")`; that gating stays where it is — we simply don't expose the action.)
- **Send-guardrail hardening** for `bookMeeting`'s invite (sending-identity, opt-out, TZ windows) → CLE-13. CLE-09 routes `bookMeeting` through `decideAction` (outbound → confirm) and the existing `/api/meetings/book` guardrails; it adds no new outbound guard.
- **Post-action highlight** of the activated list / selected prospect / applied sort ("narrate+actuate") → CLE-15. CLE-09's effects are visible because they drive the real handlers, but the deliberate *highlight* is CLE-15.
- **The EXCLUDED live-telephony + buy-number flows (§3)** — these are **permanently** human-bound per README §2, not "deferred to a later CLE". No future CLE re-declares dial/hang-up/voicemail-drop/in-call-disposition as executable. (Buy-number could be promoted to `confirm:"always"`+admin per §3's documented alternative if Martin chooses; the live-media flows are a hard line.)
- **The post-call debrief / coaching surfaces** (`CallDebrief`, `page.tsx:1943`) are read-only displays with no mutating handler to wrap — nothing to register.
- **Bulk/cross-page ops stay headless** (README §3.6): "enrich every contact in France", "build a TAM", "find mobiles for the whole pipeline" are mass/cross-view ops the model routes to **headless** tools (`enrichContact`, `applyCallSprint`, etc.), not to these page actions which act on the *currently loaded* cockpit. `bulkFindMobile` is the one bulk page action, and it is scoped to the **loaded queue's** missing-mobile rows (the same set the header's bulk button targets, `_reachability-summary.tsx:36`), not the whole CRM.

---

## 7. Evaluation steps (Phase 6, hostile QA — read literally)

Unit/RTL tests prove each `run → effect` without a live server (mock `fetch`, spy the existing handler/setter or the lifted ref). One Playwright-style live check proves the headline prep loop on the real cockpit and the boundary.

1. **Manifest membership + the boundary (unit/RTL).** Mount `/call-mode`; assert the manifest lists exactly the §2 `callMode.*` ids with the metadata table (assert `bookMeeting.outbound===true`+`confirm==="always"`, `rowEnrich.cost==="credits"`+`confirm==="risky"`, `setFromNumber.confirm==="never"`+`mutating===false`, `selectProspect.mutating===false`). **Assert NONE of `callMode.call`/`dial`/`hangUp`/`dropVoicemail`/`disposition`/`callAgain`/`skip`/`buyNumber` is present** (AC-1 / AC-11 — the required boundary test).
2. **`activateSectorList` / `activateAllIcp` (unit).** Spy the `/activate` fetches; run each; assert the POST + `reloadCampaignQueue` (queue/lists re-fetch), `ok:true`. Force a failed activate → `ok:false` (AC-2/AC-3).
3. **`createSectorList` (unit).** Run with a phrase → `POST /api/calls/lists {phrase}` then activate of the returned id; empty phrase → no POST; server reject → `ok:false` with the server message (AC-4 / E-8 re-entry guard).
4. **`editPlan` (unit).** Run with a valid plan → `PATCH /api/calls/campaign` with the `useCallPlan` payload, campaign+queue updated, `ok:true`; `target<=0` → no PATCH; no campaign → `ok:false` (AC-5 / E-3).
5. **`selectProspect`/`setFromNumber`/`byDayView`/`sortQueue` (unit).** Each → the right setter, `confirm:"never"`, `ok:true`, with the enum mappings (callbacks→callbacks_due, callback→oldest_callback). `selectProspect` unknown id → `ok:false` (E-1); `setFromNumber` to a non-pool number → `ok:false` (E-4); `setFromNumber "automatic"` → override null (AC-6 / E-6).
6. **`regenerateScript`/`editScript` (unit).** With the script panel mounted: `regenerate` → `POST /api/calls/script/generate`, draft+edit-mode entered, summary says "review" (not "saved"); `editScript` → `PUT /api/calls/script` with merged fields, `ok:true`. Panel not mounted → `ok:false` (AC-7 / E-5b).
7. **`rowEnrich`/`rowFindMobile`/`bulkFindMobile` (unit).** Each → its credit-spending POST behind `confirm:"risky"`; assert "started"/"requested" summaries (async), not "done"; empty bulk list → `ok:false`; over-cap bulk → helper caps at 100 (AC-8 / E-9).
8. **`markRoleObsolete` (unit).** Run → `PUT /api/contacts/:id {roleObsolete:true}` + row dropped + selection advanced, `ok:true`; unknown id → `ok:false` (AC-9 / E-1).
9. **`writeEmailDraft`/`bookMeeting` (unit).** `writeEmailDraft` → `POST /api/calls/draft-email` + composer opens, `confirm:"never"`, no send; draft-fail → composer opens blank, summary notes it. `bookMeeting` → `confirm:"always"` (card path), `POST /api/meetings/book`, `ok:true` with `joinUrl`; past `startTime` → `ok:false` no POST (AC-10 / E-7).
10. **Excluded-actions guard — the required named test.** Assert programmatically that the registered action id set is **disjoint** from a frozen `HUMAN_BOUND_IDS` set (`["callMode.call","callMode.dial","callMode.hangUp","callMode.dropVoicemail","callMode.disposition","callMode.callAgain","callMode.skip","callMode.buyNumber"]`) — i.e. none is registered (AC-11). Cross-check (grep/review) that no `PageAction` `run` calls `handleAppeler`, `handleHangup`, `handleDropVoicemail`, `handleDisposition`, or `handleBuyNumber`.
11. **Off-page degradation (unit/RTL).** Unmount `/call-mode`; assert the `callMode.*` ids are gone from the manifest and `runRegisteredAction("callMode.activateSectorList", …)` returns `action_not_registered` (AC-12 / E-5).
12. **No-duplication review — the second required named test (manual + grep).** Grep the page + sub-components for each reused fetch URL (`/api/calls/lists` POST + `/activate`, `/api/calls/campaign` PATCH, `/api/calls/script/generate` POST, `/api/calls/script` PUT, `/api/contacts/:id/zeliq-enrich`, `/api/contacts/fullenrich-enrich`, `/api/contacts/:id` PUT roleObsolete, `/api/calls/draft-email`, `/api/meetings/book`) — each must appear **once** (or in one shared lifted helper), used by both the button/setter and the `run`. Any second copy of a body shape = FAIL (AC-13).
13. **Live loop (Playwright-style) — prep AND boundary.** On the real `/call-mode` with the dock open: type "switch to the EMS list" → observe the queue change + the `/activate` network call; "sort by oldest callback" → observe the re-order; "call from my Geneva number" → observe the from-number badge change; "book Tuesday 2pm" → observe the **confirm card** appear (outbound gate) before booking. Then type **"call her now"** → observe the agent **refuse to dial** and say it has prepared the call for the human; and **"buy a French number"** → observe it **refuse** and point to the header/Settings. Screenshot before/after each into `_research/raw/cle-09/` (CLAUDE.md screenshot rule).
14. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. CLE-03/04/05/06 tests untouched and green. The Call Mode page's existing behaviour (list selector, edit-plan modal, from-number picker incl. **buy**, by-day filter, sort, script regen/edit, enrich, find-mobile, role-obsolete, write-email, book-meeting, **and the full live dial→disposition path**) is byte-identical when used by hand (the handler-lifts preserved it).

**Hard thresholds:** AC-1..AC-13 all pass; every edge case E-1..E-10 has a passing test; the two **required** named tests pass (the EXCLUDED-actions disjointness guard, step 10/AC-11; and the no-duplication review, step 12/AC-13); `tsc` 0 errors; no handler logic duplicated; the live dial→disposition path and the buy-number flow are completely untouched and still work by hand; the page's manual UX unchanged. Any miss = FAIL → delete branch → respec.
