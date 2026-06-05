# Engage Cluster — Code Analysis Audit

> Date: 2026-06-05  
> Analyst: Claude Sonnet 4.6 (read-only static analysis)  
> Scope: /inbox, /call-mode, /sequences, /sequences/[id], /sequences/[id]/review (redirect), /sequences/review, /deliverability

---

### Inbox — route `/inbox`

- **Purpose**: Single-pane table of all sent outbound emails for the tenant, with per-row AI reply drafting.

- **Reads (data in)**:
  - `GET /api/inbox?filter=<all|replied|awaiting|bounced>` — queries `outbound_emails` joined to `contacts` (name lookup). Returns 30 rows per page; page param is accepted by the API but the page UI does NOT pass it — always page 1. Source: `inbox/page.tsx:100`, `api/inbox/route.ts:13-16`.
  - Assumes `outboundEmails.tenantId`, `outboundEmails.sentAt IS NOT NULL`.

- **States handled in code**:
  - **Loading**: `TableSkeleton rows={8} cols={6}` — `inbox/page.tsx:151`.
  - **Empty**: `EmptyState` with contextual description — `inbox/page.tsx:152-156`.
  - **Populated**: full `<table>` — `inbox/page.tsx:159-255`.
  - **Error fetch**: silently swallowed via `.catch(console.error)` — `inbox/page.tsx:106`. No error UI. **MISSING**.
  - **AI drafting in-progress**: `draftingFor === email.id` disables button + shows spinner — `inbox/page.tsx:225-238`. Handled.
  - **Partial-data**: every column has a fallback (`—`); `contact` can be null. Handled.
  - **Edge — pagination**: API supports `page`, UI always fetches page 1. No "load more" / infinite scroll. **MISSING state for >30 emails**.

- **Primary CTAs / outbound links (edges OUT)**:
  - "Draft AI reply" button (per replied row) → opens `EmailComposerPanel` as a slide-in right panel — `inbox/page.tsx:222-239`, `inbox/page.tsx:259-264`.
  - No link to the contact profile or the sequence that originated the email. No link to `/sequences/[id]`.
  - No link from a reply row to an opportunity or task creator.

- **Inbound expectations (edges IN)**:
  - No query params read. Page always starts blank with `filter="all"`.
  - No pre-filtering by contact, sequence, or deal.

- **Seam risks**:
  - **Reply → Contact dead end**: a replied email shows the contact name in plain text but there is NO link to `/contacts/[contactId]` — `inbox/page.tsx:176-181`. The `contactId` field is fetched and present in the data but never rendered as a link.
  - **Reply → Task/Deal dead end**: after "Draft AI reply" the `EmailComposerPanel` opens with `contactId` and `dealId` both `undefined` — `inbox/page.tsx:85-89` builds the `composer` draft from only `to/subject/body`. No task is created; no deal stage advances. The send goes through `/api/emails/send` which is fire-and-forget from the inbox UI.
  - **Reply → Thread dead end**: `outboundEmails.threadId` is fetched by the API (`api/inbox/route.ts:53`) but the inbox page type definition does NOT include `threadId` (`inbox/page.tsx:13-31`) and it is never used. Threading context is dropped.
  - **No back-link to sequence**: `enrollmentId` and `stepNumber` are displayed as text only ("Step N") — `inbox/page.tsx:249-251`. No navigation to `/sequences/[id]`.
  - **Pagination bug**: API defaults to page 1, limit 30. The `pagination` key is returned but the client never uses it; tenants with >30 sent emails see only the 30 most recent.

- **Notable gaps**:
  - No error state rendered for a failed `GET /api/inbox` — network failure is silently `console.error`'d only.
  - The "Draft AI reply" route ignores the existing `threadId`: it generates a standalone reply using only a 250-char `replySnippet`, not the full thread — `api/emails/suggest-reply/route.ts:39-73`. No thread context is passed in the POST body.
  - `replyClassification` renders as raw text badge (`inbox/page.tsx:213-218`); click does nothing.
  - `bounceType` is shown in the badge label but no action is wired (e.g. remove from list).

---

### Call Mode — route `/call-mode`

- **Purpose**: Three-column cold-call cockpit — prioritised queue (left), pre-call brief + live transcript (centre), account brain (right).

- **Reads (data in)**:
  - `GET /api/calls/config` — Twilio configuration check (`VoiceConfig`). Source: `call-mode/page.tsx:139`.
  - `GET /api/calls/queue?limit=50[&accounts=id1,id2]` — ranked contact queue via `buildQueue()` (`lib/voice/queue.ts`). Queries `contacts` LEFT JOIN `companies` LEFT JOIN `deals`. Filters DNC + quiet hours. Returns `QueueItem[]`.
  - `GET /api/brain/contact/[contactId]` — lazy-fetched per selected contact. Returns `ContactBrainJSON` (focal contact + direct activities + owned deals + company brain + cached dossier).
  - `POST /api/calls/start` — initiates the call. Accepts `{ contactId, dealId?, enrollmentId?, overrideQuietHours? }`.
  - `GET /api/calls/[id]/events` (SSE) — polls the `calls` row every 1s, emitting `ringing / connected / amd_detected / human_detected / voicemail_dropped / transcript / coaching_card / ended`.

- **States handled in code**:
  - **Loading**: spinner centered — `call-mode/page.tsx:484-492`. Handled.
  - **Not configured** (`!config.configured`): `EmptyState` with link to Settings → Voice — `call-mode/page.tsx:494-510`. Handled.
  - **Configured but no pool number** (`!config.ready`): `EmptyState` with link to provision a number — `call-mode/page.tsx:512-529`. Handled.
  - **Queue empty**: inline text "File vide. Importez ou enrichissez des contacts…" — `call-mode/page.tsx:589-591`. Handled.
  - **No contact selected**: placeholder text in centre + right columns — `call-mode/page.tsx:742-758`. Handled.
  - **Brain loading**: `BriefSkeleton` in centre and right panels — `_panels.tsx:461-464`, `_panels.tsx:617-622`. Handled.
  - **Brain null** (contact has no company): message in right panel — `_panels.tsx:625-630`. Handled.
  - **Softphone states** (idle / starting / dialing / ringing / connected / ended): all rendered via `SoftphoneControls` switch — `call-mode/page.tsx:797-884`. All handled.
  - **AMD detected**: warning banner + voicemail drop button — `call-mode/page.tsx:679-715`. Handled.
  - **Transcript empty at call end**: specific diagnostic message in `LiveTranscript` — `_panels.tsx:851-861`. Handled.
  - **Error** (network on bootstrap): `console.warn` only, no UI error — `call-mode/page.tsx:152`. **MISSING error state**.
  - **Mute button**: rendered but `disabled` attribute set; clicking does nothing — `call-mode/page.tsx:854-857`. **Non-functional button**.

- **Primary CTAs / outbound links (edges OUT)**:
  - "Appeler" button → `POST /api/calls/start` with `contactId` only — `call-mode/page.tsx:800`.
  - "Enrichir email & téléphone" → `POST /api/contacts/[contactId]/zeliq-enrich` — `call-mode/page.tsx:204-233`.
  - "Aller dans Settings → Voice" / "Provisionner un numéro" → `window.location.href = "/settings/sending-infrastructure"` — `call-mode/page.tsx:503`, `call-mode/page.tsx:521`.
  - No link to `/contacts/[id]` from the contact name/header.
  - No link to `/opportunities/[id]` from a deal shown in the brief.
  - No post-call CTA to create a task, advance a deal, or enroll in a sequence.

- **Inbound expectations (edges IN)**:
  - `?accounts=id1,id2` query param pre-scopes the queue to a set of company IDs — `call-mode/page.tsx:124-136`. Banner displayed when scope is active — `call-mode/page.tsx:575-586`. **This is the only cross-feature handoff that works.**
  - No `?contactId=` param to open a specific contact directly (queue always starts with `data.calls[0]` — `call-mode/page.tsx:149`).
  - No `?dealId=` or `?enrollmentId=` pre-loading.

- **Seam risks**:
  - **After call: no outcome capture UI**: when softphone transitions to `kind: "ended"`, the UI shows a badge (`state.outcome ?? "ended"`) and a "Rappeler" button — `call-mode/page.tsx:875-884`. The post-processing (transcript → LLM → activity → DNC) happens asynchronously in the `calls-post-process` Inngest worker — `calls-post-process.ts`. The user cannot manually enter an outcome, flag next action, or create a task directly from the ended-call screen. There is no UI seam between call end and deal/task creation.
  - **Notes from brief are read-only**: the pre-call brief renders signals, activities, and deals from the brain, but there is no way to annotate or add a note inline before or after the call.
  - **No enrollment handoff**: the queue item has `contactId` but `POST /api/calls/start` only accepts `contactId` (optionally `dealId`/`enrollmentId`). The UI sends ONLY `contactId` — `call-mode/page.tsx:258-260`. `dealId` and `enrollmentId` are never passed even though they appear in the start schema.
  - **Deepgram batch fallback missing**: `calls-post-process.ts:90-101` notes that when the streaming transcript is empty, "Phase 1 fallback: Deepgram batch transcription is wired in Phase 2." An empty transcript silently becomes `outcome: "no_answer"` — a cold call that connected and had a conversation but where Media Streams dropped returns the wrong outcome.

- **Notable gaps**:
  - Mute button is always `disabled` — `call-mode/page.tsx:854`. A "TODO: wire mute to Twilio SDK" is the implied gap.
  - `filter === "trial_expiring"` and `filter === "reply_received"` chips are rendered but fall back to the full queue — `call-mode/page.tsx:242-243`. Comment: "Other filters are placeholders for Phase 2 chips".
  - No way to remove a contact from the queue (mark as "not now", snooze, skip).
  - `accountScope` clears to 0 on mount — if the user navigates away and back, the `?accounts=` param is re-read from `window.location.search` only once; a client-side navigation that doesn't carry the param resets scope silently.

---

### Campaigns List — route `/sequences`

- **Purpose**: List all sequences (draft / active / paused / archived) with inline Approve/Reject for AI-proposed drafts.

- **Reads (data in)**:
  - `GET /api/sequences` — returns `{ sequences: Sequence[] }`. Source: `sequences/page.tsx:37`.
  - Assumes `sequences` table with `id, name, description, status, stepCount, enrolledCount, emailStats, createdAt`.

- **States handled in code**:
  - **Loading**: 3 pulse skeleton divs — `sequences/page.tsx:121-124`. Handled.
  - **Empty**: `EmptyState` with "Create your first campaign" CTA — `sequences/page.tsx:125-131`. Handled.
  - **Populated**: card list — `sequences/page.tsx:133-204`. Handled.
  - **Draft with approve/reject**: inline buttons, optimistic update, rollback — `sequences/page.tsx:57-86`, `sequences/page.tsx:162-196`. Handled.
  - **Error**: fetch failure is `console.warn` only, no error state shown — `sequences/page.tsx:43-44`. **MISSING**.
  - **Partial-data**: `emailStats` is optional; total computed only when `totalEmails > 0` — `sequences/page.tsx:155-157`. Handled.

- **Primary CTAs / outbound links (edges OUT)**:
  - "New campaign" → opens `CampaignWizard` overlay — `sequences/page.tsx:102-116`.
  - Row click → `router.push(\`/sequences/${seq.id}\`)` — `sequences/page.tsx:139`.
  - Campaign wizard `onComplete` → `router.push(\`/sequences/${sequenceId}\`)` — `sequences/page.tsx:112-114`.
  - Approve/Reject are in-place; no navigation follows.

- **Inbound expectations (edges IN)**:
  - No query params. Always loads the full tenant list.
  - No pre-filtering by contact, account, or deal; no "create campaign for this contact" path.

- **Seam risks**:
  - **Campaign creation is entirely generic**: the `CampaignWizard` target step collects industry/size/geography/roles as ICP filters — `campaign-wizard.tsx:96-103`. There is no way to create a sequence that is pre-scoped to a specific account, contact, or deal from the list or from a contact/account detail page. Enrollment is always bulk-by-segment, never individual.
  - **No individual contact enroll**: the sequences list exposes no "enroll a contact" action. Individual enrollment exists only inside `/sequences/[id]` (via the campaign wizard or `PUT /api/sequences/[id]/enroll`), and even there the UI does not expose it directly — only pause/resume/stop per existing enrollment.

- **Notable gaps**:
  - `emailStats` is `Record<string, number>` typed but `emailStats.sent` is used without null guard — `sequences/page.tsx:156`. Works at runtime but fragile.
  - "Archived" sequences are returned by the list API (no filter) but the UI has no archive-filter tab.

---

### Sequence Detail — route `/sequences/[id]`

- **Purpose**: Per-sequence view — step timeline, enrolled contacts, campaign status (preparing/ready/launched), analytics.

- **Reads (data in)**:
  - `GET /api/sequences/[id]` — returns `{ sequence, steps, enrollments }`. Source: `sequences/[id]/page.tsx:94-118`.
  - `GET /api/campaigns/[id]/status` — polled every 3s while `campaignStatus === "preparing"` — `sequences/[id]/page.tsx:124-138`.
  - `GET /api/sequences/[id]/analytics` — lazy on tab switch — `sequences/[id]/page.tsx:170-185`.
  - `PATCH /api/sequences/[id]/steps/[stepId]` — step edit.
  - `DELETE /api/sequences/[id]/steps/[stepId]` — step delete.
  - `PUT /api/sequences/[id]/enroll` — per-enrollment pause/resume/stop.
  - `POST /api/campaigns/[id]/launch` — launches the campaign.
  - `GET /api/sequences/[id]/export` — download JSON template.

- **States handled in code**:
  - **Loading**: spinner — `sequences/[id]/page.tsx:258`. Handled.
  - **Not found**: error text — `sequences/[id]/page.tsx:259`. Handled.
  - **No steps yet**: empty card with explanation — `sequences/[id]/page.tsx:352-360`. Handled.
  - **Campaign preparing**: spinner + counters — `sequences/[id]/page.tsx:495-505`. Handled.
  - **Campaign ready**: "Review emails" + "Launch" buttons — `sequences/[id]/page.tsx:507-523`. Handled.
  - **Campaign launched**: stat grid + "View all emails" — `sequences/[id]/page.tsx:528-552`. Handled.
  - **Analytics loading**: text placeholder — `sequences/[id]/page.tsx:663`. Handled.
  - **Analytics empty**: "No analytics yet" — `sequences/[id]/page.tsx:665`. Handled.
  - **Error**: fetch failures are `console.warn` only — `sequences/[id]/page.tsx:113`, `sequences/[id]/page.tsx:165`. **MISSING UI error state for initial load failure**.
  - **Enrolled >20**: truncated table with "+N more" text, no pagination — `sequences/[id]/page.tsx:629-631`. **Edge case not fully handled**.

- **Primary CTAs / outbound links (edges OUT)**:
  - "Review emails" button → `router.push(\`/sequences/${id}/review\`)` which server-redirects to `/sequences/review?sequenceId=${id}` — `sequences/[id]/page.tsx:517`.
  - "Configure Campaign" / "Continue Campaign" → opens `CampaignWizard` overlay.
  - "Export" → `GET /api/sequences/[id]/export` download.
  - "View all emails" (launched state) → `router.push(\`/sequences/${id}/review\`)` — `sequences/[id]/page.tsx:547`.
  - No link from an enrolled contact row to `/contacts/[contactId]` — contact name is plain text at `sequences/[id]/page.tsx:577`.
  - No link from analytics reply count to `/inbox` filtered by this sequence.

- **Inbound expectations (edges IN)**:
  - Route param `[id]` only. No query params.
  - Auto-opens wizard if `status === "draft"` and no config + no steps — `sequences/[id]/page.tsx:107-111`. Handled.

- **Seam risks**:
  - **Enrolled contact → Contact profile**: contact names in the enrolled table are plain text. `contactId` is in the enrollment object — `sequences/[id]/page.tsx:29`. No link is rendered.
  - **"Reply received" enrollment status**: when `e.status === "replied"`, the row shows a Badge but no action — no button to open the reply in `/inbox`, no button to pause the enrollment. `sequences/[id]/page.tsx:582-585`.
  - **Sequence reply → Inbox disconnect**: there is no "View replies for this sequence" button that filters `/inbox` to `enrollmentId` or `sequenceId`. The path to see replies from a specific sequence is: `/sequences/[id]` → breadcrumb to `/sequences` → manual navigation to `/inbox` → manual filter.

- **Notable gaps**:
  - Campaign status polling continues even after `campaignStatus === "ready"` returns from the API — the interval is cleared inside the `useEffect`, which is correct, but `fetchSequence()` is called inside the poll which triggers a re-render. Benign but can cause layout flicker.
  - Enrollment table hard-caps at 20 with no load-more: `sequences/[id]/page.tsx:576`.
  - Per-step "Pause/Resume/Stop" buttons fire raw `fetch` calls with no error handling (no toast on failure) — `sequences/[id]/page.tsx:590-623`.

---

### Sequence Legacy Review Redirect — route `/sequences/[id]/review`

- **Purpose**: Server-side redirect only. Redirects `/sequences/[id]/review` to `/sequences/review?sequenceId=<id>`.
- **Reads (data in)**: route param only.
- **States handled in code**: single `redirect()` — no UI rendered.
- **Primary CTAs / outbound links (edges OUT)**: redirects to `/sequences/review?sequenceId=<id>`.
- **Inbound expectations (edges IN)**: `[id]` param. Also accepts any query string on the source URL (but does not forward it).
- **Seam risks**: none — pure redirect, no data loss.
- **Notable gaps**: if the source URL carried additional params (e.g. `?step=2`), they are lost in the redirect. Not currently a problem since no code sends such params.

---

### Review Queue — route `/sequences/review`

- **Purpose**: Global pending-approval queue for all AI-drafted sequence emails. Split-pane: 360px draft list (left) + preview/edit pane (right). Approve / Reject / Edit / Bulk-approve.

- **Reads (data in)**:
  - `GET /api/sequences/drafts?status=<pending_approval|approved|rejected>&limit=50[&cursor=][&sequenceId=]` — paginated draft list. Source: `sequences/review/page.tsx:61-64`.
  - `GET /api/sequences/drafts/[id]/context` — context bundle per selected draft (contact / account / deal / recent interactions / signals) — fetched inside `SequenceDraftPreview` component.
  - `POST /api/sequences/drafts/[id]/approve` — single approve.
  - `POST /api/sequences/drafts/bulk-approve` — batch approve.
  - `POST /api/sequences/drafts/[id]/reject` — reject with reason.
  - `PATCH /api/sequences/drafts/[id]/edit` — inline edit (version-stamped).
  - Polls every 30s when on `pending_approval` tab — `sequences/review/page.tsx:106-108`.

- **States handled in code**:
  - **Loading**: handled inside `SequenceDraftList` (not visible in this file but called with `loading` prop — `sequences/review/page.tsx:378`). Partially handled.
  - **Empty list, no drafts**: "Nothing to review here." — `sequences/review/page.tsx:397-403`. Handled.
  - **Empty selection**: "Select a draft to preview." — `sequences/review/page.tsx:396-403`. Handled.
  - **Draft selected**: full `SequenceDraftPreview` — `sequences/review/page.tsx:387-391`. Handled.
  - **Bulk approve pending**: action bar with count + Approve/Clear — `sequences/review/page.tsx:307-355`. Handled.
  - **Bulk approve partial failure** (409): toast with count — `sequences/review/page.tsx:168-173`. Handled.
  - **Error (network)**: toast displayed — `sequences/review/page.tsx:87`. Handled.
  - **Load more** (cursor pagination): `onLoadMore` prop wired — `sequences/review/page.tsx:374-376`. Handled.
  - **Status tabs** (pending / approved / rejected): status change resets selection and clears bulk select — `sequences/review/page.tsx:366-371`. Handled.

- **Primary CTAs / outbound links (edges OUT)**:
  - "Sequences" breadcrumb → `/sequences` — `sequences/review/page.tsx:284`.
  - Approve → removes draft from list, no navigation.
  - Reject → opens modal, removes draft from list on success, no navigation.
  - Edit → in-place mutation, version-stamped.
  - No link from a draft to the contact profile.
  - No link to `/inbox` to see actual sent email after approval.

- **Inbound expectations (edges IN)**:
  - `?sequenceId=<id>` — optional pre-filter forwarded to API — `sequences/review/page.tsx:37`, `sequences/review/page.tsx:63`. Handled.
  - No other query params.

- **Seam risks**:
  - **Approved draft → Inbox**: after approving a draft, there is no link to track whether the resulting email was actually sent, opened, or replied to in `/inbox`. The user must navigate manually.
  - **Contact context in draft**: the `SequenceDraftPreview` loads a context bundle that includes the contact — but no link to `/contacts/[id]` is rendered from the preview (confirmed in first 60 lines of `sequence-draft-preview.tsx`; full component not fully read but the pattern is display-only).

- **Notable gaps**:
  - The `?sequenceId` pre-filter is applied to the API but there is no visible UI indicator that the queue is filtered. No banner/badge saying "Filtered to sequence X".
  - The polling interval (30s) fires `fetchDrafts` with a stale closure over `status` — this is the known `eslint-disable` comment at `sequences/review/page.tsx:118`. Functionally correct but fragile on status changes.

---

### Deliverability — route `/deliverability`

- **Purpose**: Email sending health dashboard — KPI grid (sent/open/reply/bounce/spam rates with WoW trends), actionable recommendations, per-mailbox health cards, enrollment status breakdown.

- **Reads (data in)**:
  - `GET /api/deliverability` — returns `DeliverabilityData` with all metrics, warnings, mailbox health, and `prevWeek` comparison. Source: `deliverability/page.tsx:163-168`.
  - No other API calls. Pure read.

- **States handled in code**:
  - **Loading**: 3-card skeleton grid — `deliverability/page.tsx:203-218`. Handled.
  - **Fetch error** (`!data`): error paragraph — `deliverability/page.tsx:221-230`. Handled.
  - **Zero sent**: bottom centered message — `deliverability/page.tsx:480-489`. Handled.
  - **Critical recommendations**: red alert banners — `deliverability/page.tsx:261-278`. Handled.
  - **Warning recommendations**: amber banners — `deliverability/page.tsx:280-298`. Handled.
  - **Info recommendations**: blue banners — `deliverability/page.tsx:300-318`. Handled.
  - **No recommendations**: legacy `data.warnings` array fallback — `deliverability/page.tsx:321-329`. Handled.
  - **Mailbox health present**: per-mailbox cards with usage bar — `deliverability/page.tsx:410-458`. Handled.
  - **No mailbox health** (`mailboxHealth` absent/empty): section simply not rendered. Handled.
  - **prevWeek absent**: trend arrows show nothing (`null` returned by `getTrendArrow`) — `deliverability/page.tsx:130-132`. Handled.
  - **Edge — partial-data**: `enrollmentsByStatus` may be empty (section not rendered). Handled.

- **Primary CTAs / outbound links (edges OUT)**:
  - None. Pure read-only dashboard.
  - Recommendation `action` text tells the user what to do but provides no clickable navigation to Settings → Mailboxes, Settings → Sending Infrastructure, or `/sequences`.
  - No link from "bounced" stat to `/inbox?filter=bounced`.
  - No link from "replied" stat to `/inbox?filter=replied`.

- **Inbound expectations (edges IN)**:
  - No query params. No pre-scoping.

- **Seam risks**:
  - **Recommendations have no action buttons**: the `action` string is rendered as plain text — `deliverability/page.tsx:269-272`, `deliverability/page.tsx:289-292`. User must manually navigate. E.g. "Verify email addresses before sending" has no link to a contact list filtered by `email IS NULL` or to a bounce-management workflow.
  - **Mailbox health cards are read-only**: "Pause sending from this mailbox" is the recommended action text for high-bounce mailboxes, but there is no button on the card to pause the mailbox — the user must go to Settings → Mailboxes separately.
  - **No drill-down to sequences**: bounce/open/reply rates are aggregated across all sequences but there is no breakdown by sequence and no link to `/sequences` filtered by health metric.

- **Notable gaps**:
  - `data.spamRate` threshold comparison at `deliverability/page.tsx:55` checks `> 0.1` — but the description says "0.1% threshold". The stored rate appears to be a percentage (not a fraction 0–1), so the check `> 0.1` triggers at 0.11% not 0.11 (i.e. 11%) — need to verify API response format.
  - `getMailboxStatusBadge` handles `"warming_up"` and `"suspended"` but the `MailboxHealth.status` interface says `string` with no constraint. Unrecognised statuses fall through to the `default` branch.

---

## Engage Cluster — Seam Summary

### 1. Accounts / Call Mode → individual contact pre-load

**Does code carry context?** Partially.

The accounts list can push `?accounts=id1,id2` to `/call-mode` — `call-mode/page.tsx:124-136`. This scopes the queue to contacts at those companies. However, there is no `?contactId=` support: the page always selects `queue[0]` automatically — `call-mode/page.tsx:149`. A rep who clicks a specific contact in the Accounts or Contacts view cannot land on Call Mode with that contact pre-selected. The seam exists at the company level but not at the individual contact level.

### 2. Call Mode → Post-call outcome capture

**Does code carry context?** No — not in the UI.

When softphone reaches `kind: "ended"`, the UI shows a badge with `state.outcome ?? "ended"` and a "Rappeler" button — `call-mode/page.tsx:875-884`. The post-call pipeline runs entirely in the background via Inngest (`calls-post-process`): transcript → LLM → `activities` insert → DNC check — `calls-post-process.ts`. No user-facing seam exists to:
- Confirm or override the auto-detected outcome.
- Create a follow-up task.
- Advance a deal stage.
- Enroll the contact in a follow-up sequence.

This is a hard dead end. The activity is written automatically but the rep cannot act on the call result from within Call Mode.

### 3. CRM / Insights → Sequence enrollment

**Does code carry context?** No.

The `CampaignWizard` is always ICP-filter-based (industry/size/geography/roles) — `campaign-wizard.tsx:93-103`. There is no path from a contact or account detail page to "enroll in sequence X". The `PUT /api/sequences/[id]/enroll` endpoint exists but the UI exposes no ad-hoc enroll action for a single contact. The sequence detail page shows enrolled contacts (pause/resume/stop only). No "add contact" button exists on the enrolled contacts table — `sequences/[id]/page.tsx:558-638`.

### 4. Sequence reply → Inbox attached to contact/thread

**Does code carry context?** Partially, in data only — not in navigation.

The `outbound_emails` table stores `contactId`, `enrollmentId`, `stepNumber`, and `threadId` — verified in `api/inbox/route.ts:50-54`. The `/inbox` page receives these fields. However:
- The inbox page type omits `threadId` — `inbox/page.tsx:13-31`.
- No navigation link from an inbox row to the contact profile exists.
- No navigation link from an inbox row to the originating sequence exists.
- Filtering `/inbox` by sequence requires knowing the sequence ID; no UI cross-link exists from `/sequences/[id]` to `/inbox?sequenceId=...`.

Data integrity: replies are stored against the correct email row (via webhook from the email provider). Presentation: no cross-navigation.

### 5. Inbox reply → Task / Opportunity creation

**Does code carry context?** No.

"Draft AI reply" opens `EmailComposerPanel` with `to/subject/body` only — `inbox/page.tsx:85-89`. `contactId` and `dealId` are NOT passed (both fields exist on `EmailComposerDraft` at `email-composer-panel.tsx:14-21` but the inbox never populates them). The panel sends via `POST /api/emails/send`. No task is created; no opportunity stage is updated; no note is written. After the email is sent, there is no UI to close the loop.

### 6. Sequence draft approve → Inbox tracking

**Does code carry context?** No cross-navigation.

After approving a draft in `/sequences/review`, the draft disappears from the queue. The resulting sent email will appear in `/inbox` (once dispatched). There is no link or notification connecting "draft approved" to "email sent status". The user must navigate manually to `/inbox` to confirm delivery/open/reply.

---

**End of Engage cluster audit.**
