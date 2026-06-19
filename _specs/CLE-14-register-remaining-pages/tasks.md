# CLE-14 — Register the remaining workhorse pages (the parity SWEEP) — Tasks

> Branch: `feat/CLE-14-register-remaining-pages` (off `main`; depends on **CLE-06 + CLE-07 + CLE-08 + CLE-09** being merged — they provide the proven patterns this sweep reuses; and on **CLE-03 + CLE-04 + CLE-05** being present — they provide `useRegisterPageActions`, `PageAction`/`PageActionResult`, `runRegisteredAction`, `invokePageAction`/`listPageActions`, `decideAction`, the confirm card, the `navigate`/`composeEmail` directives).
> Commit trailer (CLAUDE.md): `Co-Authored-By: Rippletide <admin@rippletide.com>`.
> All paths under `app/apps/web/`. **Grouped by page so it can be cut into per-page branches** (see §"Execution"). Within a page: pure extractions / imperative-handle lifts first (so handlers are callable with explicit args / from the page without duplication), then declare + register the actions, then the page's test. A task is "done" only when its verify passes and its test is written + green. **Reuse existing handlers — never duplicate their logic** (AC-NODUP); reuse seams are: direct call / pure `useCallback` extraction / `useImperativeHandle` lift / second caller of the same REST contract (design §0).

---

## Group 0 — Shared scaffolding (do once, before any page)

### Task 0.1 — Confirm the CLE-03/04/05 surface + the proven patterns are on the base
- **Action:** Verify the branch base has `@/lib/chat/page-actions/{types,registry}` exporting `PageAction`, `PageActionResult`, `useRegisterPageActions`, `getActionManifest`, `runRegisteredAction`; that CLE-04 `invokePageAction`/`listPageActions`/`decideAction` are wired; that CLE-05's confirm card renders on `requireConfirm`; and re-read CLE-06 §3.1 (the `useMemo([], [])` + ref pattern), CLE-08 §1.2/§2 (second-REST-caller + file-picker boundary), CLE-09 §2/§4 (disjointness-test + `useImperativeHandle` lift).
- **Verify:** `pnpm tsc --noEmit` clean on the untouched base; the four prior page specs' tests are green (`opportunities-actions.*`, `accounts-actions.*`, `contacts-actions.*`, `callmode-actions.*`).
- **Test:** none (gate). If the base is missing any of the above → stop; CLE-14 cannot start.

---

## Group A — `/inbox` (design §A)

### Task A.1 — Lift the conversation-pane + outbound-table handlers
- **Action:** In `inbox/_conversation-pane.tsx`, add an `apiRef` prop and `useImperativeHandle(apiRef, () => ({ openReply, bookMeeting: () => setSchedOpen(true), stopSequence }))` (exposing the existing `openReply` `:132`, `setSchedOpen` `:80`, `stopSequence` `:195` — `stopSequence` returns `{ ok, error? }`, reporting "no active sequence" when `detail.enrollment` is null). In `inbox/_outbound-table.tsx`, add `apiRef` + `useImperativeHandle(apiRef, () => ({ setFilter }))` (`:46`). Pass `apiRef={paneApiRef}` / `apiRef={outboundApiRef}` from `inbox/page.tsx`. The children's own buttons keep calling the same fns (design §A.2).
- **Verify:** `pnpm tsc --noEmit` clean. By hand, the pane's Reply/Book/Stop buttons and the outbound filter buttons behave byte-identically (the lift exposes, does not change).
- **Test:** started in `inbox-actions.test.tsx` (completed Task A.3) — mount the pane with a fixture `detail`, call `paneApiRef.current.openReply()`, assert the same composer-open / suggest-reply fetch the Reply button fires.

### Task A.2 — (covered in A.1) confirm reply/draft stay open-only
- **Action:** Confirm `inbox.reply`/`consumeDraft` only open the **local** composer (`_conversation-pane.tsx` owns `composer`) and never send; `consumeDraft` uses `detail.preparedDraft` when present, else the AI-suggest fallback (E-8). No agent-send action is added.
- **Verify:** grep `inbox/` for `composeEmail` directive usage in the action path — none (the composer is local). The `POST …/consume` (`handleSent`, `:188`) fires only on the human Send.
- **Test:** in `inbox-actions.test.tsx` (Task A.3) — `reply`/`consumeDraft` assert `mutating:false`, composer opened, **no send fetch**.

### Task A.3 — Declare + register `inboxActions`, write the inbox test
- **Action:** In `inbox/page.tsx`, add the refs (`selectedKeyRef`, `conversationsRef`, `paneApiRef`, `outboundApiRef`) and the `inboxActions: PageAction[]` `useMemo([], [])` exactly as design §A.3 (11 actions). Add `useRegisterPageActions(inboxActions)` at top level, **above** the `:256-271` early returns. Import the CLE-03 types + hook + `z`.
- **Verify:** `pnpm tsc --noEmit` clean. The id set is stable (refs, not values, in `run`). `triageDone`/`snooze`/`reopen` route to `handleTriage` with the right `action`; `snooze` rejects a past/invalid `until`.
- **Test:** `src/__tests__/inbox-actions.test.tsx` — manifest membership + metadata (AC-0: `triageDone.confirm==="risky"`, `selectConversation.mutating===false`, `reply.cost==="credits"`+`confirm==="never"`); `triageDone`/`snooze`/`reopen` → one `/api/inbox/triage` POST with the right action (snooze past time → no POST, E-2); `selectConversation`/`setLane`/`switchMailbox` → setters (unknown key → `ok:false`, E-1); `reply`/`consumeDraft` → composer open, no send (E-8 fallback); `bookMeeting` → scheduler open; `stopSequence` → enroll PUT (no enrollment → `ok:false`); `setOutboundFilter` → `setFilter`; off-page degradation (unmount → ids gone + `action_not_registered`). (AC-INBOX / AC-0 / AC-OFFPAGE.)

---

## Group B — `/meetings/[id]` (design §B) — carries the recorder/upload exclusion

### Task B.1 — Extract the notes-PATCH dispatcher + the prep POST
- **Action:** In `meetings/[id]/page.tsx`, lift the shared `PATCH /api/meetings/:id/notes` body out of `saveSummary`/`saveKeyPoints`/`saveDecisions`/`saveFollowUpDraft` (`:303,320,339,356`) into one `useCallback patchNotes(partial)`; rewire each save handler to build its `partial` from state and call `patchNotes` (design §B.3). Add `sectionToPartial(section, value)`. Extract the inline prep POST (`:1093`) into `generatePrepResult()` (design §B.1). `sendFollowUp`/`shareToSlack`/`triggerPostCall` are page-scope already → no extraction (the `run`s call them directly; ensure they return/throw consistently so the `run` can map to `{ok,error}`).
- **Verify:** `pnpm tsc --noEmit` clean. Grep: `/api/meetings/${...}/notes` PATCH appears **once** (in `patchNotes`); `/api/meetings/prep` once. By hand, the four notes editors + the prep button behave identically.
- **Test:** started in `meetings-actions.test.tsx` (completed Task B.4).

### Task B.2 — Add the intel-review second caller
- **Action:** Add the page-level `reviewMeetingIntel(entityType, entityId, action)` `useCallback` posting to the **same** `/api/call-intel/review` the intel cards post to (design §B.4), and a `hasPendingIntel(data, entityType)` predicate reading the meeting's intel shape (E-9). The cards keep their own buttons — this is a second caller of the same REST contract, not a duplication.
- **Verify:** `pnpm tsc --noEmit` clean. Grep: the action path posts to `/api/call-intel/review` with the same `{ entityType, entityId, action }` body the cards send.
- **Test:** in `meetings-actions.test.tsx` — `approveIntel`/`dismissIntel` → `POST /api/call-intel/review` with `action`; no-pending → `ok:false` (E-9).

### Task B.3 — Add the EXCLUSION set + the required boundary test
- **Action:** Add the co-located `export const MEETINGS_EXCLUDED_IDS = ["meetings.record","meetings.startRecording","meetings.stopRecording","meetings.uploadTranscript","meetings.submitTranscript"] as const;` with the doc comment (design §B.2). Do **not** register any of them. (No open-only transcript action in v1 — the agent navigates to `/meetings/upload`; documented alternative noted.)
- **Verify:** grep the meetings actions file: none of `MEETINGS_EXCLUDED_IDS` appears as a declared `id`; no `run` references `_meeting-recorder`'s `start`/`stop`/`getUserMedia` or `handleFileUpload` (`:229`).
- **Test:** `src/__tests__/meetings-actions.boundary.test.ts` — **REQUIRED named test**: assert the registered `meetings.*` id set is **disjoint** from `MEETINGS_EXCLUDED_IDS`; static/grep assertion that no `run` body references the recorder or the upload handler. (AC-EXCLUDE-MEETINGS.)

### Task B.4 — Declare + register `meetingActions`, write the meetings test
- **Action:** In `meetings/[id]/page.tsx`, add `meetingIdRef`/`dataRef` and the `meetingActions: PageAction[]` `useMemo` (7 actions) per design §B.5. Add `useRegisterPageActions(meetingActions)` at top level, **above** the `:437-453` early returns.
- **Verify:** `pnpm tsc --noEmit` clean. `editNotesSection` routes each `section` to the right payload key; `sendFollowUp`/`shareSlack` are `outbound:true`+`confirm:"always"`; wrong `meetingId` → `ok:false`.
- **Test:** `src/__tests__/meetings-actions.test.tsx` — manifest + metadata (AC-0: `editNotesSection.confirm==="risky"`, `sendFollowUp.outbound===true`+`confirm==="always"`, `shareSlack.outbound===true`+`confirm==="always"`); `editNotesSection` for all four sections → the matching `/notes` PATCH (wrong meetingId → no PATCH, E-1); `sendFollowUp`/`shareSlack`/`generatePrep`/`postCallConfirm` → their POSTs; `approveIntel`/`dismissIntel` → review POST (no-pending → `ok:false`, E-9); off-page degradation. (AC-MEETINGS / AC-0 / AC-OFFPAGE.)

---

## Group C — `/sequences` (+ `[id]`, `review`, wizard) (design §C) — densest; carries the wizard send-button exclusion

### Task C.1 — Extract the detail-page handlers (status, step, enroll)
- **Action:** In `sequences/[id]/page.tsx`: extract `toggleStatus()` (`:146`) into `setSequenceStatus(status)` (so the action chooses paused vs active explicitly); extract `saveStep()` (`:212`) into `saveStepFields(stepId, fields)`; **collapse the three inline enroll PUTs** (`:599,611,623`) into one `setEnrollmentStatus(enrollmentId, status)` `useCallback` that the three buttons **and** the three actions call (design §C.2 — a no-duplication win). `deleteStep` (`:245`) and `launchCampaign` (`:163`) are page-scope → direct.
- **Verify:** `pnpm tsc --noEmit` clean. Grep: the `/enroll` PUT appears **once** (in `setEnrollmentStatus`); `/steps/:id` PATCH once; `/campaigns/:id/launch` once. By hand, the header pause/resume, the step edit/delete, and the three enroll buttons behave identically.
- **Test:** started in `sequences-actions.test.tsx` (Task C.5).

### Task C.2 — Extract the review-page handlers
- **Action:** In `sequences/review/page.tsx`: extract `handleBulkApprove()` (`:151`) → `bulkApproveDrafts(ids)`; `handleApprove()` (`:201`) → `approveDraft(id, version)`; `submitReject()` (`:229`) → `rejectDraft(id, body)`. Add an `openDraftEditor(draftId)` thin opener for `reviewEdit` (selects the draft so `SequenceDraftPreview` shows its editor; the save stays the child's `onEditSaved`, `:387-391`).
- **Verify:** `pnpm tsc --noEmit` clean. Grep: `bulk-approve`, `/approve`, `/reject` each appear once. By hand, the review queue's bulk-approve / approve / reject / edit behave identically.
- **Test:** in `sequences-actions.test.tsx`.

### Task C.3 — Lift the wizard step navigation + add the EXCLUSION set + required boundary test
- **Action:** In `components/campaign-wizard.tsx`, add `apiRef` + `useImperativeHandle(apiRef, () => ({ goToStep: (s) => setStep(s) }))` (`:91,94`). Pass `apiRef={wizardApiRef}` from `sequences/page.tsx`. Add `export const SEQUENCES_WIZARD_EXCLUDED_IDS = ["sequences.wizardApproveAll","sequences.wizardLaunch","sequences.wizardSend"] as const;` with the doc comment (design §C.5). `sequences.wizardAdvance` calls only `goToStep`; it **never** calls `approveAll` (`:270`) or the wizard `launchCampaign` (`:281`).
- **Verify:** `pnpm tsc --noEmit` clean. Grep the sequences actions: `wizardAdvance.run` references only `goToStep`/`setStep`; no reference to `approveAll` or the wizard's `launchCampaign`.
- **Test:** `src/__tests__/sequences-actions.boundary.test.ts` — **REQUIRED named test**: assert the registered `sequences.*` id set is **disjoint** from `SEQUENCES_WIZARD_EXCLUDED_IDS`; assert `wizardAdvance` to `launch` flips the step but fires **no** send-bearing POST (E-10). (AC-SEQUENCES boundary / X-10.)

### Task C.4 — Declare + register the three sequence action sets
- **Action:** Register `seqListActions` in `sequences/page.tsx` (`createCampaign`/`startProposed`/`rejectProposed`), `seqDetailActions` in `sequences/[id]/page.tsx` (`pause`/`resume`/`editStep`/`deleteStep`/`enrollPause`/`enrollResume`/`enrollStop`/`launch`, above the `:263` early returns), `reviewActions` in `sequences/review/page.tsx` (`reviewBulkApprove`/`reviewApprove`/`reviewReject`/`reviewEdit`), `wizActions` in `campaign-wizard.tsx` (`wizardAdvance`) — exactly as design §C.7. Each on its own page (surface scoping).
- **Verify:** `pnpm tsc --noEmit` clean. The outbound set (`startProposed`/`resume`/`enrollResume`/`launch`/`reviewBulkApprove`/`reviewApprove`) is `outbound:true`+`confirm:"always"`; `deleteStep` is `confirm:"always"`+`reversible:false`; `createCampaign`/`reviewEdit`/`wizardAdvance` are `confirm:"never"`.
- **Test:** in `sequences-actions.test.tsx` (Task C.5).

### Task C.5 — Write the sequences test
- **Test:** `src/__tests__/sequences-actions.test.tsx` — per-route manifest membership + metadata (AC-0: `launch.outbound===true`+`confirm==="always"`, `deleteStep.confirm==="always"`+`reversible===false`, `createCampaign.mutating===false`); `createCampaign` → `setShowWizard(true)`; `startProposed`/`resume`/`enrollResume` → PUTs (`confirm:"always"`); `pause`/`rejectProposed`/`enrollStop` → state-only PUTs (`risky`); `editStep` → `/steps/:id` PATCH; `deleteStep` → `DELETE`; `launch` → `/campaigns/:id/launch`; `reviewBulkApprove`/`reviewApprove` → outbound POSTs; `reviewReject` → `/reject`; `reviewEdit`/`wizardAdvance` → open-only, **no send-bearing POST** (E-10); wrong `sequenceId` → `ok:false` (E-1); off-page degradation per route. (AC-SEQUENCES / AC-0 / AC-OFFPAGE.)

---

## Group D — `/tasks` (design §D)

### Task D.1 — Extract the task network bodies + declare/register + test
- **Action:** In `tasks/page.tsx`, extract `createTask(title, priority)` from `addTask` (`:115`), `setTaskStatus(taskId, status)` from `toggleTask` (`:130`), `setTaskPriority(taskId, priority)` from `cyclePriority` (`:144`) — each existing handler rewired to call its extraction. Add `tasksRef`. Declare `taskActions` (5 actions, design §D) and register at top level. `setFilterTab`/`setSortMode` are direct.
- **Verify:** `pnpm tsc --noEmit` clean. Grep: `POST /api/tasks` once, `PATCH /api/tasks/:id` once. `addTask` empty title → no POST; `cyclePriority` reads the live priority and advances per `PRIORITY_CYCLE` (`:28`).
- **Test:** `src/__tests__/tasks-actions.test.tsx` — manifest + metadata (AC-0: `addTask.confirm==="risky"`, `setFilter.confirm==="never"`); `addTask` → `POST /api/tasks` (empty title → no POST); `toggleComplete`/`cyclePriority` → `PATCH` (unknown taskId → `ok:false`, E-1); `setFilter`/`setSort` → setters; off-page degradation. (AC-TASKS.)

---

## Group E — `/knowledge` (design §E)

### Task E.1 — Extract the entry network bodies + declare/register + test
- **Action:** In `knowledge/page.tsx`, extract `createEntry(input)` from `handleAddEntry` (`:53`) and `saveEntryFields(id, fields)` from `handleSaveEntry` (`:78`); `handleDeleteEntry` (`:96`) is direct; `setQuery` direct. Declare `knowledgeActions` (4 actions, design §E) and register at top level.
- **Verify:** `pnpm tsc --noEmit` clean. Grep: `POST`/`PUT`/`DELETE /api/settings/knowledge` each once. `deleteEntry` is `confirm:"always"`+`reversible:false`.
- **Test:** `src/__tests__/knowledge-actions.test.tsx` — manifest + metadata (AC-0: `deleteEntry.confirm==="always"`); `addEntry` → `POST` (empty title/content → no POST); `saveEntry` → `PUT`; `deleteEntry` → `DELETE`; `search` → `setQuery`; off-page degradation. (AC-KNOWLEDGE.)

---

## Group F — `/proposals` (design §F) — carries the upload/download exclusion

### Task F.1 — Extract the fill/confirm-mapping bodies + add the EXCLUSION set + required boundary test
- **Action:** In `proposals/page.tsx`, extract `fillFromDeal(templateId, dealId)` from `runFill` (`:228`) and `confirmMapping(templateId, map)` from `confirmMap` (`:204`); `patchComponent`/`regenerateOne`/`saveEdits` are direct (with the page's own guards mirrored). Add the `export const PROPOSALS_EXCLUDED_IDS = ["proposals.uploadTemplate","proposals.submitTemplate","proposals.downloadPdf","proposals.download"] as const;` with the doc comment (design §F.2). Add refs `draftRef`/`filledRef`/`editsRef`.
- **Verify:** `pnpm tsc --noEmit` clean. Grep: `/fill` once, `/templates/:id` PATCH once. None of `PROPOSALS_EXCLUDED_IDS` appears as a declared `id`.
- **Test:** `src/__tests__/proposals-actions.boundary.test.ts` — **REQUIRED named test (part 1)**: assert the registered proposals id set is **disjoint** from `PROPOSALS_EXCLUDED_IDS` (the submitting/streaming variants are absent); assert no `run` references `onUpload` (`:149`) or builds `FormData`.

### Task F.2 — Add the two safe-edge actions (open-only upload, navigate-only download)
- **Action:** Declare `proposals.openTemplateUpload` (`run` = `fileRef.current?.click()`, `mutating:false`, `confirm:"never"` — the CLE-08 file-picker pattern) and `proposals.openDownload` (`{ proposalId, format? }`, `run` = `window.location.href = "/api/proposals/:id/download[?as=pdf]"`, `mutating:false`, `confirm:"never"` — navigate-only, reads no bytes) per design §F.3.
- **Verify:** `pnpm tsc --noEmit` clean. `openTemplateUpload.run` only clicks the existing `<input ref={fileRef}>` (`:356`); `openDownload.run` only navigates to the existing `<a href>` URL (`:589,598`) — neither fetches a file.
- **Test:** in `proposals-actions.boundary.test.ts` — **REQUIRED named test (part 2)**: spy `fileRef.current.click` + `global.fetch`; `openTemplateUpload()` → `click()` once, **`POST /api/proposals/templates` NEVER called** (X-3/E-4); `openDownload({proposalId,format:"pdf"})` → navigates to `/api/proposals/:id/download?as=pdf`, **no `fetch` of the file** (X-4/E-5). (AC-EXCLUDE-PROPOSALS.)

### Task F.3 — Declare + register `proposalActions`, write the proposals test
- **Action:** Declare `proposalActions` (5 core + 2 safe-edge, design §F.4) and register at top level.
- **Verify:** `pnpm tsc --noEmit` clean. `draftFromDeal` mirrors `!dealId.trim()`/`!selected`; `saveEdits` mirrors `!filled || no edits`.
- **Test:** `src/__tests__/proposals-actions.test.tsx` — manifest + metadata (AC-0: `draftFromDeal.confirm==="risky"`, `editComponentMap.mutating===false`, `openTemplateUpload.mutating===false`, `openDownload.mutating===false`); `draftFromDeal` → `/fill` (empty dealId / no template → no POST); `confirmMapping` → `/templates/:id` PATCH; `editComponentMap` → `patchComponent` (no network); `regenerateComponent` → `/regenerate`; `saveEdits` → `PATCH /:id` (no edits → `ok:false`, E-12); off-page degradation. (AC-PROPOSALS.)

---

## Group G — `/home` (design §G)

### Task G.1 — Lift UpNext + add the not-a-lead second caller + declare/register + test
- **Action:** In `components/up-next/up-next-view.tsx`, add `apiRef` + `useImperativeHandle(apiRef, () => ({ replyTo, openItem }))` exposing the existing `onTodo` reply path (`:99-107`) and `router.push(item.href)` (`:108,173`). Pass `apiRef={upNextApiRef}` from `home/page.tsx`. In `home/page.tsx`, add the second-caller `markNotALead(contactId)` `useCallback` posting `{ isLead:false }` to `/api/contacts/:id/lead-feedback` (the same contract `hot-inbounds-widget.tsx:68` posts; design §G.3). Declare `homeActions` (3 actions, design §G.4) and register at top level.
- **Verify:** `pnpm tsc --noEmit` clean. The widget + UpNext buttons behave identically (the lift exposes, the second caller duplicates no logic — same endpoint+body). Grep: the action path posts `{ isLead:false }` to `/api/contacts/:id/lead-feedback`.
- **Test:** `src/__tests__/home-actions.test.tsx` — manifest + metadata (AC-0: `openItem.mutating===false`, `notALead.confirm==="risky"`); `replyNeedsYou` → composer opens for a reply todo (non-reply / unknown id → `ok:false`); `openItem` → `router.push(href)` (unknown id → `ok:false`); `notALead` → `POST /api/contacts/:id/lead-feedback { isLead:false }`; off-page degradation. (AC-HOME.)

---

## Group H — `/settings/*` (design §H) — SAFE config writes only; carries the security/money exclusion

### Task H.1 — Extract the config-write bodies (where they read form state) + add the EXCLUSION set + required boundary test
- **Action:** In each safe settings page, expose the write with explicit args: `settings/guardrails/page.tsx` → `saveApprovalModeValue(mode)` (from `saveApprovalMode` `:106`); `settings/notifications/page.tsx` → `setNotificationPref(key, channel, enabled)` (from `toggle`/`save` `:81,72`); `settings/stages/page.tsx` → `saveStagesValue(stages)` (from `saveStages` `:53`); `settings/signals/page.tsx` → `createSignal(name, description)` (from `handleCreate` `:65`); `settings/workspace/page.tsx` → `saveWorkspaceName(name)` (from `saveName` `:49`). Add the co-located `export const SETTINGS_EXCLUDED_IDS = ["settings.changePassword","settings.enrollMfa","settings.disableMfa","settings.manageBilling","settings.upgradePlan","settings.updatePayment"] as const;` (in a shared `settings/_page-actions-excluded.ts` or co-located) with the doc comment (design §H.2). Register **nothing** that touches `settings/security/page.tsx` (`handleSubmit` `:27`, `<MfaCard>` `:156`) or `settings/billing/page.tsx` (`<BillingClient>`).
- **Verify:** `pnpm tsc --noEmit` clean. Grep across the settings actions: no `run` references `handleSubmit` (password), `MfaCard`, or `BillingClient`; none of `SETTINGS_EXCLUDED_IDS` is a declared `id`. Grep each reused endpoint appears once.
- **Test:** `src/__tests__/settings-actions.boundary.test.ts` — **REQUIRED named test**: assert each registered `settings.*` id is **disjoint** from `SETTINGS_EXCLUDED_IDS`; static/grep that no `run` references the security/billing handlers. (AC-EXCLUDE-SETTINGS.)

### Task H.2 — Declare + register the five settings actions, write the settings test
- **Action:** Register one or two actions on each safe route's page exactly as design §H.3: `settings.setApprovalMode` (guardrails), `settings.updateNotificationPrefs` (notifications), `settings.editPipelineStages` (stages — whole-list, E-11), `settings.addSignal` (signals — create-only), `settings.updateWorkspaceName` (workspace). Each `useRegisterPageActions` at top level of its route page.
- **Verify:** `pnpm tsc --noEmit` clean. All five are `mutating:true`+`confirm:"risky"`. `setApprovalMode` rejects an unknown `mode` (enum).
- **Test:** `src/__tests__/settings-actions.test.tsx` — manifest + metadata per route (AC-0: `setApprovalMode.confirm==="risky"`); `setApprovalMode` → `PUT /api/settings/workspace { agentApprovalMode }` (bad enum → no PUT, E-2); `updateNotificationPrefs` → `PUT /api/notifications/preferences`; `editPipelineStages` → `PUT /api/settings/stages` (whole list); `addSignal` → `POST /api/custom-signals`; `updateWorkspaceName` → `PUT { name }`; off-page degradation per route. (AC-SETTINGS.)

---

## Group Z — Cross-page gates (after the per-page groups)

### Task Z.1 — Per-page no-duplication review (grep, all pages)
- **Action:** For each page, grep the reused fetch URLs (Group lists above) and confirm each appears **once** (or in one shared extraction / lift / second-REST-caller), used by both the button/setter and the `run`. Special attention: the sequences enroll-PUT collapse (§C.1), the meetings notes-PATCH dispatcher (§B.3), the intel-review + lead-feedback second callers (one POST each, shared by card and action).
- **Verify:** every reused URL string appears once per file; no second copy of a body shape, optimistic update, or rollback for the agent path. Any second copy = FAIL (AC-NODUP).
- **Test:** the per-page dedup assertions in each test file (spy `global.fetch`; assert button-path and action-path issue the same URL+body) + this manual grep.

### Task Z.2 — Live verification per page-group (Playwright-style) + screenshots
- **Action:** Run the app (turbopack dev rig per memory `reference_worktree-verify-rig`/`reference_dev-session-mint`). Mint a session; open each page with the dock. Exercise the headline loops AND the boundaries (requirements §8 step 13): inbox triage/reply/book; meetings notes-save + send-follow-up (confirm card) + **"record the meeting" → refuse**; sequences launch (confirm) + approve-all (confirm) + delete-step (destructive confirm); tasks/knowledge add/toggle/delete; proposals draft + **"import this template" → OS dialog opens, nothing uploads** + **"download the PDF" → browser download, no bytes read by agent**; home reply/not-a-lead; settings set-approval-mode + **"change my password" → refuse, points to Settings → Security**. Screenshot before/after into `_research/raw/cle-14/<page>/`.
- **Verify:** each headline action visibly takes effect; each boundary visibly refuses / opens-only / navigates-only.
- **Test:** screenshots are the Phase-6 eval-step-13 artifact; note results in the sprint report.

### Task Z.3 — Full acceptance + regression sweep
- **Action:** Re-read every per-page AC + E-1..E-13; confirm the **four required** named tests pass (meetings recorder/upload disjointness B.3; sequences wizard-send disjointness C.3; proposals upload/download disjointness F.1+F.2; settings security/money disjointness H.1) and one no-duplication review per page. Run the whole CLE-14 test set + repo regression.
- **Verify:** `pnpm tsc --noEmit` → 0 errors. `pnpm vitest run` for the new files → all green. `bash regression.sh` → green. CLE-03/04/05/06/07/08/09 tests untouched and green. Grep all touched pages once more: no duplicated fetch body, no handler logic copied for the agent path; the recorder, file pickers, downloads, security/billing surfaces, and wizard send-buttons untouched and working by hand. No new runtime dependency in `apps/web/package.json`. No new API route added.
- **Test:** this task is the gate, not new code. Any AC/edge case lacking a test → add it before declaring done (CLAUDE.md: 100% tested, every bug → regression test).

---

## Execution: one branch or split per page (ordering + dependency notes)

- **Group 0 first** (the base check), then the page groups are **mutually independent** (no page imports another's actions). They can be done in any order and on separate branches.
- **Recommended order (trivial → tricky), if split per page:** D (tasks) → E (knowledge) → G (home) → H (settings) → A (inbox) → B (meetings, recorder/upload boundary) → F (proposals, upload/download boundary) → C (sequences, the densest: enroll collapse + review queue + wizard boundary). This front-loads the trivially-safe pages and isolates the three boundary-bearing pages (B/F/C) so a tricky lift on one cannot block shipping the others.
- **Within a page:** extractions/lifts (so handlers are callable without duplication) **before** declaring the actions; the boundary set + its disjointness test **before or with** the action declaration (so the tripwire exists from the first commit); the page test last.
- **CLE-05 interaction:** the `confirm:"risky"`/`"always"` actions reach CLE-05's card before `run`; the `confirm:"never"` actions (view setters, opens, navigate-only download, open-only upload, the home open/reply) run immediately. CLE-14 renders no card itself; it only declares the metadata that drives the gate.
- **CLE-11 (audit/undo):** these actions declare `reversible`/`outbound` honestly; the undo *mechanism* + the **cancellable-send window** for the outbound sends (`sendFollowUp`/`launch`/`startProposed`/`resume`/`enrollResume`/`reviewBulkApprove`/`reviewApprove`) is CLE-11 — out of scope here.
- **CLE-13 (outbound hardening):** the outbound actions reuse endpoints that already honour `OUTBOUND_TEST_MODE` + the send guardrails; CLE-14 adds no new outbound guard.
- **Bulk/cross-page ops stay headless** (README §3.6): "triage everything older than a week", "launch all proposed sequences", "delete all completed tasks" route to headless tools, not these page actions which act on the *currently loaded* page. The CLE-04 prompt heuristic already teaches this; CLE-14 adds nothing for it.
- **The recommendation to Martin (final report): split per page.** One PR per page (or per small group: tasks+knowledge+home+settings as a "trivial" PR; inbox; meetings; proposals; sequences). Reasons: per-page hostile eval (Phase 6), failure isolation (a tricky sequences lift must not block tasks), and reviewable diffs against the no-duplication rule.
