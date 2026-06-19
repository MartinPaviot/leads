# INBOX-G02 — Auto-capture to CRM (approval-gated, human-in-the-loop)
> Theme: T7 · Autonomy rung: proactive · Priority: P0
> Pillar: P5 GTM moat

## User story
As a founder reading my inbox, I want every prospect email I receive and send to become a
first-class CRM interaction automatically — gated by the capture-approval mode I chose — so my
timeline is complete without a single BCC, copy-paste, or "log to CRM" click.

## Why (audit anchor)
Superhuman's CRM logging is **Auto-Bcc** to an *external* CRM (Salesforce/HubSpot/Pipedrive) —
a BCC hack that depends on a third-party sync, can't see non-sequence inbound, and offers no
human-in-the-loop review (`feature-inventory.md` "Auto Bcc"; `ai-feature-deep-dive.md`
"Mechanism = a sidebar VIEW + record update + Auto-Bcc logging"). We **are** the CRM: capture is
native through `captureInboundEmail` (`lib/capture/email-capture.ts`) and writes an `activities`
row directly, with Lightfield's human-in-the-loop approval (`recordCapturedActivity`,
`lib/capture/approval.ts`) so a human can review before anything lands. No BCC, no external sync.

## Requirements (EARS)
- WHEN an inbound email is ingested (webhook / 15-min cron / force-sync), the system SHALL route
  it through `captureInboundEmail` so attribution and dedup cannot diverge across paths.
- The system SHALL resolve the sender to a contact (knownContactId → by sender email → auto-create
  under a known company per the CRM-graph rule) and record an `activities` row
  (`activity_type:'email_received'`, `channel:'email'`, `direction:'inbound'`).
- WHEN the tenant's `captureApprovalMode = 'review'`, the system SHALL park the proposed activity
  in `capture_approvals` (deduped on `sourceRef`) for a human to approve, and SHALL NOT insert the
  `activities` row until approved.
- WHEN the mode is `'auto'` (default) or `'hybrid'`, the system SHALL insert the activity now; in
  `'hybrid'` the interaction lands and only sensitive qualification fields wait (per
  `getFieldApprovalMode`).
- The system SHALL be idempotent on `messageId`/`gmailMessageId`: a message captured by one path
  is never re-inserted by another.
- The system SHALL NOT promote a machine-sent sender (`noreply@`, newsletter, `Auto-Submitted`)
  to a first-class person-contact; the activity is still captured against the company when the
  domain is known, else left `unresolved_sender`.
- The system SHALL surface, in the inbox, a non-blocking review affordance when a capture is
  pending (count + "Review captures") and a one-click "Add to CRM" for an unresolved/unknown sender.
- The system SHALL show provenance on every captured row as "Captured by Elevay", never a provider
  name, and SHALL hard-scope all reads/writes to the viewer's tenant + mailbox.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a tenant in `auto` mode AND an inbound from a known contact WHEN ingested THEN an
  `activities` row (`email_received`) is created and appears on the contact timeline immediately.
- GIVEN a tenant in `review` mode WHEN the same email arrives THEN a `capture_approvals` row is
  created (`status:'pending'`), NO `activities` row exists yet, and the inbox shows a pending count.
- GIVEN a pending capture WHEN the user approves it THEN the proposed activity is inserted verbatim
  and the approval is marked `approved` with `reviewedByUserId`.
- GIVEN the same `messageId` arrives twice (webhook then cron) WHEN processed THEN exactly one
  activity (or one pending approval) exists — `reason:'duplicate'` on the second.
- GIVEN a `noreply@` newsletter from an unknown domain WHEN ingested THEN no contact is created and
  the result is `unresolved_sender` (no orphan activity).
- GIVEN an unknown human sender at an unknown domain WHEN opened in the inbox THEN an "Add to CRM"
  CTA captures them (creating the company+contact+activity), gated by the same approval mode.
- GIVEN two tenants WHEN captures run THEN no tenant ever sees the other's captured activity or
  pending approval.

## Edge cases & failure handling
- ISO date crossing an Inngest step boundary → `normalizeSyncDate` coerces the string back to a
  Date so the insert never dead-letters (the original silent-loss bug).
- Capture-approval mode toggled mid-stream → already-inserted rows stay; new ones follow the new mode.
- Sender resolves to a soft-deleted contact → treated as unresolved (deleted_at guard).
- Embedding/RAG ingest fails → capture still succeeds (embedding is non-blocking, fire-and-forget).
- Approval rejected → interaction discarded, no activity, audit kept (`status:'rejected'`).
- Bulk re-sync after an outage → dedup on `sourceRef` prevents a flood of duplicate approvals.
- Multi-mailbox user → activity is attributed and only visible to the mailbox owner (`user-scope`).

## Best-in-class bar
- **Native capture, no BCC**: we write the interaction directly to our own graph — Superhuman can
  only BCC an external CRM and never sees non-sequence inbound. Ours captures *every* attributable
  interaction (the Lightfield ~95%-recall bar) and feeds chat/RAG.
- **Human-in-the-loop is built in**: the same `review`/`hybrid`/`auto` dial Lightfield is built on,
  reusing `recordCapturedActivity` — competitors log blindly or not at all.
- **One seam, all paths**: webhook, cron, and force-sync share `captureInboundEmail`, so attribution
  can never drift again.

## Design sketch
- **Data:** `activities` (`db/schema/core.ts:235` — `entity_type/id`, `metadata`, `thread_id`,
  `leadClassification`); `capture_approvals` (`db/schema/core.ts:270` — `kind`, `sourceRef`,
  `proposedActivity`, `status`, `appliedActivityId`, `reviewedByUserId`).
- **API:** `captureInboundEmail` (`lib/capture/email-capture.ts:179`) →
  `recordCapturedActivity` (`lib/capture/approval.ts:80`); callers `app/api/email/sync/route.ts`,
  the EmailEngine webhook, `inngest/sync-functions.ts`. New: `GET /api/inbox/captures/pending`
  (reuse `listPendingApprovals`, scoped) + `POST /api/inbox/captures/:id/{approve|reject}` (reuse
  `approveCapture`/`rejectCapture`). "Add to CRM" for unknown sender → a thin route that calls
  `captureInboundEmail` with `contactCreationMode` honoured.
- **UI:** a list-header chip "Review captures (N)" in `app/(dashboard)/inbox/page.tsx` opening a
  light review drawer (card `--color-bg-card`, `--shadow-floating`, lucide `Inbox`/`Check`/`X`,
  shortcut `g` then `r`); an inline "Add to CRM" button in the G01 sidebar for unknown senders
  (`--color-accent`, lucide `UserPlus`). Provenance line "Captured by Elevay" (`--color-text-tertiary`).
  Light+dark via tokens, no emoji, no provider name, every capture cited.
- **AI:** none for capture itself; the `leadClassification` verdict (deterministic-v1) already
  travels on `metadata` and gates auto-creation. (LLM relationship verdict is a future tranche.)
- **Security/perf:** tenant + mailbox scope on every read; dedup on `messageId`; non-blocking embed.

## Tasks (ordered)
1. `GET /api/inbox/captures/pending` + approve/reject routes, reusing `listPendingApprovals` /
   `approveCapture` / `rejectCapture`, hard-scoped to tenant+user. (verify: review-mode email shows
   pending, approve inserts) (test: route test — pending→approve→activity exists)
2. "Review captures (N)" header chip + review drawer in the inbox. (verify: browser — pending count
   renders, approve removes it) (test: component render)
3. "Add to CRM" CTA for unknown sender wired to `captureInboundEmail` (honours `contactCreationMode`
   + machine-sent gate). (verify: unknown human sender → contact+activity created) (test: capture
   path test — known/unknown/machine cases)
4. Provenance line "Captured by Elevay" on captured rows; confirm no provider string anywhere.
   (verify: grep UI for provider names → none) (test: snapshot asserts copy)

## Current-state notes (VERIFY before building — code moves)
- `captureInboundEmail` (`lib/capture/email-capture.ts:179`) already does dedup
  (`:200`), contact resolution (`:216`), the CRM-graph auto-create rule (`:282`), machine-sent gate
  (`classifyInboundSender`, `:189`), and routes through `recordCapturedActivity`. **Reuse, don't
  rebuild.**
- `recordCapturedActivity` (`lib/capture/approval.ts:80`) implements auto-insert vs queue-for-review
  with `sourceRef` dedup; `listPendingApprovals`/`approveCapture`/`rejectCapture` exist (`:123`–`:181`).
- Capture mode resolved via `getCaptureApprovalMode` (`approval.ts:29`); `hybrid` + per-field via
  `getFieldApprovalMode` (`:44`).
- No inbox-facing pending-captures endpoint or review drawer exists yet (grep: none under
  `app/api/inbox/captures`). The capture engine is complete; only the **inbox surface** is missing.
- Tenant + mailbox scoping helper: `lib/inbox/user-scope.ts` (`getInboxScope`).
