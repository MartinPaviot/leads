# CLE-14 — Register the remaining workhorse pages (the parity SWEEP) — Design

> Implements the **consumption** side of README §3.2 (`PageAction`) and §3.3 (`useRegisterPageActions`) for the eight remaining page clusters (inbox, meetings, sequences, tasks, knowledge, proposals, home, settings). It introduces **no** new contract and **no** new framework code; per page it declares a `PageAction[]` whose `run`s call handlers that already exist (cited `file:line` below) and calls the CLE-03 hook. The metadata each action carries is what CLE-04's `decideAction` reads to set `requireConfirm`, and what CLE-05's confirm card + risk badges render.
> Builds on: `_specs/CLE-03-action-directive-and-registry/design.md` (`PageAction`/`PageActionResult` §2.2, `useRegisterPageActions`/`runRegisteredAction` §2.3, JSON-Schema serialization §4), `_specs/CLE-04-page-action-tools/design.md` (`decideAction` §2.1 maps `confirm`/`mutating`/`outbound`/`reversible`/`cost` → a disposition; the manifest is read by `listPageActions`; outbound → `confirm`), `_specs/CLE-05-action-confirmation-ux/design.md` (the editable confirm card + risk badges when `requireConfirm:true`). **Mirrors the proven page specs one-for-one in shape**: the pilot `_specs/CLE-06-register-opportunities/design.md` (the `useMemo([], [])` stable-id-set + ref-read pattern §3.1, the pure-extraction rule §4, the local `ok`/`err` helpers §3); `_specs/CLE-08-register-contacts/design.md` (the **file-picker boundary** §2, the **second-REST-caller** seam for call-intel §1.2/§4); `_specs/CLE-09-register-call-mode/design.md` (the **human-bound boundary by omission + a disjointness test** §2, the **`useImperativeHandle` handler-lift** for child-component handlers §4).
> Real code anchored (line counts from the reconnaissance): `inbox/page.tsx` (317) + `_conversation-pane.tsx` (487) + `_outbound-table.tsx`; `meetings/[id]/page.tsx` (1125) + `_meeting-recorder.tsx` + `meetings/upload/page.tsx`; `sequences/page.tsx` (242) + `sequences/[id]/page.tsx` (853) + `sequences/review/page.tsx` (420) + `components/campaign-wizard.tsx` (562); `tasks/page.tsx` (445); `knowledge/page.tsx` (193); `proposals/page.tsx` (687); `home/page.tsx` (160) + `components/up-next/up-next-view.tsx` (263) + `components/hot-inbounds-widget.tsx`; the `settings/*` cluster.

---

## 0. The shared shape (identical on every page)

Every page follows the CLE-06/08/09 template exactly. Stated once here; each §per-page only lists its actions + handler map + any page-specific lift.

**Imports** (per page): `import type { PageAction, PageActionResult } from "@/lib/chat/page-actions/types"; import { useRegisterPageActions } from "@/lib/chat/page-actions/registry"; import { z } from "zod";`

**Local result helpers** (internal to each page, not a contract — identical to CLE-06 §3 / CLE-09 §3):
```ts
const ok = (summary: string, data?: unknown): PageActionResult => ({ ok: true, summary, data });
const err = (error: string, summary?: string): PageActionResult => ({ ok: false, error, summary: summary ?? error });
```

**Live-value refs** so `run` reads the LIVE page without re-registering on every state change (CLE-06 §3.1 / CLE-09 §3 pattern — a stable id set + ref-read params). Each page mirrors the state its `run`s read (the loaded list, the selected id, the open entity) into a `useRef` updated in an unconditional `useEffect(() => { ref.current = value; })`.

**Registration**: actions declared in a `useMemo([], [])` (stable id set), then `useRegisterPageActions(<page>Actions)` called **once, unconditionally, at the top level** of the component — **above** any `if (loading) return` / `if (!x) return` early return (CLE-06 §1.3 hook-ordering constraint). The `run`s guard on the ref'd state being present, so registering before data loads is fine (the action exists; its `run` returns an honest `{ ok:false }` until the precondition is met).

**`useMemo([], [])` safety** (same justification as CLE-06 §3.1 / CLE-09 §3.1): state **setters** are referentially stable (React guarantee); page handlers are `useCallback`/module-level; child handlers are reached via stable `useImperativeHandle` refs; live *values* are read through refs. So the action **id set** is stable and CLE-03's `useRegisterPageActions` (keyed on `actions.map(a=>a.id).join("|")`) does not re-register on every state change.

**Three reuse seams** (no logic duplication — AC-NODUP):
1. **Direct call** — the handler is at page scope and already callable (`handleTriage`, `setTab`, `addTask`, `saveStages`). The `run` calls it.
2. **Pure extraction** (`useCallback`) — a page handler reads component `useState`; lift its network body into a `useCallback(args)` both the existing handler and the `run` call (CLE-06 §4). Same body, params instead of closure state.
3. **`useImperativeHandle` lift** — the handler lives **inside a child component** (`_conversation-pane.tsx`'s `openReply`/`stopSequence`, `_outbound-table.tsx`'s `setFilter`, `campaign-wizard.tsx`'s `setStep`). The child gains an `apiRef` prop; `useImperativeHandle(apiRef, () => ({ … }))` exposes the existing fns; the page's `run` calls through the ref (CLE-09 §4). Ref is null when the child is unmounted → an honest `{ ok:false, error:"Open … first." }`.
4. **Second caller of the same REST contract** — the only seam is an endpoint owned by a hook inside a card (`call-intel.tsx`'s `usePendingReview.act` → `POST /api/call-intel/review`; `hot-inbounds-widget.tsx`'s `markNotALead` → `POST /api/contacts/:id/lead-feedback`). The page adds a tiny helper that POSTs to the **same** endpoint with the **same** body the card posts (CLE-08 §1.2). The card keeps its own buttons; the action is a second caller of the same REST contract — reusing the *contract*, duplicating no business logic (the server owns the merge).

---

## A. `/inbox` (design for §2.1)

### A.1 Handlers we reuse (file:line)

| Concern | Existing handler / state (file:line) | Seam | Action |
|---|---|---|---|
| Triage done/snooze/reopen | `handleTriage(conversationKey, action, snoozeUntil?)` `inbox/page.tsx:146` — `POST /api/inbox/triage { conversationKey, action, snoozeUntil? }` | direct | `inbox.triageDone` / `.snooze` / `.reopen` |
| Selected conversation | `selectedKey`/`setSelectedKey` `page.tsx:56`; the loaded list `conversations` `page.tsx:50` | direct (setter) | `inbox.selectConversation` (+ E-1 lookup) |
| Lane / triage tab | `tab`/`setTab` `page.tsx:41` (`"attention"\|"snoozed"\|"done"\|"handled"\|"outbound"`, `page.tsx:36`) | direct | `inbox.setLane` |
| Mailbox rail | `selectedMailbox`/`setSelectedMailbox` `page.tsx:49`; `mailboxes` from the lane response `page.tsx:91` | direct | `inbox.switchMailbox` |
| Reply (open composer) | `openReply()` `_conversation-pane.tsx:132` — sets local `composer` `:77`; if `detail.preparedDraft` uses it `:135-143`, else `POST /api/emails/suggest-reply` `:152-177` | **lift** (`paneApiRef`) | `inbox.reply` / `inbox.consumeDraft` |
| Consume prepared draft (send) | `handleSent()` `_conversation-pane.tsx:186-193` — `POST /api/inbox/drafts/:id/consume` (fires on the human's Send) | (human send; not wrapped) | `inbox.consumeDraft` opens; human sends |
| Book meeting | `setSchedOpen(true)` `_conversation-pane.tsx:80`; `<MeetingSchedulerCard contactId=…>` `:356-362` | **lift** (`paneApiRef`) | `inbox.bookMeeting` |
| Stop sequence | `stopSequence()` `_conversation-pane.tsx:195` — `PUT /api/sequences/:sequenceId/enroll { enrollmentId, status:"completed" }`; reads `detail.enrollment` | **lift** (`paneApiRef`) | `inbox.stopSequence` |
| Outbound filter | `setFilter(f)` `_outbound-table.tsx:46` (`"all"\|"replied"\|"awaiting"\|"bounced"`, `:39`) → `GET /api/inbox?filter=…&page=…` `:56` | **lift** (`outboundApiRef`) | `inbox.setOutboundFilter` |

> **Early returns** (`page.tsx`): `:256-266` (`!mailboxConnected` empty state), `:267` (`tab==="outbound"` → OutboundTable), `:271` (else → master-detail). Registration `useMemo` + `useRegisterPageActions` go **above** these, at top level. `_conversation-pane.tsx` early returns `:218-225` (`!conversationKey`), `:228-239` (`loading || !detail`).

### A.2 The lifts (the only edits to children — behaviour-preserving)

The reply / book / stop-sequence handlers live inside `<ConversationPane>` and read its local `detail`/`composer`/`schedOpen` state; the outbound filter lives inside `<OutboundTable>`. Two imperative-handle lifts (CLE-09 §4):

| Lift (new) | Exposes (verbatim from) | Mechanism | Old caller |
|---|---|---|---|
| `paneApiRef → { openReply(), bookMeeting(), stopSequence() }` | `_conversation-pane.tsx` `openReply()` `:132`, `setSchedOpen(true)` `:80`, `stopSequence()` `:195` | `<ConversationPane>` gains `apiRef`; `useImperativeHandle(apiRef, () => ({ openReply, bookMeeting: () => setSchedOpen(true), stopSequence }))`. Null until a conversation is open. | the pane's Reply/Book/Stop buttons keep calling the same fns. The page passes `apiRef={paneApiRef}` (`page.tsx:271` block). |
| `outboundApiRef → { setFilter(f) }` | `_outbound-table.tsx` `setFilter` `:46` | `<OutboundTable>` gains `apiRef`; `useImperativeHandle(apiRef, () => ({ setFilter }))`. Null unless the outbound tab is mounted. | the table's filter buttons keep calling `setFilter`. The page passes `apiRef={outboundApiRef}` (`page.tsx:267` block). |

> `handleTriage`, `setSelectedKey`, `setTab`, `setSelectedMailbox` are **page-scope** → no lift; the `run`s call them directly.
> **Reply/draft are open-only, by design (the inbox prepare-not-send posture).** `inbox.reply`/`consumeDraft` set the **local** composer (NOT the global `composeEmail` directive — the recon confirmed `_conversation-pane.tsx` owns `composer` state). They are `mutating:false, outbound:false`; the send is the human's Send click in `EmailComposerPanel` (its own confirmed surface, `:478-484`). `consumeDraft` is the same `openReply()` call — when `detail.preparedDraft` exists, `openReply` loads it (E-8 fallback to AI-suggest when absent). The `POST …/consume` (`handleSent`, `:188`) only fires on the human's Send. We do **not** add an agent-send inbox action.

### A.3 The `PageAction[]` array (sketch — `inbox/page.tsx`)

```ts
const selectedKeyRef = useRef(selectedKey); useEffect(() => { selectedKeyRef.current = selectedKey; });
const conversationsRef = useRef(conversations); useEffect(() => { conversationsRef.current = conversations; });
const paneApiRef = useRef<{ openReply(): Promise<void>; bookMeeting(): void; stopSequence(): Promise<{ok:boolean;error?:string}> } | null>(null);
const outboundApiRef = useRef<{ setFilter(f: OutboundFilter): void } | null>(null);

const inboxActions: PageAction[] = useMemo(() => [
  {
    id: "inbox.triageDone", title: "Mark a conversation as done",
    description: "Triage the open (or named) inbox conversation as handled/done so it leaves the attention lane. Use when the user is finished with a thread.",
    params: z.object({ conversationKey: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ conversationKey }) => {
      const c = conversationsRef.current.find((x) => x.key === conversationKey);
      await handleTriage(conversationKey, "done");                       // reuses page handler :146
      return ok(`Marked the conversation${c ? ` with ${c.senderName ?? c.senderEmail}` : ""} as done.`);
    },
  },
  {
    id: "inbox.snooze", title: "Snooze a conversation",
    description: "Snooze the conversation until a given time (ISO). It returns to the attention lane then.",
    params: z.object({ conversationKey: z.string().min(1), until: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ conversationKey, until }) => {
      const t = new Date(until);
      if (Number.isNaN(t.getTime()) || t.getTime() <= Date.now()) return err("Pick a future time to snooze until.");   // E-2
      await handleTriage(conversationKey, "snooze", t.toISOString());
      return ok(`Snoozed until ${until}.`);
    },
  },
  { id: "inbox.reopen", /* … */ params: z.object({ conversationKey: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ conversationKey }) => { await handleTriage(conversationKey, "reopen"); return ok("Reopened the conversation."); } },
  {
    id: "inbox.selectConversation", title: "Open a conversation",
    description: "Select a conversation from the current list so its thread + detail load. Navigation only.",
    params: z.object({ conversationKey: z.string().min(1) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ conversationKey }) => {
      const c = conversationsRef.current.find((x) => x.key === conversationKey);
      if (!c) return err("That conversation is not in the current list.");                  // E-1
      setSelectedKey(conversationKey);
      return ok(`Opened the conversation with ${c.senderName ?? c.senderEmail}.`);
    },
  },
  { id: "inbox.setLane", /* … */ params: z.object({ lane: z.enum(["attention","snoozed","done","handled","outbound"]) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ lane }) => { setTab(lane); return ok(`Showing the ${lane} lane.`); } },
  { id: "inbox.switchMailbox", /* … */ params: z.object({ mailboxId: z.string().nullable() }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ mailboxId }) => { setSelectedMailbox(mailboxId); return ok(mailboxId ? "Switched mailbox." : "Showing all inboxes."); } },
  {
    id: "inbox.reply", title: "Draft a reply",
    description: "Open the reply composer for the open conversation, pre-filled with an AI-suggested reply for you to edit and send. It does NOT send.",
    params: z.object({ conversationKey: z.string().min(1) }),
    mutating: false, outbound: false, cost: "credits", confirm: "never",
    run: async ({ conversationKey }) => {
      if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
      const api = paneApiRef.current; if (!api) return err("Open the conversation first.");   // E-1/unmounted
      await api.openReply();
      return ok("Drafted a reply — review and send it in the composer.");
    },
  },
  { id: "inbox.consumeDraft", title: "Edit and send the prepared draft",
    description: "Open the server-prepared draft reply for this conversation in the composer for you to edit and send. If none is prepared, drafts a fresh one. It does NOT send — you send from the composer.",
    params: z.object({ conversationKey: z.string().min(1) }),
    mutating: false, outbound: false, cost: "free", confirm: "never",
    run: async ({ conversationKey }) => {
      if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
      const api = paneApiRef.current; if (!api) return err("Open the conversation first.");
      await api.openReply();   // openReply uses detail.preparedDraft if present, else AI-suggest (E-8)
      return ok("Opened the draft — review and send it in the composer.");
    } },
  { id: "inbox.bookMeeting", title: "Book a meeting from this conversation",
    description: "Open the meeting scheduler for the conversation's contact. Opens the scheduler; you confirm the slot there.",
    params: z.object({ conversationKey: z.string().min(1) }),
    mutating: false, cost: "free", confirm: "never",
    run: async ({ conversationKey }) => {
      if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
      const api = paneApiRef.current; if (!api) return err("Open the conversation first.");
      api.bookMeeting();
      return ok("Opened the meeting scheduler.");
    } },
  { id: "inbox.stopSequence", title: "Stop the sequence for this contact",
    description: "Stop (complete) the active sequence enrollment for the conversation's contact, so no more sequence emails go out.",
    params: z.object({ conversationKey: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ conversationKey }) => {
      if (selectedKeyRef.current !== conversationKey) setSelectedKey(conversationKey);
      const api = paneApiRef.current; if (!api) return err("Open the conversation first.");
      const r = await api.stopSequence();   // returns {ok,error?}; pane shows "No active sequence" when detail.enrollment is null
      return r.ok ? ok("Stopped the sequence for this contact.") : err(r.error ?? "No active sequence on this conversation.");
    } },
  { id: "inbox.setOutboundFilter", /* … */ params: z.object({ filter: z.enum(["all","replied","awaiting","bounced"]) }),
    mutating: false, reversible: true, cost: "free", confirm: "never",
    run: async ({ filter }) => {
      const api = outboundApiRef.current; if (!api) return err("Switch to the outbound lane first.");
      api.setFilter(filter); return ok(`Outbound filter: ${filter}.`);
    } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(inboxActions);
```

---

## B. `/meetings/[id]` (design for §2.2)

### B.1 Handlers we reuse (file:line) — `meetings/[id]/page.tsx`

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Edit summary | `saveSummary()` `:303` → `PATCH /api/meetings/:id/notes { structuredNotes:{ summary } }` | direct (via §B.3 dispatcher) | `meetings.editNotesSection` (`section:"summary"`) |
| Edit key points | `saveKeyPoints()` `:320` → `PATCH …/notes { structuredNotes:{ keyPoints: string[] } }` | direct | `…` (`section:"keyPoints"`) |
| Edit decisions | `saveDecisions()` `:339` → `PATCH …/notes { structuredNotes:{ decisions: string[] } }` | direct | `…` (`section:"decisions"`) |
| Edit follow-up draft | `saveFollowUpDraft()` `:356` → `PATCH …/notes { followUpEmailDraft:{ subject, body } }` | direct | `…` (`section:"followUp"`) |
| Send follow-up | `sendFollowUp()` `:386` → `POST /api/meetings/:id/notes/send-follow-up` (sends; returns `{ recipients }`) | direct | `meetings.sendFollowUp` |
| Share to Slack | `shareToSlack()` `:413` → `POST /api/meetings/:id/share-slack` | direct | `meetings.shareSlack` |
| Generate prep | inline async `:1093` → `POST /api/meetings/prep { accountId?, contactId? }` | **extract** (`generatePrepResult`) | `meetings.generatePrep` |
| Post-call confirm | `triggerPostCall()` `:274` → `POST /api/meetings/:id/post-call` | direct | `meetings.postCallConfirm` |
| Intel approve/dismiss | `POST /api/call-intel/review { entityType, entityId, action }` — `usePendingReview.act` (`components/call-intel.tsx:77`); the page renders `<MeddpiccScorecard>`/`<AccountCallIntel>`/`<ContactCallProfile>` `:732,735,738` | **second REST caller** (§B.4) | `meetings.approveIntel` / `.dismissIntel` |
| Open meeting identity | `data`/`setData` `:186`; `params.id` | direct | E-1 id guard |

> **Early returns** (`[id]/page.tsx`): `:437-443` (`loading`), `:445-453` (`!data`). Registration goes **above** both.

### B.2 The exclusions (X-1, X-2) — by omission + a disjointness test

The recorder and transcript upload are **never declared** (requirements §3). Co-located frozen set + a test (CLE-09 §2 pattern):
```ts
// meetings page actions — IDs we INTENTIONALLY do NOT register.
// The in-browser recorder captures the MIC (getUserMedia/MediaRecorder, _meeting-recorder.tsx:50,63,117)
// and the transcript upload opens a NATIVE FILE DIALOG (handleFileUpload, page.tsx:229; <input type=file> :1042).
// README §2: live media + file pickers are human-bound. The agent prepares notes/follow-up/intel; the human records and picks files.
export const MEETINGS_EXCLUDED_IDS = [
  "meetings.record", "meetings.startRecording", "meetings.stopRecording",
  "meetings.uploadTranscript", "meetings.submitTranscript",
] as const;
```
A test asserts the registered `meetings.*` id set is disjoint from this, and (grep/static) that no `run` references `_meeting-recorder`'s `start`/`stop` or `handleFileUpload`.

> **No open-only transcript action in v1.** Unlike proposals (where the upload `<input>` is on the same page → we register `openTemplateUpload`), the meeting transcript upload lives on a **separate page** (`/meetings/upload`) and the detail page's `<input>` is one click behind a button; the agent navigates the user there (a `navigate` directive) rather than registering an open-only action. *(Documented alternative: register `meetings.openTranscriptUpload` calling the detail `<input>`'s `click()`, `mutating:false`, like `contacts.openImport` — additive; v1 omits it.)*

### B.3 The notes-section dispatcher (one action, four save handlers)

`meetings.editNotesSection` takes `{ meetingId, section, value }` and routes to the matching existing save handler — **no duplication**, it calls the page's own `saveSummary`/`saveKeyPoints`/`saveDecisions`/`saveFollowUpDraft`. Because those handlers read the section's draft from component state, the cleanest reuse is a **pure extraction** of each handler's PATCH body into one `useCallback patchNotes(partial)` (the four handlers all PATCH `/api/meetings/:id/notes` with a different key); each existing save handler is rewired to build its `partial` from state and call `patchNotes`, and the action builds the `partial` from `section`+`value`:
```ts
// section → payload key mapping (the action's only logic; the PATCH itself is patchNotes, shared)
const sectionToPartial = (section: string, value: unknown) => {
  switch (section) {
    case "summary":   return { structuredNotes: { summary: String(value) } };
    case "keyPoints": return { structuredNotes: { keyPoints: value as string[] } };
    case "decisions": return { structuredNotes: { decisions: value as string[] } };
    case "followUp":  { const v = value as { subject?: string; body?: string } | string;
                        return { followUpEmailDraft: typeof v === "string" ? { body: v } : v }; }
  }
};
```
`value` schema: `z.union([z.string(), z.array(z.string()), z.object({ subject: z.string().optional(), body: z.string().optional() })])` validated against `section` in `run` (string/object for summary/followUp, `string[]` for keyPoints/decisions; mismatch → `err`).

### B.4 The intel-review second caller (CLE-08 §1.2 pattern)

Approve/dismiss is **not** a page handler — it lives in `usePendingReview` inside the intel cards. The page already holds the meeting `data` (so it can tell whether a `pending` proposal of a given `entityType` exists) and the review endpoint contract is fixed. CLE-14 adds a tiny page-level `reviewMeetingIntel(entityType, entityId, action)` that POSTs to the **same** `/api/call-intel/review` the cards post to:
```ts
const reviewMeetingIntel = useCallback(async (entityType: "deal"|"company"|"contact", entityId: string, action: "approve"|"dismiss") => {
  const res = await fetch("/api/call-intel/review", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entityType, entityId, action }) });
  return res.ok ? { ok: true } : { ok: false, error: (await res.json().catch(() => ({}))).error };
}, []);
```
The cards keep their own Approve/Dismiss buttons (their `usePendingReview.act`); this is a second caller of the same REST contract — no business logic duplicated (the server owns the live-vs-pending merge). The `run` first checks the meeting's intel shape for a pending proposal of that `entityType` → E-9.

### B.5 The `PageAction[]` array (sketch)

```ts
const meetingIdRef = useRef(params.id as string);   // route param; stable but ref'd for symmetry
const dataRef = useRef(data); useEffect(() => { dataRef.current = data; });

const meetingActions: PageAction[] = useMemo(() => [
  { id: "meetings.editNotesSection", title: "Edit a meeting notes section",
    description: "Edit one section of the meeting notes — summary, key points, decisions, or the follow-up draft. Pass the section and its new value.",
    params: z.object({ meetingId: z.string().min(1), section: z.enum(["summary","keyPoints","decisions","followUp"]),
                       value: z.union([z.string(), z.array(z.string()), z.object({ subject: z.string().optional(), body: z.string().optional() })]) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ meetingId, section, value }) => {
      if (meetingId !== meetingIdRef.current) return err("That meeting is not the one open here.");        // E-1
      // shape-check value vs section, then PATCH via the shared extraction
      const partial = sectionToPartial(section, value);
      const r = await patchNotes(partial!);                                                                 // §B.3 shared with saveSummary/... 
      return r.ok ? ok(`Updated the meeting ${section === "followUp" ? "follow-up draft" : section}.`) : err(r.error ?? "Couldn't save the notes.");
    } },
  { id: "meetings.sendFollowUp", title: "Send the follow-up email",
    description: "Send the drafted follow-up email to the meeting's attendees. This SENDS externally, so it always asks you to confirm first.",
    params: z.object({ meetingId: z.string().min(1) }),
    mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
    run: async ({ meetingId }) => {
      if (meetingId !== meetingIdRef.current) return err("That meeting is not the one open here.");
      const r = await sendFollowUp();   // page handler :386 (returns recipients on success; we surface them)
      return r?.ok === false ? err(r.error ?? "Couldn't send the follow-up.") : ok(`Follow-up sent${r?.recipients ? ` to ${r.recipients.join(", ")}` : ""}.`);
    } },
  { id: "meetings.shareSlack", title: "Share the meeting to Slack",
    description: "Post the meeting summary to your connected Slack channel. This posts externally, so it always asks you to confirm first.",
    params: z.object({ meetingId: z.string().min(1) }),
    mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
    run: async ({ meetingId }) => {
      if (meetingId !== meetingIdRef.current) return err("That meeting is not the one open here.");
      const r = await shareToSlack(); return r?.ok === false ? err(r.error ?? "Couldn't share to Slack.") : ok("Shared the meeting to Slack.");
    } },
  { id: "meetings.generatePrep", title: "Generate meeting prep",
    description: "Generate a pre-meeting briefing for this meeting from the account/contact context.",
    params: z.object({ meetingId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ meetingId }) => {
      if (meetingId !== meetingIdRef.current) return err("That meeting is not the one open here.");
      const r = await generatePrepResult();   // §B.1 extraction of the inline :1093 POST
      return r.ok ? ok("Generated the meeting prep.") : err(r.error ?? "Couldn't generate prep.");
    } },
  { id: "meetings.postCallConfirm", title: "Confirm and update the CRM",
    description: "Run the post-call processing for this meeting (apply the agreed notes/intel to the CRM).",
    params: z.object({ meetingId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ meetingId }) => {
      if (meetingId !== meetingIdRef.current) return err("That meeting is not the one open here.");
      const r = await triggerPostCall(); return r?.ok === false ? err(r.error ?? "Couldn't run post-call.") : ok("Ran post-call — CRM updated.");
    } },
  { id: "meetings.approveIntel", title: "Approve a meeting intel proposal",
    description: "Approve the pending intel proposal for the meeting's deal, company, or contact (applies it to the record).",
    params: z.object({ meetingId: z.string().min(1), entityType: z.enum(["deal","company","contact"]), entityId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ meetingId, entityType, entityId }) => {
      if (meetingId !== meetingIdRef.current) return err("That meeting is not the one open here.");
      if (!hasPendingIntel(dataRef.current, entityType)) return err(`There's no pending ${entityType} proposal on this meeting.`);   // E-9
      const r = await reviewMeetingIntel(entityType, entityId, "approve");   // §B.4 second REST caller
      return r.ok ? ok(`Applied the ${entityType} intel.`) : err(r.error ?? "Couldn't apply the intel.");
    } },
  { id: "meetings.dismissIntel", /* mirror of approveIntel with action:"dismiss" */ },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(meetingActions);
```

---

## C. `/sequences` (+ `[id]`, `review`, wizard) (design for §2.3)

> **Surface scoping (three routes register three disjoint sets).** The **list** page (`sequences/page.tsx`) registers `createCampaign`/`startProposed`/`rejectProposed`. The **detail** page (`sequences/[id]/page.tsx`) registers `pause`/`resume`/`editStep`/`deleteStep`/`enrollPause`/`enrollResume`/`enrollStop`/`launch`. The **review** page (`sequences/review/page.tsx`) registers `reviewBulkApprove`/`reviewApprove`/`reviewReject`/`reviewEdit`. The **wizard** (`campaign-wizard.tsx`, opened from the list) exposes `wizardAdvance` via a lift while it is mounted. Each page registers only the actions whose handlers it owns; the registry clears them on unmount.

### C.1 List page handlers (`sequences/page.tsx`)

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Open wizard | `setShowWizard(true)` `:116` → `<CampaignWizard>` | direct | `sequences.createCampaign` |
| Start a proposed sequence | `transitionStatus(id,"active")` `:201` → `PUT /api/sequences/:id { status:"active" }` (**outbound** — worker begins sending) | direct | `sequences.startProposed` |
| Reject a proposed sequence | `transitionStatus(id,"archived")` `:216` → `PUT { status:"archived" }` | direct | `sequences.rejectProposed` |

### C.2 Detail page handlers (`sequences/[id]/page.tsx`)

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Pause / resume the sequence | `toggleStatus()` `:146` → `PUT /api/sequences/:id { status:"paused"\|"active" }` (resume is **outbound**) | **extract** (`setSequenceStatus(status)`) so the action can choose paused vs active explicitly | `sequences.pause` / `.resume` |
| Edit a step | `saveStep()` `:212` → `PATCH /api/sequences/:id/steps/:stepId { subjectTemplate?, bodyTemplate?, delayDays? }` | **extract** (`saveStepFields(stepId, fields)`) | `sequences.editStep` |
| Delete a step | `deleteStep(stepId)` `:245` → `DELETE /api/sequences/:id/steps/:stepId` (no soft-delete) | direct | `sequences.deleteStep` |
| Enroll pause/resume/stop | the inline `PUT /api/sequences/:id/enroll { enrollmentId, status }` `:599,611,623` | **extract** (`setEnrollmentStatus(enrollmentId, status)`) | `sequences.enrollPause`/`.enrollResume`/`.enrollStop` |
| Launch | `launchCampaign()` `:163` → `POST /api/campaigns/:id/launch` (**outbound**) | direct | `sequences.launch` |
| Open sequence identity | the loaded `sequence` `:` ; `params.id` | direct | E-1 guard |

> **Early returns** (`[id]/page.tsx`): `:263` (`loading`), `:264` (`!sequence`). Registration above both.
> **The inline enroll PUTs (`:599/611/623`) are duplicated three times in the JSX today** — the extraction `setEnrollmentStatus(enrollmentId, status)` collapses them to one `useCallback`, which the three buttons **and** the three actions call. This is a no-duplication *win* (the AC-NODUP grep will show one `/enroll` PUT after the extraction).

### C.3 Review page handlers (`sequences/review/page.tsx`)

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Bulk approve | `handleBulkApprove()` `:151` → `POST /api/sequences/drafts/bulk-approve { ids }` (**outbound** — queues for send) | **extract** (`bulkApproveDrafts(ids)`) | `sequences.reviewBulkApprove` |
| Approve one | `handleApprove()` `:201` → `POST /api/sequences/drafts/:id/approve { version }` (**outbound**) | **extract** (`approveDraft(id, version)`) | `sequences.reviewApprove` |
| Reject one | `submitReject()` `:229` → `POST /api/sequences/drafts/:id/reject { reason, pauseEnrollment, version }` | **extract** (`rejectDraft(id, body)`) | `sequences.reviewReject` |
| Edit a draft | the `SequenceDraftPreview` edit affordance (`:387-391`, opens the editor; save is the child's `onEditSaved`) | direct (opens editor) | `sequences.reviewEdit` |

### C.4 The wizard lift (`campaign-wizard.tsx`)

`wizardAdvance` flips the wizard's `step` (`"targets"|"generating"|"review"|"launch"`, `:91,94`). The wizard owns this state, so a lift:
```ts
// CampaignWizard gains apiRef; useImperativeHandle(apiRef, () => ({ goToStep: (s) => setStep(s) }));
// The page (sequences/page.tsx) holds wizardApiRef; passes it to <CampaignWizard apiRef={wizardApiRef}>.
```
`sequences.wizardAdvance` calls `wizardApiRef.current?.goToStep(to)`. **It never calls** `approveAll` (`:270`) or the wizard's `launchCampaign` (`:281`) — those are the wizard's own send-bearing buttons (X-10). Advancing to `launch` shows the panel; the human presses Launch.

### C.5 The exclusions (X-10) — wizard send-buttons

Co-located frozen set + a test:
```ts
// sequences page actions — IDs we INTENTIONALLY do NOT register on the WIZARD.
// approveAll (campaign-wizard.tsx:270) and the wizard's launchCampaign (:281) SEND mail from inside
// a human-driven multi-step wizard. wizardAdvance only navigates panels (README §2 prepare-not-execute).
// (Top-level sequences.launch covers the non-wizard launch button, behind confirm:"always".)
export const SEQUENCES_WIZARD_EXCLUDED_IDS = [
  "sequences.wizardApproveAll", "sequences.wizardLaunch", "sequences.wizardSend",
] as const;
```

### C.6 Contract-adjacent choice to flag (§ final report)

There are **two** launch paths: the detail page's `launchCampaign` (`[id]/page.tsx:163`) and the wizard's `launchCampaign` (`campaign-wizard.tsx:281`). This spec registers **only the detail-page launch** as `sequences.launch` (behind `confirm:"always"`). The wizard's internal launch stays the human's click (X-10). This is a deliberate asymmetry — the agent can launch a prepared sequence from its detail page, but inside the wizard it only navigates panels and the human presses the final Launch. (Flagged because it is the one place the same verb is exposed in one context and withheld in another; the rationale is that the wizard is a guided human flow where the send-button is the human's commitment.)

### C.7 The `PageAction[]` arrays (sketch — abbreviated; full metadata in requirements §2.3)

```ts
// ── sequences/page.tsx (LIST) ──
const seqListActions: PageAction[] = useMemo(() => [
  { id: "sequences.createCampaign", title: "Create a campaign", description: "Open the campaign wizard to build a new outbound sequence.",
    params: z.object({}), mutating: false, cost: "free", confirm: "never",
    run: async () => { setShowWizard(true); return ok("Opened the campaign wizard."); } },
  { id: "sequences.startProposed", title: "Start a proposed sequence",
    description: "Activate an AI-proposed sequence so it begins sending on the next worker tick. This SENDS externally — always confirms first.",
    params: z.object({ sequenceId: z.string().min(1) }), mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ sequenceId }) => { const r = await transitionStatus(sequenceId, "active"); return r?.ok === false ? err(r.error ?? "Couldn't start it.") : ok("Campaign started — sending begins on the next tick."); } },
  { id: "sequences.rejectProposed", /* PUT status:"archived", confirm:"risky" */ },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(seqListActions);

// ── sequences/[id]/page.tsx (DETAIL) ──  (above the :263 early returns)
const sequenceIdRef = useRef(params.id as string);
const seqDetailActions: PageAction[] = useMemo(() => [
  { id: "sequences.pause",  params: z.object({ sequenceId: z.string().min(1) }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ sequenceId }) => { if (sequenceId !== sequenceIdRef.current) return err("That sequence is not the one open here."); const r = await setSequenceStatus("paused"); return r.ok ? ok("Paused the sequence.") : err(r.error!); } },
  { id: "sequences.resume", params: z.object({ sequenceId: z.string().min(1) }), mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ sequenceId }) => { if (sequenceId !== sequenceIdRef.current) return err("That sequence is not the one open here."); const r = await setSequenceStatus("active"); return r.ok ? ok("Resumed the sequence — queued sends will go out.") : err(r.error!); } },
  { id: "sequences.editStep", params: z.object({ sequenceId: z.string().min(1), stepId: z.string().min(1), subjectTemplate: z.string().optional(), bodyTemplate: z.string().optional(), delayDays: z.number().int().min(0).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ sequenceId, stepId, ...fields }) => { if (sequenceId !== sequenceIdRef.current) return err("That sequence is not the one open here."); const r = await saveStepFields(stepId, fields); return r.ok ? ok("Updated the step.") : err(r.error!); } },
  { id: "sequences.deleteStep", params: z.object({ sequenceId: z.string().min(1), stepId: z.string().min(1) }), mutating: true, reversible: false, cost: "free", confirm: "always",
    run: async ({ sequenceId, stepId }) => { if (sequenceId !== sequenceIdRef.current) return err("That sequence is not the one open here."); const r = await deleteStep(stepId); return r?.ok === false ? err(r.error!) : ok("Deleted the step."); } },
  { id: "sequences.enrollPause",  params: z.object({ sequenceId: z.string().min(1), enrollmentId: z.string().min(1) }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ enrollmentId }) => { const r = await setEnrollmentStatus(enrollmentId, "paused"); return r.ok ? ok("Paused that enrollment.") : err(r.error!); } },
  { id: "sequences.enrollResume", params: z.object({ sequenceId: z.string().min(1), enrollmentId: z.string().min(1) }), mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ enrollmentId }) => { const r = await setEnrollmentStatus(enrollmentId, "active"); return r.ok ? ok("Resumed that enrollment.") : err(r.error!); } },
  { id: "sequences.enrollStop",   params: z.object({ sequenceId: z.string().min(1), enrollmentId: z.string().min(1) }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ enrollmentId }) => { const r = await setEnrollmentStatus(enrollmentId, "completed"); return r.ok ? ok("Stopped that enrollment.") : err(r.error!); } },
  { id: "sequences.launch", params: z.object({ sequenceId: z.string().min(1) }), mutating: true, outbound: true, reversible: false, cost: "free", confirm: "always",
    run: async ({ sequenceId }) => { if (sequenceId !== sequenceIdRef.current) return err("That sequence is not the one open here."); const r = await launchCampaign(); return r?.ok === false ? err(r.error!) : ok("Campaign launched — queued emails will send."); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(seqDetailActions);

// ── sequences/review/page.tsx (REVIEW) ──
const reviewActions: PageAction[] = useMemo(() => [
  { id: "sequences.reviewBulkApprove", params: z.object({ ids: z.array(z.string().min(1)).min(1) }), mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ ids }) => { const r = await bulkApproveDrafts(ids); return r.ok ? ok(`Approved ${ids.length} draft(s) — queued for send.`) : err(r.error!); } },
  { id: "sequences.reviewApprove", params: z.object({ draftId: z.string().min(1), version: z.string().min(1) }), mutating: true, outbound: true, reversible: true, cost: "free", confirm: "always",
    run: async ({ draftId, version }) => { const r = await approveDraft(draftId, version); return r.ok ? ok("Draft approved — queued for send.") : err(r.error!); } },
  { id: "sequences.reviewReject", params: z.object({ draftId: z.string().min(1), version: z.string().min(1), reason: z.string().min(1), pauseEnrollment: z.boolean().optional() }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ draftId, version, reason, pauseEnrollment }) => { const r = await rejectDraft(draftId, { reason, version, pauseEnrollment: pauseEnrollment ?? false }); return r.ok ? ok("Draft rejected.") : err(r.error!); } },
  { id: "sequences.reviewEdit", params: z.object({ draftId: z.string().min(1) }), mutating: false, cost: "free", confirm: "never",
    run: async ({ draftId }) => { openDraftEditor(draftId); return ok("Opened the draft editor."); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(reviewActions);

// ── campaign-wizard.tsx (mounted from the list) ──
const wizActions: PageAction[] = useMemo(() => [
  { id: "sequences.wizardAdvance", params: z.object({ to: z.enum(["targets","generating","review","launch"]) }), mutating: false, cost: "free", confirm: "never",
    run: async ({ to }) => { setStep(to); return ok(`Moved to the ${to} step.`); } },   // never calls approveAll/launchCampaign (X-10)
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(wizActions);
```

---

## D. `/tasks` (design for §2.4)

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Add task | `addTask()` `tasks/page.tsx:115` → `POST /api/tasks { title, priority }` (guards `!newTask.trim()` `:116`) | **extract** (`createTask(title, priority)`) so the action passes title+priority explicitly | `tasks.addTask` |
| Toggle complete | `toggleTask(task)` `:130` → `PATCH /api/tasks/:id { status }` | **extract** (`setTaskStatus(taskId, status)`) | `tasks.toggleComplete` |
| Cycle priority | `cyclePriority(task)` `:144` → `PATCH /api/tasks/:id { priority }` (cycle low→medium→high→low, `:28`) | **extract** (`setTaskPriority(taskId, priority)`) — the action can cycle from the live value or set directly | `tasks.cyclePriority` |
| Filter / sort | `setFilterTab(f)` `:98` (`"all"\|"due_today"\|"overdue"\|"completed"`), `setSortMode(s)` `:99` (`"priority"\|"due_date"`) | direct | `tasks.setFilter` / `.setSort` |
| Task list | `tasks` `:94` | direct | E-1 lookup |

> No early returns of note in the body (the add-guard is `:116` inside `addTask`). Registration after the handlers. `tasks.cyclePriority` reads the task's current priority from `tasksRef`, computes the next in the cycle (`PRIORITY_CYCLE`, `:28`), and calls `setTaskPriority` — mirroring `cyclePriority`'s own logic via the shared extraction.

```ts
const tasksRef = useRef(tasks); useEffect(() => { tasksRef.current = tasks; });
const taskActions: PageAction[] = useMemo(() => [
  { id: "tasks.addTask", params: z.object({ title: z.string().min(1), priority: z.enum(["low","medium","high"]).optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ title, priority }) => { const t = title.trim(); if (!t) return err("A task title is required."); const r = await createTask(t, priority ?? "medium"); return r.ok ? ok(`Added task "${t}".`) : err(r.error!); } },
  { id: "tasks.toggleComplete", params: z.object({ taskId: z.string().min(1), completed: z.boolean().optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ taskId, completed }) => { const task = tasksRef.current.find((x) => x.id === taskId); if (!task) return err("That task is not in the current list."); const status = (completed ?? task.status !== "completed") ? "completed" : "pending"; const r = await setTaskStatus(taskId, status); return r.ok ? ok(status === "completed" ? "Marked the task done." : "Reopened the task.") : err(r.error!); } },
  { id: "tasks.cyclePriority", params: z.object({ taskId: z.string().min(1) }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ taskId }) => { const task = tasksRef.current.find((x) => x.id === taskId); if (!task) return err("That task is not in the current list."); const next = PRIORITY_CYCLE[task.priority]; const r = await setTaskPriority(taskId, next); return r.ok ? ok(`Priority set to ${next}.`) : err(r.error!); } },
  { id: "tasks.setFilter", params: z.object({ filter: z.enum(["all","due_today","overdue","completed"]) }), mutating: false, cost: "free", confirm: "never",
    run: async ({ filter }) => { setFilterTab(filter); return ok(`Showing ${filter} tasks.`); } },
  { id: "tasks.setSort", params: z.object({ sort: z.enum(["priority","due_date"]) }), mutating: false, cost: "free", confirm: "never",
    run: async ({ sort }) => { setSortMode(sort); return ok(`Sorted by ${sort}.`); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(taskActions);
```

---

## E. `/knowledge` (design for §2.5)

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Add entry | `handleAddEntry()` `knowledge/page.tsx:53` → `POST /api/settings/knowledge { title, content, scope, category }` | **extract** (`createEntry(input)`) | `knowledge.addEntry` |
| Save entry | `handleSaveEntry()` `:78` → `PUT /api/settings/knowledge { id, title?, content?, category? }` | **extract** (`saveEntryFields(id, fields)`) | `knowledge.saveEntry` |
| Delete entry | `handleDeleteEntry(id)` `:96` → `DELETE /api/settings/knowledge?id=…` (hard delete) | direct | `knowledge.deleteEntry` |
| Search | `setQuery(q)` `:22` | direct | `knowledge.search` |
| Entries / selected | `entries` `:18`; `selectedId` `:20` | direct | (lookups) |

> No file upload on this page (recon confirmed). `deleteEntry` is `confirm:"always"`, `reversible:false` (hard delete — no archive). `addEntry`/`saveEntry` extract the POST/PUT body so the action passes explicit fields (the existing handlers read the new-entry form / selected-entry state). `scope`/`category` default to the page's defaults when omitted.

```ts
const knowledgeActions: PageAction[] = useMemo(() => [
  { id: "knowledge.addEntry", params: z.object({ title: z.string().min(1), content: z.string().min(1), scope: z.string().optional(), category: z.string().optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ title, content, scope, category }) => { const r = await createEntry({ title: title.trim(), content, scope: scope ?? "workspace", category: category ?? "general" }); return r.ok ? ok(`Added knowledge entry "${title.trim()}".`) : err(r.error!); } },
  { id: "knowledge.saveEntry", params: z.object({ id: z.string().min(1), title: z.string().optional(), content: z.string().optional(), category: z.string().optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ id, ...fields }) => { const r = await saveEntryFields(id, fields); return r.ok ? ok("Saved the entry.") : err(r.error!); } },
  { id: "knowledge.deleteEntry", params: z.object({ id: z.string().min(1) }), mutating: true, reversible: false, cost: "free", confirm: "always",
    run: async ({ id }) => { const r = await handleDeleteEntry(id); return r?.ok === false ? err(r.error!) : ok("Deleted the entry."); } },
  { id: "knowledge.search", params: z.object({ query: z.string() }), mutating: false, cost: "free", confirm: "never",
    run: async ({ query }) => { setQuery(query); return ok(query ? `Searching knowledge for "${query}".` : "Cleared the search."); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(knowledgeActions);
```

---

## F. `/proposals` (design for §2.6)

### F.1 Handlers we reuse (file:line) — `proposals/page.tsx`

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Draft from deal | `runFill()` `:228` → `POST /api/proposals/templates/:id/fill { dealId }` (guards `!selected || !dealId.trim()` `:229`) | **extract** (`fillFromDeal(templateId, dealId)`) | `proposals.draftFromDeal` |
| Confirm mapping | `confirmMap()` `:204` → `PATCH /api/proposals/templates/:id { componentMap }` (guards `!selected || !draft` `:205`) | **extract** (`confirmMapping(templateId, map)`) | `proposals.confirmMapping` |
| Edit component map | `patchComponent(i, partial)` `:183` — client-side `draft` map edit (no network) | direct | `proposals.editComponentMap` |
| Regenerate a component | `regenerateOne(componentId, guidance?)` `:291` → `POST /api/proposals/:id/components/:cid/regenerate { guidance? }` (guards `!filled` `:292`) | direct | `proposals.regenerateComponent` |
| Save edits | `saveEdits()` `:265` → `PATCH /api/proposals/:id { components }` (guards `!filled || no edits` `:266`) | direct | `proposals.saveEdits` |
| State | `selected` `:69`, `draft` `:70`, `filled` `:83-87`, `edits` | direct | guards |

> **Early returns / guards**: `:205`, `:229`, `:266`, `:292` are in-handler guards (not component early returns); the action mirrors each. Registration after the handlers.

### F.2 The exclusions (X-3, X-4) — file picker + download

```ts
// proposals page actions — IDs we INTENTIONALLY do NOT register as SUBMITTING/STREAMING actions.
// Template upload opens a NATIVE FILE DIALOG + multipart POST (onUpload, page.tsx:149; <input type=file accept=".docx,.pptx"> :356-363).
// Download is a NATIVE BROWSER DOWNLOAD (<a href="/api/proposals/:id/download[?as=pdf]"> :589,598).
// README §2: file pickers + the agent does not stream file bytes. The agent OPENS the picker / NAVIGATES to the download; the human picks/takes.
export const PROPOSALS_EXCLUDED_IDS = [
  "proposals.uploadTemplate", "proposals.submitTemplate",   // no file-byte submit
  "proposals.downloadPdf", "proposals.download",            // no byte-stream to client
] as const;
```
A test asserts the registered proposals id set is disjoint from this; `openTemplateUpload` (open-only) and `openDownload` (navigate-only) are the **only** file-adjacent ids and are deliberately *not* in the excluded set.

### F.3 The two safe-edge actions (open-only / navigate-only)

- **`proposals.openTemplateUpload`** (CLE-08 file-picker pattern): `run` = `fileRef.current?.click()` (the exact trigger the "Upload template" button uses, `:356-363` `<input ref={fileRef}>`). It does **not** read a file, build `FormData`, or hit `/api/proposals/templates`. `onUpload` (`:149`) runs **only** on the human's `<input> onChange`. `mutating:false, confirm:"never"`. Summary: "Opened the template picker — choose a .docx/.pptx (I can't pick the file for you)."
- **`proposals.openDownload`** (navigate-only): `run` emits the existing **`navigate` directive** (README §3.1) to the download URL — `/api/proposals/:id/download` (or `?as=pdf` for `format:"pdf"`), the exact `href` the `<a>` tags use (`:589,598`). It does **not** `fetch` the file or return bytes; the browser performs the download for the human. `mutating:false, confirm:"never"`. *(Implementation note: the page action returns a `PageActionResult` whose effect is achieved by the directive; since `run` runs client-side, it can `window.location.assign(url)` / `router.push(url)` — whichever the existing `<a>` semantics match (a plain `href` to an API route is a navigation/download, so `window.location.href = url` reproduces the click exactly). It reads no bytes into JS.)*

> **Why register navigate-only rather than leave it unregistered?** Audit `/proposals` line 101 lists "download PDF" as a real affordance; the agent being able to *take the user to* the download is useful and equally safe (no bytes touched). Leaving it fully unregistered (the agent only describes the button) is the documented alternative; v1 registers the navigate-only action. **Flagged as a contract-adjacent choice** (it is the first navigate-to-download action; it reuses the existing `navigate` directive, no new contract).

### F.4 The `PageAction[]` array (sketch)

```ts
const fileRef = /* existing :356 ref */;
const proposalActions: PageAction[] = useMemo(() => [
  { id: "proposals.draftFromDeal", params: z.object({ templateId: z.string().min(1), dealId: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ templateId, dealId }) => { if (!dealId.trim()) return err("A deal is required."); const r = await fillFromDeal(templateId, dealId.trim()); return r.ok ? ok("Drafted a proposal from the deal.") : err(r.error!); } },
  { id: "proposals.confirmMapping", params: z.object({ templateId: z.string().min(1) }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ templateId }) => { const r = await confirmMapping(templateId, draftRef.current); return r.ok ? ok("Confirmed the template mapping.") : err(r.error!); } },
  { id: "proposals.editComponentMap", params: z.object({ index: z.number().int().min(0), kind: z.string().optional(), label: z.string().optional(), dataKey: z.string().optional(), confidence: z.number().optional() }),
    mutating: false, cost: "free", confirm: "never",
    run: async ({ index, ...partial }) => { patchComponent(index, partial); return ok("Updated the component mapping."); } },
  { id: "proposals.regenerateComponent", params: z.object({ proposalId: z.string().min(1), componentId: z.string().min(1), guidance: z.string().optional() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ componentId, guidance }) => { const r = await regenerateOne(componentId, guidance); return r?.ok === false ? err(r.error!) : ok("Regenerated the component."); } },
  { id: "proposals.saveEdits", params: z.object({ proposalId: z.string().min(1) }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async () => { if (!filledRef.current || Object.keys(editsRef.current).length === 0) return err("No edits to save."); const r = await saveEdits(); return r?.ok === false ? err(r.error!) : ok("Saved your edits."); } },
  // ── safe edges of the file boundaries (X-3, X-4) ──
  { id: "proposals.openTemplateUpload", title: "Open the template picker",
    description: "Open the file picker to upload a .docx/.pptx proposal template. I can open the picker but you must choose the file.",
    params: z.object({}), mutating: false, cost: "free", confirm: "never",
    run: async () => { fileRef.current?.click(); return ok("Opened the template picker — choose a .docx/.pptx (I can't pick the file for you)."); } },
  { id: "proposals.openDownload", title: "Download the proposal",
    description: "Take you to the proposal download (DOCX or PDF). The browser performs the download.",
    params: z.object({ proposalId: z.string().min(1), format: z.enum(["docx","pdf"]).optional() }),
    mutating: false, cost: "free", confirm: "never",
    run: async ({ proposalId, format }) => { const url = `/api/proposals/${proposalId}/download${format === "pdf" ? "?as=pdf" : ""}`; window.location.href = url; return ok(`Downloading the proposal${format === "pdf" ? " (PDF)" : ""}.`); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(proposalActions);
```

---

## G. `/home` (design for §2.7)

### G.1 Handlers we reuse (file:line)

| Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|
| Reply to a Needs-you item | the `onTodo(todo)` reply branch in `<UpNextView>` that sets the composer (`up-next-view.tsx:99-107`) for a `kind:"reply"` todo | **lift** (`upNextApiRef`) | `home.replyNeedsYou` |
| Open an item | `router.push(item.href)` (`up-next-view.tsx:108` for todos, `:173` for actualités) | **lift** (`upNextApiRef.openItem`) | `home.openItem` |
| Not a lead | `markNotALead(item)` → `POST /api/contacts/:id/lead-feedback { isLead:false }` (`hot-inbounds-widget.tsx:68`) — lives in `<HotInboundsWidget>` | **second REST caller** (§G.3) | `home.notALead` |
| Needs-you data | `data` (`{ todos[], actualites[] }`) in `<UpNextView>` (`:35`) | via the lift | E-1 lookups |

> `home/page.tsx` (`:160`) is mostly chrome; the actionable surface is in two children: `<UpNextView>` (`:135`) and `<HotInboundsWidget>` (`:116`). Two seams: a lift for UpNext (it owns `data` + the composer + `router`), and a second-REST-caller for the not-a-lead feedback (the widget owns its optimistic list, but the endpoint is fixed).

### G.2 The UpNext lift

```ts
// UpNextView gains apiRef; useImperativeHandle(apiRef, () => ({
//   replyTo: (todoId) => { const t = data.todos.find(x => x.id === todoId); if (!t || t.kind !== "reply") return {ok:false}; onTodo(t); return {ok:true, subject:t.subtitle}; },
//   openItem: (id, kind) => { const item = kind==="todo" ? data.todos.find(x=>x.id===id) : data.actualites.find(x=>x.id===id); if (!item?.href) return {ok:false}; router.push(item.href); return {ok:true}; },
// }));
// home/page.tsx holds upNextApiRef and passes it to <UpNextView apiRef={upNextApiRef}>.
```
The widget keeps its own click handlers; the lift exposes the same `onTodo`/`router.push` paths.

### G.3 The not-a-lead second caller

`markNotALead` lives inside `<HotInboundsWidget>` and owns its optimistic row-drop. The home page can't call the widget's local fn, and lifting the widget's whole optimistic state up is more invasive than warranted. Per CLE-08 §1.2, register a page-level second caller of the **same REST contract**:
```ts
const markNotALead = useCallback(async (contactId: string) => {
  const res = await fetch(`/api/contacts/${contactId}/lead-feedback`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isLead: false }) });
  return res.ok ? { ok: true } : { ok: false, error: "Couldn't record the feedback." };
}, []);
```
The widget keeps its button + optimistic drop; the action posts the same `{ isLead:false }` to the same endpoint. (The widget re-derives its list on its next refresh, so the row drops there too — eventual, not optimistic-from-the-action, which is acceptable: the server is the source of truth.)

### G.4 The `PageAction[]` array (sketch — in `home/page.tsx`)

```ts
const upNextApiRef = useRef<{ replyTo(id: string): {ok:boolean;subject?:string}; openItem(id: string, kind: "todo"|"actualite"): {ok:boolean} } | null>(null);
const homeActions: PageAction[] = useMemo(() => [
  { id: "home.replyNeedsYou", title: "Reply to a Needs-you item",
    description: "Open a reply composer pre-filled for one of the 'Needs you' reply items on the home page. It does NOT send.",
    params: z.object({ todoId: z.string().min(1) }), mutating: false, cost: "free", confirm: "never",
    run: async ({ todoId }) => { const api = upNextApiRef.current; if (!api) return err("The home feed isn't ready yet."); const r = api.replyTo(todoId); return r.ok ? ok(`Opened a reply to ${r.subject ?? "the item"}.`) : err("That item isn't a reply item in your Needs-you list."); } },
  { id: "home.openItem", title: "Open a home item",
    description: "Navigate to a 'Needs you' todo or an activity item on the home page.",
    params: z.object({ id: z.string().min(1), kind: z.enum(["todo","actualite"]) }), mutating: false, cost: "free", confirm: "never",
    run: async ({ id, kind }) => { const api = upNextApiRef.current; if (!api) return err("The home feed isn't ready yet."); const r = api.openItem(id, kind); return r.ok ? ok("Opened the item.") : err("That item isn't in your home feed (or has no link)."); } },
  { id: "home.notALead", title: "Mark an inbound as not a lead",
    description: "Dismiss a surfaced hot-inbound as 'not a lead' (records human feedback; the contact stops being surfaced as a lead).",
    params: z.object({ contactId: z.string().min(1) }), mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ contactId }) => { const r = await markNotALead(contactId); return r.ok ? ok("Marked as not a lead.") : err(r.error!); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []);
useRegisterPageActions(homeActions);
```

---

## H. `/settings/*` (design for §2.8) — SAFE config writes only

> **Each settings sub-page registers its own one or two actions when it is mounted** (the routes are separate pages — `guardrails`, `notifications`, `stages`, `signals`, `workspace`). There is no single "settings page"; the actions are scoped to their route exactly like detail-vs-list scoping elsewhere. The set is **deliberately small** — only single-handler config writes with one clear endpoint.

### H.1 Handlers we reuse (file:line)

| Route | Concern | Existing handler (file:line) | Seam | Action |
|---|---|---|---|---|
| `settings/guardrails` | Approval mode | `saveApprovalMode()` `:106` → `PUT /api/settings/workspace { agentApprovalMode }` | direct | `settings.setApprovalMode` |
| `settings/notifications` | Notification prefs | `toggle()` `:81` → `save()` `:72` → `PUT /api/notifications/preferences { preferences, slackWebhook }` | **extract** (`setNotificationPref(key, channel, enabled)`) so the action flips one pref without re-reading the whole form | `settings.updateNotificationPrefs` |
| `settings/stages` | Pipeline stages | `saveStages()` `:53` → `PUT /api/settings/stages { stages }` | direct (whole-list PUT) | `settings.editPipelineStages` |
| `settings/signals` | Add a buying signal | `handleCreate()` `:65` → `POST /api/custom-signals { name, description }` | **extract** (`createSignal(name, description)`) | `settings.addSignal` |
| `settings/workspace` | Workspace name | `saveName()` `:49` → `PUT /api/settings/workspace { name }` | **extract** (`saveWorkspaceName(name)`) | `settings.updateWorkspaceName` |

### H.2 The exclusions (X-5, X-6, X-7) — security + money

```ts
// settings page actions — IDs we INTENTIONALLY do NOT register.
// Security (password change, MFA enrol/disable — settings/security/page.tsx:27, MfaCard :156) and money
// (billing/subscription/payment — settings/billing/page.tsx) are human-bound (README §2: security actions
// stay strictly human; the money rule). The agent points the user to Settings → Security / Billing.
export const SETTINGS_EXCLUDED_IDS = [
  "settings.changePassword", "settings.enrollMfa", "settings.disableMfa",
  "settings.manageBilling", "settings.upgradePlan", "settings.updatePayment",
] as const;
```
A test asserts each registered settings action's id is disjoint from this; (grep/static) no `run` references `handleSubmit` (password) / `<MfaCard>` / `<BillingClient>`.

> **Deferred (out of scope, not excluded-on-principle):** the **complex** settings editors — ICP/criteria (`settings/icp`: multi-step editor + `save()`/`remove()`/`restore()`/`persistOrder()` + async recompute poll, `:220-309`), sending-infrastructure (provider OAuth), data-model/objects/workflows/plays (schema editors). Their single-handler reuse is not clean; the agent uses the existing **headless** settings tools for these (requirements §6).
> **`editPipelineStages` is whole-list (E-11):** the page's own model is "edit the stage list in memory, commit all in one `saveStages` PUT" (the per-stage `addStage`/`removeStage`/`updateStage` are client-only `useState`, `stages/page.tsx:45-51`, with no endpoint). So the action mirrors that: it sends the full `stages` array. The model is taught to read the current stages (headless), apply its change, and send the complete intended set.
> **`addSignal` has no registered delete:** the signals delete is not exposed in the UI today (`signals/page.tsx:29` comment), so there is no handler to reuse — `settings.addSignal` is create-only.

### H.3 The `PageAction[]` arrays (sketch — each on its route's page)

```ts
// settings/guardrails/page.tsx
useRegisterPageActions(useMemo(() => [
  { id: "settings.setApprovalMode", title: "Set the agent approval mode",
    description: "Set how the agent's actions are approved: review-each (confirm everything), batch-daily, or auto-high-confidence.",
    params: z.object({ mode: z.enum(["review-each","batch-daily","auto-high-confidence"]) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ mode }) => { const r = await saveApprovalModeValue(mode); return r.ok ? ok(`Approval mode set to ${mode}.`) : err(r.error!); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []));

// settings/notifications/page.tsx
useRegisterPageActions(useMemo(() => [
  { id: "settings.updateNotificationPrefs", params: z.object({ key: z.string().min(1), channel: z.enum(["email","inApp","slack"]), enabled: z.boolean() }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ key, channel, enabled }) => { const r = await setNotificationPref(key, channel, enabled); return r.ok ? ok(`${enabled ? "Enabled" : "Disabled"} ${channel} notifications for ${key}.`) : err(r.error!); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []));

// settings/stages/page.tsx
useRegisterPageActions(useMemo(() => [
  { id: "settings.editPipelineStages", params: z.object({ stages: z.array(z.object({ id: z.string().optional(), name: z.string().min(1), description: z.string().optional(), category: z.string().optional(), aiFillMode: z.string().optional(), wipLimit: z.number().int().positive().optional() })).min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ stages }) => { const r = await saveStagesValue(stages); return r.ok ? ok(`Pipeline updated — ${stages.length} stages.`) : err(r.error!); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []));

// settings/signals/page.tsx
useRegisterPageActions(useMemo(() => [
  { id: "settings.addSignal", params: z.object({ name: z.string().min(1), description: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ name, description }) => { const r = await createSignal(name.trim(), description.trim()); return r.ok ? ok(`Added the "${name.trim()}" signal.`) : err(r.error!); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []));

// settings/workspace/page.tsx
useRegisterPageActions(useMemo(() => [
  { id: "settings.updateWorkspaceName", params: z.object({ name: z.string().min(1) }),
    mutating: true, reversible: true, cost: "free", confirm: "risky",
    run: async ({ name }) => { const r = await saveWorkspaceName(name.trim()); return r.ok ? ok(`Workspace renamed to "${name.trim()}".`) : err(r.error!); } },
  // eslint-disable-next-line react-hooks/exhaustive-deps
], []));
```

---

## I. Data flow (model → tool → directive → confirm gate → existing handler → page)

Identical to CLE-06 §5 / CLE-09 §5. Example (sequences launch):
```
 user: "launch the EMS campaign"   (on /sequences/S)
   ▼ POST /api/chat  body.pageActions = getActionManifest()  (CLE-03 dock)
 SERVER (CLE-04): listPageActions() → sees sequences.* for THIS page
   invokePageAction("sequences.launch", { sequenceId:"S" })
     • entry found; jsonSchemaToZod.safeParse ok
     • decideAction({ mutating:true, outbound:true, confirm:"always", role }) → confirm → requireConfirm=true (outbound path, any mode)
     • return { ...invokeActionDirective(uuid, id, params, true) }
 CLIENT (CLE-03 + CLE-05): parseUiDirective → {kind:"invokeAction", requireConfirm:true}
   runUiDirective → requireConfirm → CLE-05 confirm card ("Sends externally" badge) → user Approves
     → runRegisteredAction("sequences.launch", params) → OUR run() → launchCampaign()  ◀── existing handler :163
          → POST /api/campaigns/S/launch  (the page's own send path + guardrails)
          → ok("Campaign launched — queued emails will send.")
     → encodeActionResult(uuid, result) → chat.sendMessage("[[action-result]]…")
   ▼ the sequence visibly goes live on the page
 next POST /api/chat carries the envelope → model reads ok+summary → "Done — the EMS campaign is launching."
```
For `confirm:"never"` actions (inbox view setters, `createCampaign`, `editComponentMap`, `openTemplateUpload`, `openDownload`, the home open/reply, the tasks/knowledge view setters), `decideAction → execute → requireConfirm:false`, so CLE-03 runs them immediately (no card). For an **EXCLUDED** id (`meetings.record`, `proposals.uploadTemplate`-submit, `settings.changePassword`, the wizard send-buttons), `invokePageAction` finds no manifest entry → `{ error, availableActionIds }`, no directive; the model explains the human does it.

---

## J. Failure handling (every branch returns a `PageActionResult`; nothing throws)

Same discipline as CLE-06 §6 / CLE-09 §6. Per-page guards: id-not-open/loaded → `{ ok:false, error }` no network (E-1); enum out of range → schema reject (E-2); empty required field → guard mirror, no network (the page's own `if (!x) return`); server non-OK → the existing handler's non-OK branch surfaces `{ ok:false, error }`; outbound guardrail block → `{ ok:false, error:<server message> }` (E-3); file-picker → only opens, never submits (E-4); download → only navigates, never reads bytes (E-5); excluded id → CLE-04 unknown-id refusal (E-6); off-page → CLE-04 refusal / CLE-03 `action_not_registered` (E-7); `run` throws → CLE-03 `runRegisteredAction` try/catch returns `{ ok:false, error }`, chat loop intact (the safety net is upstream; our `run`s avoid throwing by construction).

---

## K. Security

- **No new runnable surface, no new endpoints.** Every `run` calls an existing page/child handler (direct / pure extraction / `useImperativeHandle` lift) or is a **second caller of an endpoint the page already calls** (`/api/call-intel/review`, `/api/contacts/:id/lead-feedback`). The agent gets **exactly** the clickable, non-human-bound surface a human on each page already has — parity by construction (README §1.1). No `eval`, no DOM-by-vision.
- **The human-bound surfaces are NOT exposed (the headline security property).** The meeting **recorder** (mic), the **transcript/template file-byte upload**, the **file-byte download**, the **security** actions (password/MFA), the **money** actions (billing), and the **wizard send-buttons** have working handlers but **no `PageAction` wraps them** (§B.2/§C.5/§F.2/§H.2). The four disjointness tests (`MEETINGS_EXCLUDED_IDS`, `PROPOSALS_EXCLUDED_IDS`, `SETTINGS_EXCLUDED_IDS`, `SEQUENCES_WIZARD_EXCLUDED_IDS`) are regression tripwires. A prompt-injection-influenced model naming `meetings.record`/`settings.changePassword`/`proposals.uploadTemplate` resolves to the unknown-id refusal, never to mic capture / a password change / a file upload.
- **Params validated twice.** Client-side against the action's live Zod schema in `runRegisteredAction` (CLE-03 §2.3) and server-side against the manifest JSON Schema in `invokePageAction` (CLE-04 §2.4). All the enums (lanes, filters, sorts, approval modes, sections, conferencing, wizard steps, download formats) and non-empty ids are enforced before any handler runs.
- **Outbound gating via `decideAction`.** Every outbound action (`meetings.sendFollowUp`/`shareSlack`; `sequences.startProposed`/`resume`/`enrollResume`/`launch`/`reviewBulkApprove`/`reviewApprove`) is `outbound:true` → `decideAction` returns `confirm` regardless of approval mode (CLE-04 §2.1) → CLE-05 surfaces a "Sends externally" badge. The reused endpoints already honour `OUTBOUND_TEST_MODE` + the send guardrails (hardening is CLE-13). No action is `cost:"money"` (the money surface is excluded entirely — stronger than the README floor).
- **Role gating via `decideAction`.** A viewer invoking any mutating/outbound action is **refused** inside `invokePageAction` (`role:viewer + mutating/outbound → refuse`); a viewer can still drive the `confirm:"never"` view/open actions. The excluded security/billing flows keep their existing gates (untouched). No extra gating code; CLE-14 inherits the plane.
- **Tenant isolation unchanged.** The reused API routes are the same tenant-scoped endpoints the pages already rely on (`WHERE tenantId` app-layer). The actions add no DB access of their own.

---

## L. Test strategy

Unit/RTL with **vitest** + **@testing-library/react** (the CLE-03/05/06/08/09 pattern). Mock `fetch`; spy the existing handlers/setters or the lifted refs; assert `run → effect → result`. No live server except the per-page-group eval. **One test file per page** (so per-page branches are self-contained):
- `inbox-actions.test.tsx`, `meetings-actions.test.tsx` (+ `meetings-actions.boundary.test.ts` — the recorder/upload disjointness), `sequences-actions.test.tsx` (+ `sequences-actions.boundary.test.ts` — the wizard send-button disjointness), `tasks-actions.test.tsx`, `knowledge-actions.test.tsx`, `proposals-actions.test.tsx` (+ `proposals-actions.boundary.test.ts` — the upload/download disjointness), `home-actions.test.tsx`, `settings-actions.test.tsx` (+ `settings-actions.boundary.test.ts` — the security/money disjointness).
- Each file: **manifest membership + metadata** (AC-0 spot-asserts), the per-action `run → effect` happy + error paths, the page's guard mirrors, and **off-page degradation** (unmount → ids gone + `action_not_registered`).
- **Dedup**: per page, spy `global.fetch` and assert the button/setter path and the action path issue the **same** URL+body for each reused endpoint (proving one shared implementation), plus a static/grep check each fetch URL appears once after the extractions/lifts (AC-NODUP). For the inline-enroll-PUT collapse (§C.2) and the notes-PATCH dispatcher (§B.3), the dedup test is also the regression guard that the extraction preserved behaviour.
- **Regression:** `pnpm tsc --noEmit` 0; `regression.sh` green; CLE-03/04/05/06/07/08/09 tests untouched; every page's manual flows verified unchanged by the dedup tests (same network shape) + the eval. Coverage target: 100% of the new `run` branches + the extractions/lifts. No new runtime dependency. No new API route.
