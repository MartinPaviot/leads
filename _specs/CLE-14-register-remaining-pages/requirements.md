# CLE-14 — Register the remaining workhorse pages (the parity SWEEP) — Requirements

> The **parity sweep** of the initiative: apply the now-proven Page Action Registry (PAR) pattern — validated on the `/opportunities` pilot (CLE-06), `/accounts` (CLE-07), `/contacts` (CLE-08) and `/call-mode` (CLE-09) — to **all** the remaining workhorse pages: **inbox, meetings, sequences, tasks, knowledge, proposals, home, settings**. After CLE-14, a human's clickable surface on every routine page is invocable by the agent under the same `decideAction`/confirm-card plane, and the user *sees* the action happen on the page.
> Constitution: `_specs/chat-live-executor/README.md` — SSOT for every contract cited: §3.1 directive `invokeAction`, §3.2 `PageAction`, §3.3 `useRegisterPageActions`/`getActionManifest`/`runRegisteredAction`, §3.5 result envelope, §3.6 two-tier routing (page-action vs headless), and **§2 non-scope (the hard boundary)**: "Média temps réel piloté par l'agent … capture micro du recorder. L'agent **prépare et navigue**, l'humain exécute." / "Dialogues fichiers natifs navigateur (upload CSV/transcript/template `.docx`) — l'agent peut ouvrir le flow, pas choisir le fichier." / "Actions de sécurité (changer mot de passe, enrôler MFA) — restent strictement humaines."
> Audit: `_research/chat-task-executor-audit-2026-06-16.md` — §3 parity table rows for `/inbox` (line 95), `/meetings/[id]` (line 98), `/sequences (+wizard)` (line 97), `/tasks` (line 99), `/knowledge` (line 100), `/proposals` (line 101), `/settings/*` (line 102); the page actions this feature adds are the audit's **middle column** ("nécessite couche d'actionnement").
> Feature record: `_specs/chat-live-executor/feature_list.json` → `CLE-14-register-remaining-pages` (phase 3, milestone **M3**, `checkpoint: false`, `depends_on: ["CLE-06-register-opportunities", "CLE-07-register-accounts", "CLE-08-register-contacts", "CLE-09-register-call-mode"]`, completeness target 8). Its summary mandates: "meetings … **PAS recorder**; proposals … **PAS upload/download**; settings cluster … EXCLUDE security + money."
> Depends on (must be present on the branch base): **CLE-03** (`useRegisterPageActions`, `PageAction`/`PageActionResult`, the registry, the executor + the `requireConfirm` seam), **CLE-04** (`listPageActions`/`invokePageAction`, `decideAction`, the prompt heuristic + envelope-reading), **CLE-05** (the editable confirm card rendered when `requireConfirm:true`, the risk badges). And the **patterns proven** by CLE-06/08/09 (the `useMemo([], [])` stable-id-set + ref-read pattern, the pure-extraction rule, the handler-lift via `useImperativeHandle`, the file-picker boundary, the second-REST-caller seam, the human-bound disjointness test).

This feature writes **no** new framework code. It calls `useRegisterPageActions(...)` from each remaining page, mapping every declared `PageAction.run` to a handler **that already exists** on the page or its sub-components. **Zero handler logic is duplicated** — each `run` closure invokes the same function the button/setter/checkbox invokes (reusing it directly when it is at page scope, via a behaviour-preserving pure extraction or `useImperativeHandle` lift when it lives in a child, or as a **second caller of the same REST contract** when the only seam is an endpoint — the CLE-08 §1.2 call-intel pattern).

It carries **two** human-bound boundaries proven on earlier pages, now reapplied:
- **The file-picker boundary** (CLE-08 §2): on **meetings** (transcript upload) and **proposals** (template `.docx`/`.pptx` upload), the agent may **open** the import flow but **cannot** choose the file — there is no registry path to pass file bytes.
- **The live-media boundary** (CLE-09 §2): on **meetings**, the in-browser **recorder** (mic capture via `getUserMedia`/`MediaRecorder`) is **never declared** — the agent prepares notes/follow-up/intel but the human records.

Plus a **third** boundary, new to this feature but identical in spirit:
- **The browser-download boundary** (README §2 file-dialog spirit, audit `/proposals` line 101 "download PDF"): on **proposals**, the proposal/PDF **download** is a native browser download (`<a href download>`); the agent may **navigate** the user to it but the action never streams bytes to the client. *(Recorded as a documented exclusion with the safe `openDownload`/navigate alternative; see §EXCLUSIONS.)*

And, on **settings**, the security and money surfaces (change password, MFA enrol, billing/subscription/payment) are **never declared** (README §2 "actions de sécurité … restent strictement humaines"; the money rule). Only **safe, single-handler config writes** are registered.

This is the broadest single feature of the initiative. It is **executable as one branch** but is designed to be **split per page** in execution (each page is independent, mirrors the same proven shape, and has its own test file) — see §"Execution: one branch or split" and `tasks.md`.

---

## 1. User story

**As** the founder using the Elevay chat while on any of my routine working pages,
**I want** to ask the agent in plain language to do the page's native job — triage / reply / book from my inbox; edit a meeting's notes, send the follow-up, share to Slack, approve the intel; create/pause/launch a sequence, edit a step, approve the review queue; add and complete tasks; add/edit knowledge; draft a proposal from a deal and tweak its mapping; reply to a "Needs you" item or mark an inbound "not a lead" from home; flip a safe setting (notifications, approval mode, a pipeline stage, a buying signal) —
**so that** the action happens **on the page in front of me** — I see the conversation resolve, the notes save, the sequence go live, the task check off, the proposal regenerate — instead of the agent silently writing to the database where I can't see it (audit §2 G1/G4; README doctrine §1.1 "parity by construction"),
**and** the genuinely human steps — **recording a meeting with my mic, choosing a file to upload, downloading a PDF, changing my password, enrolling MFA, paying money** — stay with me, refused cleanly by the agent which says it has prepared what it can.

Concretely: "mark this conversation done" triages it; "snooze it to tomorrow" snoozes; "draft a reply" opens the composer; "book a meeting with her" opens the scheduler; "stop the sequence for this contact" stops it. "Tighten the summary to three lines" edits the meeting summary; "send the follow-up" sends it (after a confirm card, it is outbound); "share this to Slack" posts it (after a confirm card); "approve the MEDDPICC" applies the intel. "Pause the EMS campaign" pauses it; "launch it" launches it (confirm card — outbound); "delete step 3" pops a destructive confirm; "approve all the drafts" bulk-approves the review queue (confirm card — outbound). "Add a task to call Marie Friday" creates it; "mark it done" completes it; "bump its priority" cycles it. "Add a knowledge note about our pricing" creates it; "delete that note" pops a confirm. "Draft a proposal for the Acme deal" fills the template; "regenerate the pricing section" regenerates it; "save my edits" saves. On home: "reply to the first Needs-you item" opens the composer; "open that deal" navigates; "that one's not a lead" dismisses it. In settings: "set my approval mode to review each" flips it; "turn off email notifications for deal risk" updates prefs; "add a Negotiation stage" edits the pipeline; "add a signal for hiring a CISO" creates it.

But **"record the meeting", "upload this transcript", "import this template", "download the PDF", "change my password", "enrol MFA", "upgrade my plan"** are **refused as not invocable** — the agent says it has prepared what it can (opened the recorder/upload/download surface where one exists, or pointed to Settings) and the human does the irreducibly-human step.

---

## 2. The action set (scope) — by page

Every action has id `<page>.<verb>`, a `zod` `params` schema, a `run` mapped to an existing handler, and metadata. The metadata column drives `decideAction` (CLE-04 §2.1) → whether CLE-05 shows a confirm card. **All citations are `file:line` into the real code; the full handler mapping is in `design.md` §per-page.** The confirm-tier rules are identical to CLE-06/08/09:
- `confirm:"never"` — pure client view/selection/config-open state, opening a panel/picker, or opening the composer (no persistence, no send, no spend).
- `confirm:"risky"` — a reversible mutation, or a credits-spend that is recoverable/idempotent → `decideAction` returns `confirm` → editable card first.
- `confirm:"always"` — destructive (even if soft-delete makes it reversible) **or** outbound (a real email/invite/launch reaches a third party) → `confirm` regardless of approval mode.

### 2.1 `/inbox` — id `inbox.<verb>` (design.md §A)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `inbox.triageDone` | `{ conversationKey: string }` | `handleTriage(key,"done")` (`inbox/page.tsx:146`) → `POST /api/inbox/triage` | true | false | true (reopen) | free | **risky** |
| `inbox.snooze` | `{ conversationKey: string; until: string }` | `handleTriage(key,"snooze",untilISO)` (`page.tsx:146`) | true | false | true | free | **risky** |
| `inbox.reopen` | `{ conversationKey: string }` | `handleTriage(key,"reopen")` (`page.tsx:146`) | true | false | true | free | **risky** |
| `inbox.selectConversation` | `{ conversationKey: string }` | `setSelectedKey(key)` (`page.tsx:56`) | **false** | false | true | free | **never** |
| `inbox.setLane` | `{ lane: "attention"\|"snoozed"\|"done"\|"handled"\|"outbound" }` | `setTab(lane)` (`page.tsx:41`) | **false** | false | true | free | **never** |
| `inbox.switchMailbox` | `{ mailboxId: string \| null }` | `setSelectedMailbox(id)` (`page.tsx:49`) | **false** | false | true | free | **never** |
| `inbox.reply` | `{ conversationKey: string }` | `openReply()` via the lifted pane ref (`_conversation-pane.tsx:132`, opens local composer; **no send**) | **false** (opens composer) | false | true | **credits** (LLM suggest) | **never** |
| `inbox.consumeDraft` | `{ conversationKey: string }` | `openReply()` w/ `detail.preparedDraft` then human send → `POST /api/inbox/drafts/:id/consume` (`_conversation-pane.tsx:135-143,186-193`) | **false** (opens composer with the draft; the human edits+sends) | false | true | free | **never** |
| `inbox.bookMeeting` | `{ conversationKey: string }` | `setSchedOpen(true)` → `<MeetingSchedulerCard>` (`_conversation-pane.tsx:80,356-362`) | **false** (opens scheduler) | false | true | free | **never** |
| `inbox.stopSequence` | `{ conversationKey: string }` | `stopSequence()` (`_conversation-pane.tsx:195`) → `PUT /api/sequences/:id/enroll { status:"completed" }` | true | false | true | free | **risky** |
| `inbox.setOutboundFilter` | `{ filter: "all"\|"replied"\|"awaiting"\|"bounced" }` | `setFilter(f)` in `OutboundTable` via lifted ref (`_outbound-table.tsx:46`) | **false** | false | true | free | **never** |

> **Reply/draft are open-only (the inbox prepare-not-send posture).** `inbox.reply`/`inbox.consumeDraft` open the **local** composer (`_conversation-pane.tsx` owns `composer` state, not the global `composeEmail` directive — design §A.2). They are `mutating:false, outbound:false`; the **send** is the human's click in `EmailComposerPanel` (its own confirmed surface). `consumeDraft` loads the server-prepared draft (`detail.preparedDraft`) into the composer for edit; the `POST …/consume` only fires on the human's Send. The LLM-suggest credit (`reply` when no prepared draft) is disclosed via `cost:"credits"` (badge only; it does not gate, no send happens).

### 2.2 `/meetings/[id]` — id `meetings.<verb>` (design.md §B)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `meetings.editNotesSection` | `{ meetingId: string; section: "summary"\|"keyPoints"\|"decisions"\|"followUp"; value: string \| string[] }` | the four save handlers `saveSummary`/`saveKeyPoints`/`saveDecisions`/`saveFollowUpDraft` (`meetings/[id]/page.tsx:303,320,339,356`) → `PATCH /api/meetings/:id/notes` | true | false | true | free | **risky** |
| `meetings.sendFollowUp` | `{ meetingId: string }` | `sendFollowUp()` (`[id]/page.tsx:386`) → `POST /api/meetings/:id/notes/send-follow-up` (sends the email) | true | **true** | false | free | **always** |
| `meetings.shareSlack` | `{ meetingId: string }` | `shareToSlack()` (`[id]/page.tsx:413`) → `POST /api/meetings/:id/share-slack` | true | **true** (posts to Slack) | false | free | **always** (`confirm:"risky"` floor; raised to always — see note) |
| `meetings.generatePrep` | `{ meetingId: string }` | the inline prep generator (`[id]/page.tsx:1093`) → `POST /api/meetings/prep { accountId?, contactId? }` | true (caches prep) | false | true | free | **risky** |
| `meetings.postCallConfirm` | `{ meetingId: string }` | `triggerPostCall()` (`[id]/page.tsx:274`) → `POST /api/meetings/:id/post-call` | true | false | true | free | **risky** |
| `meetings.approveIntel` | `{ meetingId: string; entityType: "deal"\|"company"\|"contact"; entityId: string }` | `POST /api/call-intel/review { entityType, entityId, action:"approve" }` — the same endpoint `usePendingReview.act` posts (`components/call-intel.tsx:77`), called via a page-level second-caller helper (design §B.4) | true | false | true | free | **risky** |
| `meetings.dismissIntel` | `{ meetingId: string; entityType: "deal"\|"company"\|"contact"; entityId: string }` | same review path with `action:"dismiss"` (`call-intel.tsx:77`) | true | false | true | free | **risky** |

> **The audit's prompt says `confirm:"risky"` for share; this spec raises `shareSlack` to `confirm:"always"`** because it is **outbound** (posts the meeting summary into a Slack channel — a third-party surface). Per the confirm-tier rule and `decideAction`, any outbound action is `confirm` regardless; declaring `"always"` makes it mode-independent (parity with CLE-09 `bookMeeting`). `sendFollowUp` is likewise `outbound:true, confirm:"always"`.

### 2.3 `/sequences` (+ `[id]`, `review`, wizard) — id `sequences.<verb>` (design.md §C)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `sequences.createCampaign` | `{}` | `setShowWizard(true)` (`sequences/page.tsx:116`) → opens `<CampaignWizard>` | **false** (opens wizard) | false | true | free | **never** |
| `sequences.startProposed` | `{ sequenceId: string }` | `transitionStatus(id,"active")` (`sequences/page.tsx:201`) → `PUT /api/sequences/:id { status:"active" }` | true | **true** (begins sending on next worker tick) | true (pause) | free | **always** |
| `sequences.rejectProposed` | `{ sequenceId: string }` | `transitionStatus(id,"archived")` (`page.tsx:216`) → `PUT { status:"archived" }` | true | false | true | free | **risky** |
| `sequences.pause` | `{ sequenceId: string }` | `toggleStatus()` → `PUT /api/sequences/:id { status:"paused" }` (`[id]/page.tsx:146`) | true | false | true | free | **risky** |
| `sequences.resume` | `{ sequenceId: string }` | `toggleStatus()` → `PUT { status:"active" }` (`[id]/page.tsx:146`) | true | **true** (resumes sending) | true | free | **always** |
| `sequences.editStep` | `{ sequenceId: string; stepId: string; subjectTemplate?; bodyTemplate?; delayDays? }` | `saveStep()` (`[id]/page.tsx:212`) → `PATCH /api/sequences/:id/steps/:stepId` | true | false | true | free | **risky** |
| `sequences.deleteStep` | `{ sequenceId: string; stepId: string }` | `deleteStep(stepId)` (`[id]/page.tsx:245`) → `DELETE /api/sequences/:id/steps/:stepId` | true | false | false (no soft-delete) | free | **always** |
| `sequences.enrollPause` | `{ sequenceId: string; enrollmentId: string }` | the inline enroll PUT (`[id]/page.tsx:599`) → `PUT /api/sequences/:id/enroll { enrollmentId, status:"paused" }` | true | false | true | free | **risky** |
| `sequences.enrollResume` | `{ sequenceId: string; enrollmentId: string }` | the inline enroll PUT (`[id]/page.tsx:611`) → `PUT { …, status:"active" }` | true | **true** (resumes that contact's sends) | true | free | **always** |
| `sequences.enrollStop` | `{ sequenceId: string; enrollmentId: string }` | the inline enroll PUT (`[id]/page.tsx:623`) → `PUT { …, status:"completed" }` | true | false | true | free | **risky** |
| `sequences.launch` | `{ sequenceId: string }` | `launchCampaign()` (`[id]/page.tsx:163`) → `POST /api/campaigns/:id/launch` (sends queued mail) | true | **true** | false | free | **always** |
| `sequences.reviewBulkApprove` | `{ ids: string[] }` | `handleBulkApprove()` (`review/page.tsx:151`) → `POST /api/sequences/drafts/bulk-approve { ids }` (queues for send) | true | **true** | true | free | **always** |
| `sequences.reviewApprove` | `{ draftId: string; version: string }` | `handleApprove()` (`review/page.tsx:201`) → `POST /api/sequences/drafts/:id/approve { version }` | true | **true** | true | free | **always** |
| `sequences.reviewReject` | `{ draftId: string; version: string; reason: string; pauseEnrollment?: boolean }` | `submitReject()` (`review/page.tsx:229`) → `POST /api/sequences/drafts/:id/reject` | true | false | true | free | **risky** |
| `sequences.reviewEdit` | `{ draftId: string }` | the review page's edit affordance → `SequenceDraftPreview` edit (opens the editor; the save is the child's `onEditSaved`, `review/page.tsx:387-391`) | **false** (opens the draft editor) | false | true | free | **never** |
| `sequences.wizardAdvance` | `{ to: "targets"\|"generating"\|"review"\|"launch" }` | `setStep(to)` in `CampaignWizard` via lifted ref (`campaign-wizard.tsx:91,94`) — navigates the wizard; the per-step network (create/generate/prepare/approveAll/launch) is driven by the wizard's own buttons | **false** (wizard navigation) | false | true | free | **never** |

> **The outbound spine of sequences.** `startProposed`, `resume`, `enrollResume`, `launch`, `reviewBulkApprove`, `reviewApprove` all cause real mail to be queued/sent (the recon confirmed the endpoints) → `outbound:true, confirm:"always"`. `pause`, `rejectProposed`, `enrollStop`, `reviewReject` are state-only (stop/archive) → `risky`. `editStep` is template-only → `risky`. `deleteStep` is **destructive with no soft-delete** → `confirm:"always"`, `reversible:false`. `createCampaign`/`reviewEdit`/`wizardAdvance` only open a surface → `never`.
> **The wizard's per-step network stays human-driven (the prepare-not-execute line for the wizard).** `wizardAdvance` only flips `step`; it does **not** fire the create/generate/prepare/approveAll/launch POSTs (those are the wizard's own buttons, and `approveAll`/`launch` are outbound). The agent can *open the wizard* and *move between its panels*; the human presses the send-bearing buttons. *(`launch` is separately registered as a top-level action for the non-wizard launch button; the wizard's internal launch is the human's click. Documented contract-adjacent choice — design §C.6.)*

### 2.4 `/tasks` — id `tasks.<verb>` (design.md §D)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `tasks.addTask` | `{ title: string; priority?: "low"\|"medium"\|"high" }` | `addTask()` (`tasks/page.tsx:115`) → `POST /api/tasks` | true | false | true | free | **risky** |
| `tasks.toggleComplete` | `{ taskId: string; completed?: boolean }` | `toggleTask(task)` (`tasks/page.tsx:130`) → `PATCH /api/tasks/:id { status }` | true | false | true | free | **risky** |
| `tasks.cyclePriority` | `{ taskId: string }` | `cyclePriority(task)` (`tasks/page.tsx:144`) → `PATCH /api/tasks/:id { priority }` | true | false | true | free | **risky** |
| `tasks.setFilter` | `{ filter: "all"\|"due_today"\|"overdue"\|"completed" }` | `setFilterTab(f)` (`tasks/page.tsx:98`) | **false** | false | true | free | **never** |
| `tasks.setSort` | `{ sort: "priority"\|"due_date" }` | `setSortMode(s)` (`tasks/page.tsx:99`) | **false** | false | true | free | **never** |

### 2.5 `/knowledge` — id `knowledge.<verb>` (design.md §E)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `knowledge.addEntry` | `{ title: string; content: string; scope?: string; category?: string }` | `handleAddEntry()` (`knowledge/page.tsx:53`) → `POST /api/settings/knowledge` | true | false | true | free | **risky** |
| `knowledge.saveEntry` | `{ id: string; title?: string; content?: string; category?: string }` | `handleSaveEntry()` (`knowledge/page.tsx:78`) → `PUT /api/settings/knowledge` | true | false | true | free | **risky** |
| `knowledge.deleteEntry` | `{ id: string }` | `handleDeleteEntry(id)` (`knowledge/page.tsx:96`) → `DELETE /api/settings/knowledge?id=…` | true | false | false (hard delete) | free | **always** |
| `knowledge.search` | `{ query: string }` | `setQuery(q)` (`knowledge/page.tsx:22`) | **false** | false | true | free | **never** |

### 2.6 `/proposals` — id `proposals.<verb>` (design.md §F)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `proposals.draftFromDeal` | `{ templateId: string; dealId: string }` | `runFill()` (`proposals/page.tsx:228`) → `POST /api/proposals/templates/:id/fill { dealId }` | true | false | true | free (LLM fill; see note) | **risky** |
| `proposals.confirmMapping` | `{ templateId: string }` | `confirmMap()` (`proposals/page.tsx:204`) → `PATCH /api/proposals/templates/:id { componentMap }` | true | false | true | free | **risky** |
| `proposals.editComponentMap` | `{ index: number; kind?; label?; dataKey?; confidence? }` | `patchComponent(i, partial)` (`proposals/page.tsx:183`) — client-side draft map edit (no network) | **false** (client draft state) | false | true | free | **never** |
| `proposals.regenerateComponent` | `{ proposalId: string; componentId: string; guidance?: string }` | `regenerateOne(componentId, guidance?)` (`proposals/page.tsx:291`) → `POST /api/proposals/:id/components/:cid/regenerate` | true | false | true | free | **risky** |
| `proposals.saveEdits` | `{ proposalId: string }` | `saveEdits()` (`proposals/page.tsx:265`) → `PATCH /api/proposals/:id { components }` | true | false | true | free | **risky** |

### 2.7 `/home` — id `home.<verb>` (design.md §G)

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `home.replyNeedsYou` | `{ todoId: string }` | the `onTodo(todo)` path that sets the composer for a `kind:"reply"` todo (`up-next-view.tsx:99-107`) | **false** (opens composer) | false | true | free | **never** |
| `home.openItem` | `{ id: string; kind: "todo"\|"actualite" }` | `router.push(item.href)` (`up-next-view.tsx:108,173`) | **false** (navigate) | false | true | free | **never** |
| `home.notALead` | `{ contactId: string }` | `markNotALead(item)` → `POST /api/contacts/:id/lead-feedback { isLead:false }` (`hot-inbounds-widget.tsx:68`), called via a page-level second-caller helper (design §G.3) | true | false | true | free | **risky** |

### 2.8 `/settings/*` — id `settings.<verb>` (design.md §H) — SAFE config writes only

| id | params (zod) | maps to existing handler (file:line) | mutating | outbound | reversible | cost | confirm |
|---|---|---|---|---|---|---|---|
| `settings.setApprovalMode` | `{ mode: "review-each"\|"batch-daily"\|"auto-high-confidence" }` | `saveApprovalMode()` (`settings/guardrails/page.tsx:106`) → `PUT /api/settings/workspace { agentApprovalMode }` | true | false | true | free | **risky** |
| `settings.updateNotificationPrefs` | `{ key: string; channel: "email"\|"inApp"\|"slack"; enabled: boolean }` | `toggle()`→`save()` (`settings/notifications/page.tsx:81,72`) → `PUT /api/notifications/preferences` | true | false | true | free | **risky** |
| `settings.editPipelineStages` | `{ stages: Array<{ id?; name; description?; category?; aiFillMode?; wipLimit? }> }` | `saveStages()` (`settings/stages/page.tsx:53`) → `PUT /api/settings/stages { stages }` | true | false | true | free | **risky** |
| `settings.addSignal` | `{ name: string; description: string }` | `handleCreate()` (`settings/signals/page.tsx:65`) → `POST /api/custom-signals` | true | false | true | free | **risky** |
| `settings.updateWorkspaceName` | `{ name: string }` | `saveName()` (`settings/workspace/page.tsx:49`) → `PUT /api/settings/workspace { name }` | true | false | true | free | **risky** |

> **Settings is deliberately a small, hand-picked set** of single-handler config writes with one clear endpoint each. **Excluded** (see §EXCLUSIONS): security (`settings/security` password + MFA), billing/money (`settings/billing`), and the **complex/multi-step** editors (ICP/criteria `settings/icp` — multi-step editor + async recompute poll; sending-infrastructure — provider OAuth; data-model/objects/workflows/plays — schema editors). The `addSignal`-style **delete** is **not** registered (the signals delete is not even exposed in the UI yet, per `signals/page.tsx:29`); `editPipelineStages` replaces the whole stage list in one PUT (the page's own model), so the action mirrors that — it is **not** a per-stage add/remove (those are client-only `useState` ops with no endpoint, `stages/page.tsx:45-51`).

---

## 3. EXCLUSIONS — the human-bound / out-of-scope surfaces (consolidated, with rationale)

These flows exist and have working handlers, but are **deliberately NOT registered** as `PageAction`s. Enforced two ways (README §2 doctrine, proven on CLE-08/09): **by omission** (never in any `useMemo` array → not in the manifest → `invokePageAction` cannot resolve them → `runRegisteredAction` returns `action_not_registered`) **and by a guardrail test** (per-page frozen `*_HUMAN_BOUND_IDS` / `*_EXCLUDED_IDS` set asserted disjoint from the registered ids — the required disjointness tests, §6).

| # | Excluded flow | Page | Existing handler (file:line) — present but NOT wrapped | Why human/device-bound | What the agent does instead |
|---|---|---|---|---|---|
| X-1 | **In-browser meeting recorder** (mic capture) | meetings | `start()` `_meeting-recorder.tsx:50` → `navigator.mediaDevices.getUserMedia()` `:63`; `stop()` `:117` (`MediaRecorder`, Opus) | Live media + **mic capture** driven by the agent (README §2 first bullet). The browser leg *is* the recording; the human's mic must attach. | Prepares notes/follow-up/intel after the fact; tells the user it cannot operate the mic. The human records. |
| X-2 | **Transcript file upload** | meetings | `handleFileUpload()` `meetings/[id]/page.tsx:229`; `<input type="file" accept=".txt,.vtt,.srt,.mp3,…">` `:1042` → `POST /api/meetings/upload-transcript` | **Native browser file dialog** — the agent cannot choose a file (README §2 file-picker). | Per the CLE-08 boundary, an `openTranscriptUpload` *could* open the picker; **this spec does not even register that** (the upload surface lives on `/meetings/upload`, a separate page; the detail page's `<input>` is one click). The agent points the user there. *(Documented alternative: register an open-only `meetings.openTranscriptUpload` calling `fileRef.current?.click()`, `mutating:false`, like `contacts.openImport` — additive if Martin wants it.)* |
| X-3 | **Template upload** (`.docx`/`.pptx`) | proposals | `onUpload()` `proposals/page.tsx:149` (`FormData`); `<input type="file" accept=".docx,.pptx">` `:356-363` → `POST /api/proposals/templates` | **Native browser file dialog** + multipart upload (README §2 file-picker). | Open-only is allowed (CLE-08 pattern). **This spec registers `proposals.openTemplateUpload`** (`run` = `fileRef.current?.click()`, `mutating:false`, `confirm:"never"`) so the agent can *open the picker*; it can **never** pass file bytes (no file field in any schema). The human picks the file. |
| X-4 | **Proposal / PDF download** | proposals | `<a href="/api/proposals/:id/download">` `:589`; `<a href="…?as=pdf">` `:598` (browser download) | **Native browser download** (`<a download>`/navigation) — the agent does not stream bytes to the client (README §2 file-dialog spirit; audit `/proposals` line 101 "download PDF"). | **Registers `proposals.openDownload`** (`{ proposalId, format:"docx"\|"pdf" }`) as a **navigate** action (emits the existing `navigate` directive to the `/api/proposals/:id/download[?as=pdf]` URL, `mutating:false`, `confirm:"never"`) so the agent can *take the user to the download*; it never reads the file. *(Alternative: leave it fully unregistered and have the agent describe the button. Registering navigate-only is the more useful, equally safe choice — design §F.3.)* |
| X-5 | **Change password** | settings | `handleSubmit()` `settings/security/page.tsx:27` → `POST /api/account/password` | **Security action** — README §2 ("changer mot de passe … strictement humaines"). | Not invocable. The agent points the user to Settings → Security. |
| X-6 | **Enrol / manage MFA** | settings | `<MfaCard/>` `settings/security/page.tsx:6,156` (enrol/verify/disable) | **Security action** — README §2 ("enrôler MFA … strictement humaines"). | Not invocable. The agent points the user to Settings → Security. |
| X-7 | **Billing / subscription / payment** | settings | `<BillingClient/>` `settings/billing/page.tsx` (gated by `BILLING_PAGE_ENABLED`) | **Spends/manages real money** (README §2 money rule; the page is prod-hidden anyway, per memory). | Not invocable. The agent points the user to Settings → Billing (where enabled). |
| X-8 | **Inbox outbound search box** | inbox | — (the outbound table has **no** `q`/search param today; only `filter`+`page`, `_outbound-table.tsx:56`) | **Does not exist** — there is no handler to wrap. | `inbox.setOutboundFilter` covers the existing filter; there is no search to register. *(Not an exclusion of principle — an absence. If a search box is added later, register `inbox.searchOutbound` then.)* |
| X-9 | **Live call from inbox/contacts/meetings** (dial/answer/hang-up/voicemail/disposition) | (cross-page) | the WebRTC dial path on `/call-mode` (`handleAppeler`, etc.) | **Live media** — permanently human-bound (README §2; CLE-09 §3). | Not invocable anywhere. The inbox/home "reply"/"book"/"open" actions navigate/prepare; the human dials in Call Mode. |
| X-10 | **Sequence wizard's send-bearing buttons** (approveAll, the in-wizard launch) | sequences | `approveAll()` `campaign-wizard.tsx:270`; the wizard `launchCampaign()` `:281` | These **send mail** from inside a multi-step wizard the human is driving; `wizardAdvance` only navigates panels (design §C.6). | The agent opens the wizard and moves between panels; the human presses approve-all/launch. (The top-level `sequences.launch` covers the non-wizard launch button, behind `confirm:"always"`.) |

**Stated boundary (must appear in the design + the model's mental model):** the agent **PREPARES and OPENS** (drafts notes, opens the composer/scheduler/recorder-less prep, opens the upload picker, navigates to the download, opens the wizard) — **but the human records with their mic, chooses files, takes downloads, changes security settings, pays money, and presses the send-bearing wizard buttons**. If asked to do an excluded step, the agent explains it has prepared/opened what it can and hands that step to the human.

---

## 4. EARS acceptance criteria (GIVEN / WHEN / THEN)

Notation: "the registry" = CLE-03 `lib/chat/page-actions/registry.ts`. "the manifest" = `getActionManifest()`. "invoke X" = the model calls `invokePageAction("<page>.X", params)` (CLE-04), which emits the directive that CLE-03's executor dispatches (after CLE-05's confirm gate when `requireConfirm:true`). Each criterion is testable in isolation against the action's `run` (the framework round-trip is already covered by CLE-03/04/05 tests). Grouped by page; at least the **headline action per page** is spelled out as GIVEN/WHEN/THEN; the rest follow the same shape and are enumerated with their effect + result.

### AC-0 — Per-page manifest membership while mounted (all pages)
- **GIVEN** the user is on page P (one of inbox / meetings[id] / sequences / sequences[id] / sequences review / tasks / knowledge / proposals / home / a registered settings page),
- **WHEN** `getActionManifest()` is read,
- **THEN** it contains exactly P's `<page>.*` ids (§2) with correct `mutating`/`outbound`/`reversible`/`cost`/`confirm` scalars and a JSON Schema per `params`,
- **AND** it contains **none** of the EXCLUDED ids for that page (no `meetings.record`/`meetings.uploadTranscript`(submit)/`proposals.uploadTemplate`(submit)/`proposals.downloadPdf`(stream)/`settings.changePassword`/`settings.enrollMfa`/`settings.manageBilling` — they do not exist as runnable actions),
- **AND** after navigating away the manifest contains **none** of P's ids (CLE-03 unmount cleanup),
- **AND** detail-only ids (`meetings.*`, `sequences.editStep`/`deleteStep`/`enroll*`/`launch`) register on the detail route, list-only ids (`sequences.createCampaign`/`startProposed`/`rejectProposed`) on the list route, review ids (`sequences.review*`) on the review route — each page registers only the actions whose handlers it owns.

### AC-INBOX (headline: `inbox.triageDone`)
- **GIVEN** the user is on `/inbox` with a conversation `K` loaded,
- **WHEN** `inbox.triageDone({ conversationKey: "K" })` runs (after the CLE-05 confirm card, `confirm:"risky"`),
- **THEN** the same `POST /api/inbox/triage { conversationKey:"K", action:"done" }` that the Done button fires (`handleTriage`, `page.tsx:146`) is sent, the conversation leaves the attention lane (the page's existing optimistic update), and the result is `{ ok:true, summary:"Marked the conversation with <sender> as done." }`,
- **AND** on a failed POST the existing path is taken and the result is `{ ok:false, error }`.
- The rest of `/inbox`: `snooze` → `handleTriage(…,"snooze",until)` (a malformed/past `until` → `{ ok:false, error }`, no POST); `reopen` → `handleTriage(…,"reopen")`; `selectConversation` → `setSelectedKey` (`confirm:"never"`; unknown key → `{ ok:false, error:"That conversation is not in the current list." }`); `setLane`/`switchMailbox` → the setters (`confirm:"never"`); `reply`/`consumeDraft` → open the local composer (no send, `confirm:"never"`; `consumeDraft` with no `detail.preparedDraft` → falls back to the AI-suggest path like the button, summary notes it); `bookMeeting` → opens the scheduler card (`confirm:"never"`); `stopSequence` → the enroll PUT (`confirm:"risky"`; no enrollment on the conversation → `{ ok:false, error:"No active sequence on this conversation." }`); `setOutboundFilter` → `setFilter` (`confirm:"never"`).

### AC-MEETINGS (headline: `meetings.editNotesSection`)
- **GIVEN** the user is on `/meetings/M` with the meeting loaded,
- **WHEN** `meetings.editNotesSection({ meetingId:"M", section:"summary", value:"Three-line summary." })` runs (`confirm:"risky"`),
- **THEN** the same `PATCH /api/meetings/M/notes { structuredNotes:{ summary:"…" } }` that `saveSummary` fires (`[id]/page.tsx:303`) is sent (the action routes `section` → the matching save handler / payload key; `keyPoints`/`decisions` take a `string[]`, `followUp` maps to `saveFollowUpDraft`'s `{ subject, body }` shape per design §B.3), and the result is `{ ok:true, summary:"Updated the meeting summary." }`,
- **AND** a `meetingId` that is not the open meeting → `{ ok:false, error:"That meeting is not the one open here." }`, no PATCH (E-1).
- The rest of `/meetings/[id]`: `sendFollowUp` → `confirm:"always"` (outbound), `POST …/notes/send-follow-up`, `{ ok:true, summary:"Follow-up sent to <recipients>." }`; `shareSlack` → `confirm:"always"` (outbound), `POST …/share-slack`; `generatePrep` → `POST /api/meetings/prep`, `confirm:"risky"`; `postCallConfirm` → `POST …/post-call`, `confirm:"risky"`; `approveIntel`/`dismissIntel` → `POST /api/call-intel/review { entityType, entityId, action }` via the second-caller helper (no pending proposal of that type → `{ ok:false, summary:"There's no pending <type> proposal on this meeting." }`).

### AC-SEQUENCES (headline: `sequences.launch`)
- **GIVEN** the user is on `/sequences/S` for a prepared campaign,
- **WHEN** `sequences.launch({ sequenceId:"S" })` runs,
- **THEN** because `outbound:true` + `confirm:"always"`, CLE-05 shows a confirm card (with a "Sends externally" badge) first; on approve, the same `POST /api/campaigns/S/launch` that `launchCampaign` fires (`[id]/page.tsx:163`) is sent and the result is `{ ok:true, summary:"Campaign launched — queued emails will send." }`,
- **AND** a server rejection → `{ ok:false, error }`.
- The rest of `/sequences`: `createCampaign` → `setShowWizard(true)` (`confirm:"never"`); `startProposed`/`resume`/`enrollResume`/`reviewBulkApprove`/`reviewApprove` → their outbound endpoints behind `confirm:"always"`; `pause`/`rejectProposed`/`enrollStop`/`reviewReject` → their state-only endpoints behind `confirm:"risky"`; `editStep` → `PATCH …/steps/:id` (`risky`); `deleteStep` → `DELETE …/steps/:id` behind `confirm:"always"` (no soft-delete, `reversible:false`); `enrollPause` → the enroll PUT (`risky`); `reviewEdit`/`wizardAdvance` → open the editor / flip the wizard step (`confirm:"never"`, **no send-bearing POST**).

### AC-TASKS (headline: `tasks.addTask`)
- **GIVEN** the user is on `/tasks`,
- **WHEN** `tasks.addTask({ title:"Call Marie Friday", priority:"high" })` runs (`confirm:"risky"`),
- **THEN** the same `POST /api/tasks { title, priority }` that `addTask` fires (`tasks/page.tsx:115`) is sent (the page defaults `priority:"medium"`; the action passes the supplied priority), the list refetches, and the result is `{ ok:true, summary:"Added task \"Call Marie Friday\"." }`,
- **AND** an empty `title` is rejected at the schema/run boundary (mirrors `if (!newTask.trim()) return`, `:116`) → `{ ok:false, error }`, no POST.
- The rest: `toggleComplete` → `PATCH /api/tasks/:id { status }` (`risky`; unknown `taskId` not in the loaded list → `{ ok:false, error }`); `cyclePriority` → `PATCH { priority }` (`risky`); `setFilter`/`setSort` → the setters (`confirm:"never"`).

### AC-KNOWLEDGE (headline: `knowledge.addEntry`)
- **GIVEN** the user is on `/knowledge`,
- **WHEN** `knowledge.addEntry({ title:"Pricing policy", content:"…" })` runs (`confirm:"risky"`),
- **THEN** the same `POST /api/settings/knowledge { title, content, scope, category }` that `handleAddEntry` fires (`:53`) is sent, the list refetches, and the result is `{ ok:true, summary:"Added knowledge entry \"Pricing policy\"." }`,
- **AND** an empty `title`/`content` is rejected → `{ ok:false, error }`, no POST.
- The rest: `saveEntry` → `PUT /api/settings/knowledge` (`risky`); `deleteEntry` → `confirm:"always"` (hard delete, `reversible:false`), `DELETE …?id=…`; `search` → `setQuery` (`confirm:"never"`).

### AC-PROPOSALS (headline: `proposals.draftFromDeal`)
- **GIVEN** the user is on `/proposals` with a template `T` selected,
- **WHEN** `proposals.draftFromDeal({ templateId:"T", dealId:"D" })` runs (`confirm:"risky"`),
- **THEN** the same `POST /api/proposals/templates/T/fill { dealId:"D" }` that `runFill` fires (`:228`) is sent (mirroring the page's `if (!selected || !dealId.trim()) return` guard, `:229`), the filled proposal loads, and the result is `{ ok:true, summary:"Drafted a proposal from the deal." }`,
- **AND** an empty `dealId`, or no template selected, → `{ ok:false, error }`, no POST.
- The rest: `confirmMapping` → `PATCH /api/proposals/templates/:id { componentMap }` (`risky`); `editComponentMap` → `patchComponent` (client draft, `confirm:"never"`); `regenerateComponent` → `POST …/components/:cid/regenerate` (`risky`); `saveEdits` → `PATCH /api/proposals/:id { components }` (`risky`; no pending edits → `{ ok:false, summary:"No edits to save." }`, mirrors `if (!filled || Object.keys(edits).length === 0) return`, `:266`).
- **EXCLUDED here:** `openTemplateUpload` opens the picker only (X-3; the **required** human-bound test asserts no `POST /api/proposals/templates` fires from the action); `openDownload` navigates to the download URL only (X-4; never streams bytes).

### AC-HOME (headline: `home.replyNeedsYou`)
- **GIVEN** the user is on `/home` with a `kind:"reply"` "Needs you" todo `T`,
- **WHEN** `home.replyNeedsYou({ todoId:"T" })` runs,
- **THEN** the same composer the `onTodo` reply path opens (`up-next-view.tsx:99-107`, pre-filling `to`/`subject`/`contactId` from the todo) is opened, `confirm` is `never` (no send), and the result is `{ ok:true, summary:"Opened a reply to <subject>." }`; the **send** is the human's click,
- **AND** a `todoId` not in the loaded Needs-you list, or one that is not a `reply` kind, → `{ ok:false, error }`, no composer.
- The rest: `openItem` → `router.push(item.href)` (`confirm:"never"`; unknown id → `{ ok:false, error }`); `notALead` → `POST /api/contacts/:id/lead-feedback { isLead:false }` via the second-caller helper (`confirm:"risky"`; the row drops, mirroring `markNotALead`, `hot-inbounds-widget.tsx:68`).

### AC-SETTINGS (headline: `settings.setApprovalMode`)
- **GIVEN** the user is on `/settings/guardrails`,
- **WHEN** `settings.setApprovalMode({ mode:"review-each" })` runs (`confirm:"risky"`),
- **THEN** the same `PUT /api/settings/workspace { agentApprovalMode:"review-each" }` that `saveApprovalMode` fires (`:106`) is sent and the result is `{ ok:true, summary:"Approval mode set to review-each." }`,
- **AND** an unknown `mode` is rejected by the `z.enum` → `{ ok:false, error }`, no PUT.
- The rest (each on its own settings route, registered when that page is mounted): `updateNotificationPrefs` → `PUT /api/notifications/preferences` (`risky`); `editPipelineStages` → `PUT /api/settings/stages` (`risky`); `addSignal` → `POST /api/custom-signals` (`risky`); `updateWorkspaceName` → `PUT /api/settings/workspace { name }` (`risky`).
- **EXCLUDED:** no `settings.changePassword`/`enrollMfa`/`manageBilling` action exists (X-5/X-6/X-7); the **required** settings disjointness test asserts the registered settings ids are disjoint from `SETTINGS_EXCLUDED_IDS`.

### AC-EXCLUDE-MEETINGS — the recorder is never invocable (required boundary)
- **GIVEN** the user is on `/meetings/M`,
- **WHEN** the model emits `invokePageAction("meetings.record", …)` (or `startRecording`/`stopRecording`/`uploadTranscript`-as-submit),
- **THEN** because none of these ids is in the manifest, CLE-04's `invokePageAction` refuses with `{ error, availableActionIds }` — the mic is never opened, no transcript is uploaded by the agent,
- **AND** the model is taught it cannot operate the mic or choose a file; the human records / picks.

### AC-EXCLUDE-PROPOSALS — no upload-submit / no download-stream (required boundary)
- **GIVEN** the user is on `/proposals`,
- **WHEN** the model emits `invokePageAction("proposals.uploadTemplate", { file… })` or `invokePageAction("proposals.downloadPdf", …)` expecting bytes,
- **THEN** no such submitting/streaming action exists; `openTemplateUpload` only opens the picker (no `POST /api/proposals/templates` from the action) and `openDownload` only navigates to the download URL — neither reads or writes a file through the registry,
- **AND** the **required** disjointness test asserts the registered proposals ids are disjoint from `PROPOSALS_EXCLUDED_IDS` (`["proposals.uploadTemplate","proposals.submitTemplate","proposals.downloadPdf","proposals.download"]` — i.e. the *submitting/streaming* variants are absent; the *open/navigate* ones are the only file-adjacent ids).

### AC-OFFPAGE — an action invoked while NOT on its page degrades gracefully (all pages)
- **GIVEN** the user is **not** on page P, so P's actions are unregistered,
- **WHEN** the model emits `invokePageAction("<P>.<verb>", …)`,
- **THEN** CLE-04's tool refuses with `{ error, availableActionIds }` **or**, if a stale directive reaches the client, CLE-03's `runRegisteredAction` returns `{ ok:false, error:"action_not_registered" }` — never a crash, never an effect on a page that isn't mounted,
- **AND** the model falls back to the headless tools where one exists (per the CLE-04 heuristic): inbox→`suggestEmailReply`/`bookMeeting` tools; meetings→meeting read tools; sequences→`createSequence`/`updateSequence`/enroll tools; tasks→`createTask`/`updateTask`; knowledge→the knowledge tool; settings→the settings update tools.

### AC-NODUP — no handler logic is duplicated (all pages)
- **GIVEN** the implementation,
- **WHEN** the code is reviewed,
- **THEN** every `run` body calls an **existing** page function, sub-component handler (via a `useImperativeHandle` lift), state setter, or a **second caller of the same REST contract** (the call-intel/lead-feedback seam) — no second copy of a fetch URL, body shape, optimistic update, or rollback exists for the agent path,
- **AND** any minimal refactor to make a handler callable with explicit args is a **pure extraction** (same body, params instead of closure state) or an **imperative-handle lift**, verified to leave the button/setter/checkbox behaviour byte-identical (design §per-page §"lifts/extractions").

---

## 5. Edge cases (each needs a test)

| # | Edge case | Required behaviour |
|---|---|---|
| E-1 | **Id not for the open/loaded entity** (detail/list actions) | `meetings.*` compare `meetingId` to `useParams().id`; `sequences.editStep`/etc. compare `sequenceId` to the open sequence; `inbox.*`/`tasks.*`/`home.*` resolve `conversationKey`/`taskId`/`todoId` against the loaded list. Mismatch / not found → `{ ok:false, error:"That <entity> is not <the one open / in the current list>." }`, no network. |
| E-2 | **Enum param out of range** | `inbox.setLane`/`setOutboundFilter`, `tasks.setFilter`/`setSort`, `settings.setApprovalMode`, `meetings.editNotesSection.section`, `sequences.wizardAdvance.to`, `proposals.openDownload.format` are `z.enum`s; an unknown value is rejected before `run` → `{ ok:false, error }`, no effect. |
| E-3 | **Outbound action with the test-mode kill-switch / guardrails** | `sequences.launch`/`startProposed`/`resume`/`enrollResume`/`reviewBulkApprove`/`reviewApprove` and `meetings.sendFollowUp`/`shareSlack` route through their existing endpoints, which already honour `OUTBOUND_TEST_MODE` + the send guardrails. The action adds **no** new outbound path; a guardrail block surfaces as `{ ok:false, error:<server message> }`. (Hardening is CLE-13, not here.) |
| E-4 | **File picker — agent attempts to also supply a file** (`proposals.openTemplateUpload`) | The `params` schema has **no** file/path field; there is no registry path to pass bytes. `run` only `fileRef.current?.click()`s. `onUpload`/`POST /api/proposals/templates` runs **only** on the human's `<input> onChange` (X-3, the required test). |
| E-5 | **Download — agent attempts to read bytes** (`proposals.openDownload`) | The action emits a `navigate` directive to the download URL (`/api/proposals/:id/download[?as=pdf]`); it does **not** fetch or return the file. The browser performs the download for the human (X-4). |
| E-6 | **Recorder / security / billing invoked** | No such action exists; CLE-04 unknown-id refusal (AC-EXCLUDE-*). Never a mic open, never a password change, never a charge. |
| E-7 | **Action invoked while NOT on the page** | Graceful refusal (AC-OFFPAGE). No throw, no effect. |
| E-8 | **No prepared draft** (`inbox.consumeDraft`) | If `detail.preparedDraft` is null, the action falls back to the AI-suggest path the Reply button uses (the page's own behaviour, `_conversation-pane.tsx:152-177`) and the summary says it drafted a fresh reply (not "consumed a prepared one"). No crash. |
| E-9 | **No pending intel proposal** (`meetings.approveIntel`/`dismissIntel`) | The review endpoint is idempotent; if `data` shows nothing pending of that `entityType`, → `{ ok:false, summary:"There's no pending <type> proposal on this meeting." }` (the page reads the meeting's intel shape to know — design §B.4). |
| E-10 | **Wizard send-bearing buttons** (`sequences.wizardAdvance`) | `wizardAdvance` flips `step` only; it never calls `approveAll`/the wizard `launchCampaign` (X-10). Advancing **to** `launch` shows the panel; it does not send. |
| E-11 | **`editPipelineStages` partial list** | The page's model is "replace the whole stage list in one PUT" (`saveStages`, `stages/page.tsx:53`). The action mirrors that: it sends the supplied `stages` array as the full list. The model is taught to read the current stages (headless) first and send the complete intended set, not a single stage (design §H). |
| E-12 | **Re-entrancy / in-flight** | Actions that mirror a page guard re-use it: `tasks.addTask` (`!newTask.trim()`), `proposals.saveEdits` (`!filled || no edits`), `proposals.draftFromDeal` (`!selected`). A second invoke while a fetch is in flight resolves on the live ref state (no stale snapshot), exactly as a second human click would. |
| E-13 | **Optimistic state + page unmount mid-run** | Each page owns its setters; if the user navigates away mid-`run`, the in-flight fetch settles (CLE-03 E-3 — the dock owns the promise) and the result still round-trips; a now-unmounted setter is a no-op React warning at worst, not a crash. Reversible actions re-sync on next mount. |

---

## 6. Out of scope

- **The PAR framework itself** (directive, registry, hook, executor, confirm card, server tools, `decideAction`, prompt) → CLE-03/04/05/10. CLE-14 only *calls* `useRegisterPageActions` and maps `run`s.
- **Audit-log / undo** for these mutating/outbound actions (`tool_call_events`, the outbound undo window for `sendFollowUp`/`launch`/`reviewApprove`) → CLE-11. CLE-14 declares `reversible`/`outbound` honestly; the undo *mechanism* (esp. the cancellable-send window for the sequence/meeting sends) is CLE-11.
- **Permission matrix** beyond what `decideAction` already enforces (viewer cannot mutate/outbound; viewer can still drive the `confirm:"never"` view/open actions) → CLE-12.
- **Send-guardrail hardening** for the outbound actions (sending-identity, opt-out, TZ windows) → CLE-13. CLE-14 routes outbound actions through `decideAction` (outbound → confirm) and the existing endpoint guardrails; it adds no new outbound guard.
- **Post-action highlight** of the triaged conversation / saved note / launched sequence ("narrate+actuate") → CLE-15. CLE-14's effects are visible because they drive the real handlers; the deliberate *highlight* is CLE-15.
- **The HUMAN-BOUND / DEVICE-BOUND flows (§3, X-1..X-10)** — permanently human-bound per README §2. No future CLE re-declares the recorder mic-capture, the file-byte upload, the file-byte download, the security actions, the billing/payment, or the wizard send-buttons as agent-executable. (The open-only `proposals.openTemplateUpload` and navigate-only `proposals.openDownload` are the *safe edges* of those boundaries, registered deliberately.)
- **The complex/multi-step settings editors** (ICP/criteria `settings/icp`, sending-infrastructure provider OAuth, data-model/objects/workflows/plays schema editors) — **deferred**. They are multi-field, multi-step, or async-poll flows whose single-handler reuse is not clean; registering them is a follow-up (a "CLE-14b" if wanted), not part of this safe-config-write sweep. The agent uses the existing **headless** settings update tools for these.
- **Per-row / per-stage micro-affordances with no endpoint** — e.g. the stages page's client-only `addStage`/`removeStage`/`updateStage` `useState` ops (`stages/page.tsx:45-51`, committed only by `saveStages`) are not separate actions; `settings.editPipelineStages` is the one committing action. The signals **delete** (not exposed in the UI yet, `signals/page.tsx:29`) is not registered.
- **Bulk / cross-page operations stay headless** (README §3.6): "triage every conversation older than a week", "launch all proposed sequences", "delete all completed tasks across the workspace" are mass/cross-view ops the model routes to **headless** tools, not to these page actions which act on the *currently loaded* page.

---

## 7. Execution: one branch or split per page

**This can be a larger branch.** All ten page clusters share one proven shape (declare a `useMemo([], [])` of `PageAction`s, register via `useRegisterPageActions`, reuse handlers via direct call / pure extraction / `useImperativeHandle` lift / second-REST-caller). They are **mutually independent** (no page imports another's actions). So CLE-14 is **executable as one branch** `feat/CLE-14-register-remaining-pages`.

**Recommended: split per page in execution** (one PR per page, or per small group), for three reasons proven by the M1 sweep: (a) each page has its own test file and its own eval (Phase 6 is hostile per-page); (b) a failure on one page (e.g. a tricky handler-lift on sequences) must not block shipping the trivially-safe ones (tasks, knowledge); (c) reviewer load — eight pages of handler-mapping in one diff is hard to review against the no-duplication rule. `tasks.md` is **grouped by page** precisely so it can be cut into per-page branches: do the trivial pages first (tasks, knowledge, home, settings), then inbox, then meetings (recorder/upload boundary), then proposals (upload/download boundary), then sequences (the densest: enroll controls + review queue + wizard). The final report recommends **split per page** (see §recommendation).

---

## 8. Evaluation steps (Phase 6, hostile QA — read literally)

Unit/RTL tests prove each `run → effect` without a live server (mock `fetch`, spy the existing handler/setter or the lifted ref). One Playwright-style live check per page-group proves the headline loop and the boundaries.

1. **Per-page manifest membership + metadata (unit/RTL).** For each page, mount it; assert the manifest lists exactly its `<page>.*` ids with the §2 metadata (spot-assert the load-bearing scalars: `inbox.triageDone.confirm==="risky"`, `inbox.selectConversation.mutating===false`; `meetings.sendFollowUp.outbound===true`+`confirm==="always"`, `meetings.editNotesSection.confirm==="risky"`; `sequences.launch.outbound===true`+`confirm==="always"`, `sequences.deleteStep.confirm==="always"`+`reversible===false`, `sequences.createCampaign.mutating===false`; `tasks.addTask.confirm==="risky"`, `tasks.setFilter.confirm==="never"`; `knowledge.deleteEntry.confirm==="always"`; `proposals.draftFromDeal.confirm==="risky"`, `proposals.editComponentMap.mutating===false`; `home.openItem.mutating===false`, `home.notALead.confirm==="risky"`; `settings.setApprovalMode.confirm==="risky"`). Assert the EXCLUDED ids are absent. (AC-0.)
2. **Inbox (unit).** `triageDone`/`snooze`/`reopen` → one `POST /api/inbox/triage` with the right `action`; `selectConversation`/`setLane`/`switchMailbox` → the setters, `confirm:"never"`; `reply`/`consumeDraft` → composer opens, no send (consumeDraft with/without prepared draft, E-8); `bookMeeting` → scheduler opens; `stopSequence` → enroll PUT (no enrollment → `ok:false`); `setOutboundFilter` → `setFilter`. (AC-INBOX / E-1/E-2/E-8.)
3. **Meetings (unit).** `editNotesSection` for each of the four sections → the matching `PATCH …/notes` payload; `sendFollowUp`/`shareSlack` → `confirm:"always"`, their POSTs; `generatePrep`/`postCallConfirm` → their POSTs; `approveIntel`/`dismissIntel` → `POST /api/call-intel/review` with `action`, no-pending → `ok:false` (E-9); wrong `meetingId` → `ok:false` (E-1). (AC-MEETINGS.)
4. **Meetings boundary — REQUIRED named test.** Assert the registered `meetings.*` id set is **disjoint** from `MEETINGS_EXCLUDED_IDS` (`["meetings.record","meetings.startRecording","meetings.stopRecording","meetings.uploadTranscript","meetings.submitTranscript"]`); assert no `run` references `_meeting-recorder`'s `start`/`stop` or `handleFileUpload`. (AC-EXCLUDE-MEETINGS.)
5. **Sequences (unit).** `createCampaign` → `setShowWizard(true)`; `startProposed`/`resume`/`enrollResume` → their PUTs behind `confirm:"always"`; `pause`/`rejectProposed`/`enrollStop` → state-only PUTs (`risky`); `editStep` → `PATCH …/steps/:id`; `deleteStep` → `confirm:"always"`+`DELETE`; `launch` → `confirm:"always"`+`POST …/launch`; `reviewBulkApprove`/`reviewApprove` → outbound POSTs (`confirm:"always"`); `reviewReject` → `POST …/reject` (`risky`); `reviewEdit`/`wizardAdvance` → open-only, **assert no send-bearing POST fires** (E-10). (AC-SEQUENCES / E-10.)
6. **Tasks (unit).** `addTask` → `POST /api/tasks` (empty title → no POST); `toggleComplete`/`cyclePriority` → `PATCH /api/tasks/:id`; `setFilter`/`setSort` → setters. (AC-TASKS.)
7. **Knowledge (unit).** `addEntry` → `POST`; `saveEntry` → `PUT`; `deleteEntry` → `confirm:"always"`+`DELETE`; `search` → `setQuery`. (AC-KNOWLEDGE.)
8. **Proposals (unit) + the upload/download boundary — REQUIRED named test.** `draftFromDeal` → `POST …/fill` (empty dealId / no template → no POST); `confirmMapping` → `PATCH …/templates/:id`; `editComponentMap` → `patchComponent` (no network); `regenerateComponent` → `POST …/regenerate`; `saveEdits` → `PATCH …/:id` (no edits → `ok:false`, E-12). **Then:** spy `fileRef.current.click` and `global.fetch`; run `proposals.openTemplateUpload()` → assert `click()` once, **`POST /api/proposals/templates` NEVER called** (X-3/E-4); run `proposals.openDownload({proposalId,format:"pdf"})` → assert a `navigate` directive to `/api/proposals/:id/download?as=pdf`, **no `fetch` of the file** (X-4/E-5); assert the registered proposals id set is **disjoint** from `PROPOSALS_EXCLUDED_IDS`. (AC-PROPOSALS / AC-EXCLUDE-PROPOSALS.)
9. **Home (unit).** `replyNeedsYou` → composer opens for a reply todo (non-reply / unknown id → `ok:false`); `openItem` → `router.push(href)`; `notALead` → `POST /api/contacts/:id/lead-feedback { isLead:false }` via the helper. (AC-HOME.)
10. **Settings (unit) + the security/money boundary — REQUIRED named test.** `setApprovalMode` → `PUT /api/settings/workspace { agentApprovalMode }` (bad enum → no PUT); `updateNotificationPrefs` → `PUT /api/notifications/preferences`; `editPipelineStages` → `PUT /api/settings/stages`; `addSignal` → `POST /api/custom-signals`; `updateWorkspaceName` → `PUT { name }`. **Then** assert the registered `settings.*` id set is **disjoint** from `SETTINGS_EXCLUDED_IDS` (`["settings.changePassword","settings.enrollMfa","settings.disableMfa","settings.manageBilling","settings.upgradePlan","settings.updatePayment"]`); assert no `run` references the security/billing handlers. (AC-SETTINGS / AC-EXCLUDE-SETTINGS.)
11. **No-duplication review (manual + grep), per page.** For each page, grep the reused fetch URLs (inbox triage/consume/enroll; meetings notes/send-follow-up/share-slack/post-call/prep/call-intel-review; sequences PUT/PATCH/DELETE/launch/drafts; tasks; knowledge; proposals fill/templates/regenerate/components; home lead-feedback; settings workspace/notifications/stages/custom-signals) — each must appear **once** (or in one shared lifted helper / second-REST-caller), used by both the button/setter and the `run`. Any second copy of a body shape = FAIL. (AC-NODUP.)
12. **Off-page degradation (unit/RTL), per page.** Unmount the page; assert its ids are gone from the manifest and `runRegisteredAction("<page>.<verb>",…)` returns `action_not_registered`. (AC-OFFPAGE / E-7.)
13. **Live loop (Playwright-style), per page-group.** On the real pages with the dock open: **inbox** — "mark this done" (triage), "draft a reply" (composer opens), "book a meeting" (scheduler opens); **meetings** — "tighten the summary" (notes save), "send the follow-up" (confirm card → send), and **"record the meeting"** → observe the agent **refuse** and say the human records; **sequences** — "launch it" (confirm card), "approve all drafts" (confirm card), "delete step 2" (destructive confirm); **tasks/knowledge** — add/toggle/delete; **proposals** — "draft from the Acme deal", and **"import this template"** → observe the **OS file dialog open** (nothing uploads), **"download the PDF"** → observe the browser download (agent did not read bytes); **home** — "reply to the first item", "not a lead"; **settings** — "set approval mode to review each", and **"change my password"** → observe the agent **refuse** and point to Settings → Security. Screenshot before/after into `_research/raw/cle-14/<page>/` (CLAUDE.md screenshot rule).
14. **Regression.** `pnpm tsc --noEmit` → 0 errors. `regression.sh` → green. CLE-03/04/05/06/07/08/09 tests untouched and green. Every touched page's existing behaviour (triage/reply/book/stop-seq; notes/send/share/prep/intel + **the recorder + transcript upload**; sequence start/pause/launch/steps/enroll/review + **the wizard send buttons**; task add/toggle/priority; knowledge add/save/delete; proposal fill/mapping/regenerate/save + **the upload + download**; home reply/open/not-a-lead; settings approval/notifications/stages/signals/workspace + **security + billing**) is byte-identical when used by hand (the extractions/lifts preserved it).

**Hard thresholds:** AC-0 + every per-page AC pass; every edge case E-1..E-13 has a passing test; the **four required** named tests pass (meetings recorder/upload disjointness; proposals upload/download disjointness; settings security/money disjointness; one no-duplication review per page); `tsc` 0 errors; no handler logic duplicated; the recorder, the file pickers, the downloads, the security/billing surfaces, and the wizard send-buttons are completely untouched and still work by hand; every page's manual UX unchanged. Any miss = FAIL → delete the (per-page) branch → respec.
