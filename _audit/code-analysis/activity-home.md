# Activity + Home cluster — code analysis

**Cluster:** ACTIVITY + HOME (orchestration layer)
**Scope:** "/" (Up next / Home), /cs/today, /meetings, /meetings/[id], /notes, /tasks, /insights, /insights/pilae, /insights/playbook, /insights/hot-to-call, /reports
**Audit date:** 2026-06-05

---

## How authenticated "/" is resolved

`middleware.ts:88-91` intercepts `pathname === "/"`: if the user is authenticated it issues a hard `NextResponse.redirect(new URL("/home", req.url))`. There is no root-level `page.tsx` under `(dashboard)` — the route `(dashboard)/home/page.tsx` is what renders when the browser lands on `/home`. The sidebar (`sidebar.tsx:71`) labels the link "Up next" and targets `href: "/"`, which the middleware immediately 302s to `/home`. Result: the user always sees `(dashboard)/home/page.tsx` as the home screen.

---

## Per-route analysis

### Home (Up next) — route `/` → `/home`

- **Purpose:** Daily priority orchestrator — surfaces AI actions, hot contacts, deals at risk, meetings, tasks, plus contextual onboarding and scaling prompts.
- **Reads (data in):**
  - Primary: `GET /api/home/hydrate` (single fan-out endpoint, `home/page.tsx:209`). Falls back to six individual calls (`/api/onboarding/status`, `/api/dashboard/summary`, `/api/actions`, `/api/insights`, `/api/priorities`, `/api/recommendations`) when hydrate fails (`home/page.tsx:240-269`).
  - Secondary (independent): `GET /api/deals/at-risk` inside `DealsAtRiskSection` (`home/page.tsx:1045`).
  - Query params consumed: `?firstTime=true` (welcome banner + TAMRevealNotification), `?scalingPath=cold-on-primary-blocked|primary-cap-hit` (ScalingPathPrompt) — both read from `window.location.search` in a `useEffect` (`home/page.tsx:165-177`).
- **States handled in code:**
  - Loading/skeleton: `loadingActions` and `loadingSummary` booleans drive skeleton cards (`home/page.tsx:526-536`, `home/page.tsx:714-718`).
  - Empty (no actions): Three conditional fallback cards (accounts empty → `/accounts`; contacts ready but no emails → `/sequences`; total empty → `/chat?q=What should I focus on today?`) (`home/page.tsx:612-669`).
  - Empty (no hot contacts): Text placeholder `home/page.tsx:781-783`.
  - Empty (no meetings): Text "No meetings today" (`home/page.tsx:739`).
  - Empty (no tasks): Text "No tasks due today" (`home/page.tsx:859`).
  - Populated: Two-column layout rendered when data exists.
  - **MISSING:** No explicit error state for failed hydrate — the fallback silently degrades to all-empty state. No error boundary within the page body.
  - **MISSING:** No partial-data state — if hydrate returns `null` for `summary` but valid `actions`, the greeting shows "Welcome back" and the week-summary card is absent, but there is no user-facing indicator that data is partial.
- **Primary CTAs / outbound links (edges OUT):**
  - Welcome banner (shown on `?firstTime=true` + founderMetrics present):
    - "Review top accounts" → `/accounts?sort=score&dir=desc` (`home/page.tsx:366`) — passes sort context
    - "Launch a campaign" → `/sequences` (`home/page.tsx:372`) — no entity context
    - "Ask Elevay" → `/chat?q=Summarize my top prospects` (`home/page.tsx:379`) — pre-filled query
  - Action cards ("Your priorities today"):
    - Each card with `entityId` opens an inline slide-over panel (`home/page.tsx:545-556`), NOT a navigation. The panel shows context (last email, suggested follow-up) and offers "Send follow-up" (opens EmailComposerPanel) or "View details" (`/contacts/${entityId}` or `/opportunities`) (`home/page.tsx:944-950`).
    - "View contact" label is static text (`home/page.tsx:587`) — it is NOT a `<Link>`, it is display-only. The actual navigation happens in the panel footer.
    - "Draft email" button inside the card opens `EmailComposerPanel` with a blank `to:` field (email not passed at card level, only to is filled when `contactEmail` is set on the panel) (`home/page.tsx:590-601`).
    - "5 of N · View all" → `/tasks` (`home/page.tsx:518`) — drops all action context
  - Insights cards (shown when `insights.length > 0`):
    - Each insight card has NO outbound link/navigation (`home/page.tsx:681-703`). `suggestedAction` is plain text. **Dead-end.**
  - Deals at risk (DealsAtRiskSection):
    - Each deal card → `/opportunities/${deal.id}` (`home/page.tsx:1101`) — deep-links with dealId
    - "View all" → `/opportunities` (`home/page.tsx:1091`) — no filter context
  - Hot contacts (right column):
    - Each contact card → `/contacts/${p.contactId}` (`home/page.tsx:764`) — deep-links with contactId
    - "View all" → `/contacts?sort=priority` (`home/page.tsx:753`) — passes sort param
  - Recommendations ("This week"):
    - `entityType === "contact"` → `/contacts/${r.entityId}` with contactId (`home/page.tsx:809`)
    - `entityType === "company"` → `/accounts` — no entityId passed (`home/page.tsx:810`). **Context dropped.**
    - `entityType === "deal"` → `/opportunities` — no entityId passed (`home/page.tsx:811`). **Context dropped.**
    - `entityType === "campaign"` → `/sequences` — no entityId passed (`home/page.tsx:812`). **Context dropped.**
    - "View all" → `/chat?q=Show me all my recommendations` (`home/page.tsx:799`) — pre-filled query
  - Today's meetings:
    - Meeting cards show title + time but have **no click handler and no link** (`home/page.tsx:720-732`). **Dead-end.**
  - Today's tasks:
    - Task cards show title + account name (text only) but have **no click handler and no link** (`home/page.tsx:833-863`). **Dead-end.**
  - HotInboundsWidget: contact cards → `/contacts/${contactId}` when contactId exists, else `#` anchor (`hot-inbounds-widget.tsx:124`).
  - HotVisitorsWidget: company cards → `/accounts/${companyId}` when companyId exists, else `#` (`hot-visitors-widget.tsx:131`). Secondary CTAs: "Open deal" → `/opportunities?companyId=…&action=new` (`hot-visitors-widget.tsx:231`); "Enroll" → `/sequences?companyId=…&action=enroll` (`hot-visitors-widget.tsx:243`) — both carry context.
  - AgentFeed: only the "Link clicked" signal icon is mapped (`agent-feed.tsx:60`); no navigation link emitted from the component.
  - Empty-state fallback cards: `/accounts` (no sort param, `home/page.tsx:616`), `/sequences` (`home/page.tsx:635`), `/chat?q=What should I focus on today?` (`home/page.tsx:653`).
- **Inbound expectations (edges IN):**
  - `?firstTime=true` — set by `window.location.href = "/?firstTime=true"` after onboarding completion. Triggers welcome banner + TAMRevealNotification.
  - `?scalingPath=cold-on-primary-blocked|primary-cap-hit` — set by the send-worker when a send is blocked. Triggers ScalingPathPrompt.
- **Seam risks:**
  - Today's meetings section shows meeting title/time but has NO link to the meeting detail (`/meetings/${id}`). The "Today's meetings" widget on the home page is a **dead-end**.
  - Today's tasks section shows task title/account name but has NO link to `/tasks` or to the linked entity page. **Dead-end.**
  - Insights cards (inline on home, `home/page.tsx:681-703`) surface `suggestedAction` text with NO outbound CTA — no link to `/insights`, no action button. **Dead-end.**
  - Action cards open an inline slide-over panel. When `entityType !== "contact"` (e.g. deal, campaign), the panel footer "View details" navigates to `/opportunities` (no entity pre-selected), not `/opportunities/${entityId}` (`home/page.tsx:945`).
  - Recommendation cards for `company`, `deal`, `campaign` drop the entityId and navigate to list pages without any pre-filter or deep-link.
  - The "Draft email" button on action cards (`home/page.tsx:590-601`) passes a blank `to:` — email address is not populated because `action.contactEmail` is only available in `selectedAction` (the slide-over), not at the card-inline level. The "Draft email" in the card-inline does `to: ""`.
- **Notable gaps:**
  - `home/page.tsx:13` imports `OnboardingWizard`, `OnboardingChat`, `OnboardingV2Wrapper` — three onboarding paths conditionally mounted. `OnboardingIncompleteBanner` (line 325) is also rendered. Four overlapping onboarding surfaces.
  - No error state shown when `/api/home/hydrate` returns a non-ok status — the page silently falls back then goes all-empty with no user message.
  - `home/page.tsx:421-427`: `TAMRevealNotification` check uses `typeof window !== "undefined" && new URLSearchParams(window.location.search).has("firstTime")` — this evaluates during the render pass of a client component, which is fine, but the `typeof window` guard is redundant in a client component (already post-hydration by the time this renders).

---

### CS Today — route `/cs/today`

- **Purpose:** Founding CS daily priority queue — lists customer accounts ranked by risk × ARR from health snapshots.
- **Reads (data in):** `GET /api/cs/today?limit=20` (`cs/today/page.tsx:65`). Reads `customerHealthSnapshots` and `accounts` tables (inferred from route purpose). Assumes `cs.healthSnapshot` records exist (populated by a daily cron at 04:00 UTC).
- **States handled in code:**
  - Loading: `AIThinking` spinner (`cs/today/page.tsx:107`).
  - Error: Alert box with HTTP status (`cs/today/page.tsx:109-121`).
  - Empty: Explicit "No health snapshots yet" with cron timing explanation (`cs/today/page.tsx:123-139`).
  - Populated: List of `CsTodayCard` items (`cs/today/page.tsx:141-147`).
  - **MISSING:** No skeleton/loading shimmer — uses `AIThinking` spinner which is less indicative of list content.
  - **MISSING:** No partial-data state (partial health component data).
- **Primary CTAs / outbound links (edges OUT):**
  - Each account card → `/accounts/${item.accountId}` (`cs/today/page.tsx:163`). Deep-links to the account detail with accountId. This is the only outbound edge.
  - Refresh button re-calls `load()` (`cs/today/page.tsx:93-103`).
- **Inbound expectations (edges IN):** None — page loads fresh, no query params consumed.
- **Seam risks:**
  - Cards show `suggestedAction` text (`cs/today/page.tsx:234-253`) but provide NO button to act on the suggestion (no "Call", "Email", "Create task" CTA). The action is display-only. **Dead-end for the suggested action.**
  - ARR exposure is displayed (`cs/today/page.tsx:204-213`) but does not link to the associated opportunity/deal.
  - No link from the page to `/meetings` or `/tasks` for follow-up creation.
- **Notable gaps:**
  - `suggestedActionReason` displays but the suggested action itself (which is an LLM-generated string) has no handler.
  - `arrExposureUsd` is nullable — the `| null` case silently hides the ARR chip; no "ARR unknown" indicator.

---

### Meetings list — route `/meetings`

- **Purpose:** Calendar meeting list with prep generation; shows upcoming and past meetings from connected calendar.
- **Reads (data in):** `GET /api/meetings?daysBack=30&daysForward=14` (`meetings/page.tsx:77`). Returns `meetings`, `calendarConnected`, `nextMeeting`, `conflicts`. Assumes calendar OAuth connection via Google/Microsoft.
- **States handled in code:**
  - Loading: Skeleton rows (`meetings/page.tsx:135-158`).
  - Calendar not connected: `EmptyState` with "Go to settings" CTA → `/settings/mail-calendar` (`meetings/page.tsx:170-177`).
  - Empty (calendar connected, no meetings): `EmptyState` with "Upload transcript" CTA → `/meetings/upload` (`meetings/page.tsx:179-187`).
  - Populated: Sections for All-day, Upcoming, Past (`meetings/page.tsx:249-322`).
  - Next meeting countdown: Live ticker card (`meetings/page.tsx:190-233`).
  - Scheduling conflicts: Warning banners (`meetings/page.tsx:235-247`).
  - **MISSING:** No error state — failed fetch is only caught with `console.warn`.
  - **MISSING:** No partial-data state distinguishing "API error" from "genuinely no meetings".
- **Primary CTAs / outbound links (edges OUT):**
  - "Upload transcript" → `/meetings/upload` (`meetings/page.tsx:163`) — **this route does not exist**. There is no `(dashboard)/meetings/upload/page.tsx`.
  - Join link (external `href={nextMeeting.meetingLink}`) — opens meeting link in new tab (`meetings/page.tsx:220-229`).
  - "Prep" button per upcoming meeting → calls `generatePrep(m.id)`, which POSTs to `/api/meetings/prep` and shows inline prep doc (`meetings/page.tsx:383-387`). Stays on page.
  - **No link to `/meetings/${id}` from any meeting card.** The meeting cards expand inline (accordion). There is no navigation to the meeting detail page from the list. **Dead-end for full detail.**
- **Inbound expectations (edges IN):** None — no query params consumed.
- **Seam risks:**
  - Meeting list cards have no link to `/meetings/${id}` — the inline expand shows prep/notes/attendees but not the full detail (transcript chunks, follow-up draft, task creation). A founder cannot reach the full meeting detail from the list without manually typing the URL.
  - The `hasNotes` and `hasTranscript` badges exist on cards (`meetings/page.tsx:361-362`) suggesting there is detail, but clicking reveals only the inline prep; there is no "Open full detail" link.
  - "Upload transcript" CTA navigates to a non-existent route (`/meetings/upload`). Clicking this button 404s.
- **Notable gaps:**
  - `meetings/page.tsx:65`: `calendarConnected` defaults to `true` — if the API call fails entirely, `calendarConnected` stays `true` so the user sees "Waiting for your next meeting" instead of the connect-calendar prompt.
  - Past meetings have no CTA for transcript upload from the list view — the upload UI only exists at `/meetings/[id]`.

---

### Meeting detail — route `/meetings/[id]`

- **Purpose:** Full detail for a single meeting — transcript, AI notes (summary, key points, action items, decisions, buying signals), follow-up email draft, and a scoped chat panel.
- **Reads (data in):** `GET /api/meetings/${meetingId}/notes` (`meetings/[id]/page.tsx:157`). Also reads `?t=<seconds>` query param for citation deep-links (`meetings/[id]/page.tsx:120-123`). Assumes the meeting exists in the DB.
- **States handled in code:**
  - Loading: Full-screen spinner (`meetings/[id]/page.tsx:356-361`).
  - Not found: "Meeting not found" with back button (`meetings/[id]/page.tsx:364-373`).
  - Has notes: Full sections (Summary editable, Key Points editable, Action Items, Decisions editable, Buying Signals, Follow-Up Draft editable+sendable) (`meetings/[id]/page.tsx:594-901`).
  - Past meeting without notes: Upload zone (drag-drop + paste) (`meetings/[id]/page.tsx:903-963`).
  - Upcoming meeting: Prep generation panel (`meetings/[id]/page.tsx:964-1008`).
  - Auto-transcribed review banner (needsReview): when notes exist but no tasks, no follow-up, and source is `recall_bot` (`meetings/[id]/page.tsx:379`, `437-524`).
  - Live recording: `LiveExtraction` component mounted when `recordingStatus === "recording" | "in_call"` (`meetings/[id]/page.tsx:565-573`).
  - Citation deep-link (`?t=`): Banner + `TranscriptChunks` scroll-to (`meetings/[id]/page.tsx:387-436`).
  - **MISSING:** No error state if `GET /api/meetings/${meetingId}/notes` fails (only returns null → "Meeting not found").
  - **MISSING:** No loading skeleton — plain spinner.
- **Primary CTAs / outbound links (edges OUT):**
  - Back button → `/meetings` (`meetings/[id]/page.tsx:528`).
  - Attendee links: if `a.contactId` is set → `/contacts/${a.contactId}` anchor (`meetings/[id]/page.tsx:581-589`). If no `contactId`, plain text (no link).
  - "Confirm & update CRM" button → calls `triggerPostCall()` which POSTs to `/api/meetings/${meetingId}/post-call` (`meetings/[id]/page.tsx:513`). This creates tasks and drafts follow-up but does NOT navigate anywhere — stays on page.
  - "Create Tasks" button → same `triggerPostCall()` (`meetings/[id]/page.tsx:722-729`). Stays on page.
  - "Send follow-up" → POSTs to `/api/meetings/${meetingId}/notes/send-follow-up` (`meetings/[id]/page.tsx:329-347`). Stays on page.
  - `ScopedChat` panel — rendered at bottom (`meetings/[id]/page.tsx:1013-1019`). Stays on page.
  - Join link → external `meetingLink` in new tab (`meetings/[id]/page.tsx:553-556`).
- **Inbound expectations (edges IN):**
  - `?t=<seconds>` — citation deep-link from coaching surfaces. Consumed, validated, and used to scroll TranscriptChunks and seek video player (`meetings/[id]/page.tsx:120-123`).
  - No `?contactId=` or `?opportunityId=` pre-filling.
- **Seam risks:**
  - After "Confirm & update CRM" (which creates tasks from action items), there is NO link to `/tasks` to review the created tasks. Founder must navigate manually.
  - Action items section shows "N task(s) created in CRM" (`meetings/[id]/page.tsx:713-715`) as plain text — no link to the tasks.
  - The meeting has `matchedContacts` (`meetings/[id]/page.tsx:59`) but these are not surfaced on the page — attendees are shown with `a.contactId`, but `matchedContacts` from the response object is unused in the render.
  - Follow-up email is sent to meeting attendees but recipients are not shown in the pre-send view — founder cannot verify recipients before hitting "Send follow-up".
  - No link to the associated opportunity/deal even when `buyingSignals` are extracted (budget, timeline, competitors) — there is no "Update deal" or "View opportunity" CTA.
  - The meeting detail is not reachable from the meeting list (see above).
- **Notable gaps:**
  - `meetings/[id]/page.tsx:566`: `(meeting as any).metadata || (meeting as any)` — unsafe type cast to check `recordingStatus`. The `MeetingData.meeting` type does not include `metadata` (`meetings/[id]/page.tsx:39-55`), making this a silent any-cast.
  - `meetings/[id]/page.tsx:983-990`: prep generation passes `meetingAny.entityId || meetingAny.accountId` — fields not typed on the meeting interface, relying on runtime shape.

---

### Notes — route `/notes`

- **Purpose:** Flat list of all notes across the workspace — create, search, sort.
- **Reads (data in):** `GET /api/notes` (`notes/page.tsx:78`). Returns `notes` with `entityType`, `entityId`, `entityName`.
- **States handled in code:**
  - Loading: Skeleton (`notes/page.tsx:207-210`).
  - Empty (no notes): `EmptyState` with message (`notes/page.tsx:211-214`).
  - Empty (no search results): `EmptyState` (`notes/page.tsx:215-218`).
  - Populated: Note rows with hover styling (`notes/page.tsx:224-260`).
  - **MISSING:** No error state for failed fetch.
  - **MISSING:** No partial-data state.
- **Primary CTAs / outbound links (edges OUT):**
  - "Create note" button → focuses the textarea (`notes/page.tsx:131-136`). No navigation.
  - Note rows have **no click handler and no link**. There is no note detail page. Notes are read-only in the list.
  - Entity badge on notes (`notes/page.tsx:239-245`) shows `entityName` as text only — it is NOT a link to `/contacts/${entityId}` or `/accounts/${entityId}`. **Dead-end for back-navigation to the linked entity.**
- **Inbound expectations (edges IN):** None — no query params consumed.
- **Seam risks:**
  - Notes store `entityType` and `entityId` but the list page never renders these as navigable links. A note created from a contact/account detail has no way to navigate back to that entity from the notes list.
  - There is no note detail page — content is truncated to 200 characters in the list and cannot be expanded inline.
  - Notes created via `POST /api/notes` from the home page textarea (`notes/page.tsx:94-103`) have no `entityType` / `entityId` — they are orphaned general notes.
- **Notable gaps:**
  - `notes/page.tsx:94`: `POST /api/notes` sends only `content` — no `entityType` or `entityId`. Notes created from this page are always unattached.
  - Notes with truncated content (`notes/page.tsx:63-67`) cannot be fully viewed — there is no expand/open action.

---

### Tasks — route `/tasks`

- **Purpose:** Flat list of tasks across entities — create, filter (all/due today/overdue/completed), sort (priority/due date), toggle completion, cycle priority.
- **Reads (data in):** `GET /api/tasks` (`tasks/page.tsx:88`). Returns `tasks` with `entityType`, `entityId`, `entityName`.
- **States handled in code:**
  - Loading: Skeleton (`tasks/page.tsx:365-368`).
  - Empty (no tasks): `EmptyState` with message (`tasks/page.tsx:369-372`).
  - Empty (no filter match): `EmptyState` (`tasks/page.tsx:373-376`).
  - Populated: Grouped by entity when `entityType` + `entityId` are present (`tasks/page.tsx:192-207`), ungrouped otherwise.
  - Overdue indicator: Red badge on row (`tasks/page.tsx:274-278`).
  - **MISSING:** No error state for failed fetch.
- **Primary CTAs / outbound links (edges OUT):**
  - Task rows have **no click handler and no link** to task detail or to the linked entity page.
  - Entity badges (`tasks/page.tsx:242-248`) show `entityName` as text only — NOT a link to the entity. **Dead-end.**
  - "Add" button creates a new task with no entity association (`tasks/page.tsx:104`).
  - Checkbox toggles task completion via `PATCH /api/tasks/${id}` (`tasks/page.tsx:115-127`).
  - Priority badge click cycles priority via `PATCH /api/tasks/${id}` (`tasks/page.tsx:129-141`).
- **Inbound expectations (edges IN):** None — no query params consumed. Home page action "View all" navigates to `/tasks` with no filter pre-applied.
- **Seam risks:**
  - Tasks are grouped by entity (company/contact/deal) but clicking the entity group header or entity badge does not navigate to the entity. The grouping label (`tasks/page.tsx:386-397`) has no link.
  - Tasks created from meeting post-call processing appear in this list but have no back-link to the originating meeting.
  - Tasks created with `priority: "medium"` hardcoded on the home page via `POST /api/tasks` (`notes empty state fallback`) — no due date set.
  - No bulk actions (mark all done, delete).
- **Notable gaps:**
  - `tasks/page.tsx:104`: `POST /api/tasks` sends `{ title, priority: "medium" }` — no dueDate, no entityType, no entityId. Tasks created from this page are always orphaned.
  - No task detail/edit page — description field (`tasks/page.tsx:14`) is stored in the DB but never shown in the UI.

---

### Insights — route `/insights`

- **Purpose:** Pipeline overview — aggregate deal metrics, stage funnel, alert list, deal briefs (AI summaries).
- **Reads (data in):**
  - `GET /api/dashboard/pipeline?period=30` (`insights/page.tsx:95`)
  - `GET /api/dashboard/alerts` (`insights/page.tsx:96`)
  - `GET /api/dashboard/briefs?max=5` (`insights/page.tsx:97`)
- **States handled in code:**
  - Loading: Animated pulse skeletons (`insights/page.tsx:108-125`).
  - Populated: Pipeline metrics + funnel + alerts + deal briefs (`insights/page.tsx:128-340`).
  - Empty alerts: section hidden when `alerts.totalAlerts === 0` (`insights/page.tsx:198`).
  - Empty briefs: section hidden when `briefs.length === 0` (`insights/page.tsx:249`).
  - **MISSING:** No error state — `Promise.all` errors go to `console.error` only (`insights/page.tsx:102`).
  - **MISSING:** No empty state for zero pipeline deals (funnel just shows no bars).
- **Primary CTAs / outbound links (edges OUT):**
  - Alert cards: `entityType === "deal"` → `/opportunities/${alert.entityId}` (`insights/page.tsx:215-219`). For non-deal alerts (contact, campaign etc) — no navigation despite onClick handler existing.
  - Deal brief "View deal" button → `/opportunities/${brief.dealId}` (`insights/page.tsx:325`).
  - Pipeline stage funnel bars — **display only, no link** to `/opportunities?stage=X`.
  - Pipeline metric cards — **display only, no link**.
- **Inbound expectations (edges IN):** None.
- **Seam risks:**
  - Alert onClick handler only navigates for `entityType === "deal"` — contact and campaign alerts silently do nothing on click (`insights/page.tsx:214-220`).
  - Deal briefs show `nextAction.action` text but offer no "Create task" or "Start sequence" CTA — display-only. **Dead-end for the next action.**
  - Stage funnel has no clickthrough to filtered opportunity list.
  - The page does not link to `/insights/pilae`, `/insights/playbook`, or `/insights/hot-to-call` — no lateral navigation between insight sub-pages.
- **Notable gaps:**
  - `insights/page.tsx:102`: `Promise.all` — if any of the three API calls throws, the entire page stays loading indefinitely (`setLoading(false)` is only in `.finally()` which IS present — actually safe, but all three data states remain null simultaneously with no partial render).
  - `insights/page.tsx:319-321`: `brief.nextAction.action` and `brief.nextAction.owner` — if `nextAction` is undefined (server returns unexpected shape), this would throw a runtime error.

---

### Insights: Pilae — route `/insights/pilae`

- **Purpose:** Pilae tenant dogfood dashboard — bookings vs target (project/platform split), funnel by stage, deep-dive capacity (Paul's goulot).
- **Reads (data in):** `GET /api/insights/pilae` polled every 60s (`insights/pilae/page.tsx:70-73`). Returns `funnel`, `bookings`, `deepDive`, `label`.
- **States handled in code:**
  - Loading: Plain text "Loading…" (`insights/pilae/page.tsx:103-107`).
  - Error: Error banner (`insights/pilae/page.tsx:83-93`).
  - Populated: 3-column grid (`insights/pilae/page.tsx:96-100`).
  - Empty funnel: "No deals yet" message inside FunnelPanel (`insights/pilae/page.tsx:283-290`).
  - No deep-dive snapshot: Explicit message with cron timing (`insights/pilae/page.tsx:303-320`).
  - **MISSING:** No skeleton while loading.
- **Primary CTAs / outbound links (edges OUT):**
  - **None.** All three panels (Bookings, Funnel, Capacity) are display-only. There is no link to filtered `/opportunities?stage=X`, no link to the account list, no link to any action. **Complete dead-end.**
- **Inbound expectations (edges IN):** None.
- **Seam risks:**
  - "Legacy untagged (re-split needed)" bookings are flagged (`insights/pilae/page.tsx:178-183`) but there is no link or action to find and re-tag those deals.
  - Capacity showing "saturated" or "tight" has no link to Paul's calendar or a task/action creation.
- **Notable gaps:**
  - This is a tenant-specific admin/dogfood page (Pilae only). It is reachable from the sidebar for all users (if the insights sub-nav links to it), which is potentially a data-scope leak if the API doesn't gate by tenant.

---

### Insights: Playbook — route `/insights/playbook`

- **Purpose:** Playbook entry list (objections, accroches, questions) distilled from calls/meetings/replies. Manual add form.
- **Reads (data in):** `GET /api/playbook` or `GET /api/playbook?type=${type}` (`insights/playbook/page.tsx:52-55`). Returns `entries`.
- **States handled in code:**
  - Loading: Plain text "Loading…" (`insights/playbook/page.tsx:133-138`).
  - Error: Error banner (`insights/playbook/page.tsx:122-131`).
  - Empty: Empty state with explanation about capture being pending + "Add entry" CTA (`insights/playbook/page.tsx:141-143`, `EmptyState` component).
  - Populated: Entry cards with perf score badge.
  - **MISSING:** No skeleton.
- **Primary CTAs / outbound links (edges OUT):**
  - "Add entry" form — creates entry via `POST /api/playbook`. Stays on page.
  - Entry cards (`insights/playbook/page.tsx:180-215`) — **display only, no link**. `sourceActivityId` is stored but never rendered as a link to the originating meeting.
  - Type filter chips — filter in place.
- **Inbound expectations (edges IN):** None.
- **Seam risks:**
  - `entry.sourceActivityId` (`insights/playbook/page.tsx:26`) is in the data model but not rendered — there is no "View originating call" link from a playbook entry. Breaks the evidence chain.
  - The LLM extractor is explicitly noted as not yet wired (`insights/playbook/page.tsx:14-15` comment). Most entries will be manually added.
- **Notable gaps:**
  - Empty state text says the capture fn will fan in from transcripts "once the LLM extractor is wired" — this is a known TODO stub.
  - No edit/delete action on existing entries.
  - `perfScore` accepts a raw 0..1 float from the add form — no validation that it's in range beyond `Number.isFinite` check (`insights/playbook/page.tsx:279`).

---

### Insights: Hot to Call — route `/insights/hot-to-call`

- **Purpose:** Callable hot leads list — contacts with a phone number who have recent engagement signals (click/visit/open), sorted by hotness score.
- **Reads (data in):** `GET /api/dashboard/hot-to-call?hours=${windowH}&limit=100` polled every 30s (`insights/hot-to-call/page.tsx:119-133`).
- **States handled in code:**
  - Loading: Items are replaced on each poll (no explicit loading state shown beyond the first load).
  - Error: Error banner (`insights/hot-to-call/page.tsx:184-195`).
  - Empty: Explicit explanation including "Kaspr / Lusha waterfall is a follow-up" note (`insights/hot-to-call/page.tsx:369-384`).
  - Populated: HotCard list with Call button.
  - Speed window badge: contacts signalling < 5 min ago get a red "Speed window" badge (`insights/hot-to-call/page.tsx:263-271`).
  - **MISSING:** No skeleton on initial load.
- **Primary CTAs / outbound links (edges OUT):**
  - "Call" button — calls `startCall(contactId)` which POSTs to `/api/calls/start` (`insights/hot-to-call/page.tsx:69-113`). Returns `callId` but navigates nowhere — shows a toast. The softphone/call-mode UI is NOT opened automatically. Founder must manually navigate to `/call-mode`. **Seam break: call initiated but UI doesn't follow.**
  - Contact cards — **no link to `/contacts/${contactId}`**. The only action on a card is the Call button. Name, title, company are display-only. **Dead-end for non-call actions.**
  - Window filter chips (1h/24h/7d) — filter in place.
- **Inbound expectations (edges IN):** None.
- **Seam risks:**
  - Call button initiates via API but does not navigate to `/call-mode` or open a softphone overlay. Founder gets a toast "open Softphone for the live UI" (`insights/hot-to-call/page.tsx:104`) — requires manual navigation.
  - Contact name/company are shown but no link to the contact detail page for pre-call research.
  - `item.companyId` is in the type (`insights/hot-to-call/page.tsx:32`) but company name is only shown as text, not linked to `/accounts/${companyId}`.
- **Notable gaps:**
  - Empty state explicitly calls out that phone number enrichment (Kaspr/Lusha waterfall) is a future Phase 2 item — this page may show 0 contacts even when there are hot leads if those contacts lack phone numbers in Apollo.
  - `dialingContactId` state only disables one button at a time — rapid clicks on different contact Call buttons will fire parallel API calls.

---

### Reports — route `/reports`

- **Purpose:** Generate on-demand AI reports (Pipeline, Weekly, Win/Loss). View history (localStorage). Schedule weekly delivery.
- **Reads (data in):**
  - On-demand: `POST /api/reports/generate { type }` (`reports/page.tsx:164`). Backend reads pipeline/activity data.
  - History: `localStorage` key `elevay-report-history` (`reports/page.tsx:30`). Max 5 entries.
  - Schedule: `POST /api/reports/schedule { type, schedule: "weekly" }` (`reports/page.tsx:214`).
- **States handled in code:**
  - Loading: Animated progress steps with progress bar (`reports/page.tsx:319-369`).
  - Error: Error card (`reports/page.tsx:373-381`).
  - Generated: Report sections + metrics grid + recommendations (`reports/page.tsx:384-499`).
  - History list: Clickable history cards below (`reports/page.tsx:502-551`).
  - **MISSING:** No skeleton for initial page load.
  - **MISSING:** No empty state when no reports generated and no history.
- **Primary CTAs / outbound links (edges OUT):**
  - "Generate" button per report type → calls `generateReport(type)`. Stays on page.
  - "Schedule weekly" button → calls `scheduleWeekly(type)`. Stays on page.
  - "Copy as markdown" → clipboard. Stays on page.
  - Report metrics and recommendations — **display only, no links** to `/opportunities`, `/contacts`, or other entities.
  - History cards — load the report back into view. Stays on page.
  - **No outbound navigation anywhere.** This is a self-contained read surface.
- **Inbound expectations (edges IN):** None.
- **Seam risks:**
  - Report `recommendations` are plain strings (`reports/page.tsx:472-498`). No link to the entity mentioned in the recommendation.
  - Weekly scheduled reports have no delivery target UI — founder cannot see/configure where the report is sent (no email address shown).
  - History is localStorage-only — clears on browser reset / different device.
- **Notable gaps:**
  - `scheduleWeekly` on success shows a toast for 3 seconds but does not update any persistent schedule state — the founder has no way to see "this report is currently scheduled" after dismissing the toast.
  - `reports/page.tsx:186`: The deduplication `history.filter((h) => h.id !== entry.id)` uses `id = "${type}-${Date.now()}"` — this means deduplication never actually removes a prior entry of the same type, since timestamps differ.

---

## Activity+Home cluster — seam summary

### Context-carrying handoffs (working)
- Home hot contacts → `/contacts/${contactId}` — contactId carried
- Home deals at risk → `/opportunities/${dealId}` — dealId carried
- Home action panel footer → `/contacts/${entityId}` — entityId carried (contact only)
- Home HotVisitorsWidget → `/accounts/${companyId}`, `/opportunities?companyId=…`, `/sequences?companyId=…` — companyId carried
- Home HotInboundsWidget → `/contacts/${contactId}` — contactId carried (when set)
- CS Today → `/accounts/${accountId}` — accountId carried
- Insights alerts → `/opportunities/${entityId}` (deal type only) — entityId carried
- Insights deal briefs → `/opportunities/${dealId}` — dealId carried
- Meeting detail attendees → `/contacts/${contactId}` (when matched) — contactId carried
- Hot-to-call Call button → `POST /api/calls/start { contactId }` — contactId carried to API

### Context-dropped handoffs (gaps)
- Home today's meetings cards → **no link at all** (dead-end, `home/page.tsx:720-732`)
- Home today's tasks cards → **no link at all** (dead-end, `home/page.tsx:833-863`)
- Home insight cards → **no link at all** (dead-end, `home/page.tsx:681-703`)
- Home recommendation cards for company/deal/campaign → list page with no entityId (context dropped, `home/page.tsx:810-812`)
- Home action "View contact" text → is non-interactive display text, not a link (`home/page.tsx:587`)
- Meetings list → no link to `/meetings/${id}` (accordion expands in place, dead-end for full detail)
- Meetings list "Upload transcript" → `/meetings/upload` does not exist (404)
- Meeting detail "Confirm & update CRM" → tasks created but no link to `/tasks` (silent creation)
- Meeting detail action items → "N task(s) created" plain text, no link to tasks
- Meeting detail `matchedContacts` field → loaded from API but never rendered
- Meeting detail → no "View opportunity" CTA after buying signals extracted
- Notes list entity badge → plain text, not a link to the entity (`notes/page.tsx:239-245`)
- Tasks list entity badge/group header → plain text, not a link to the entity (`tasks/page.tsx:388-397`)
- Insights stage funnel bars → display only, no link to `/opportunities?stage=X`
- Insights alerts for non-deal entity types → onClick does nothing
- Insights deal briefs `nextAction` → display only, no task creation CTA
- Insights/pilae panels → complete dead-end, zero outbound links
- Insights/playbook entry `sourceActivityId` → stored but not rendered as link to meeting
- Insights/hot-to-call contact names → display only, no link to `/contacts/${contactId}`
- Insights/hot-to-call Call button → initiates call via API but does not open `/call-mode` or softphone
- Reports recommendations → plain text strings, no entity links
- Reports schedule → no persistent UI to view/cancel scheduled reports

### Key dead-ends
1. **Home "Today's meetings" widget** — shows meeting title/time but zero clickability. The most time-sensitive surface on the home page is read-only.
2. **Home "Today's tasks" widget** — same: shows tasks with no way to mark done or navigate to them.
3. **Meetings list has no path to meeting detail** — inline accordion is the only expansion. The `/meetings/${id}` page is effectively unreachable from normal navigation.
4. **`/meetings/upload` is a broken CTA** — referenced in two places in the meetings list (`page.tsx:163`, `184`) but the route file does not exist.
5. **All three Insights sub-pages (pilae/playbook/hot-to-call) are read-only dashboards** — none hands off to Call Mode, Sequences, or Tasks with any pre-loaded context.
6. **Notes and Tasks entity back-links are missing** — both pages store `entityType`/`entityId` but never render them as navigable links.
