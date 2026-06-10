# INBOX-TRIAGE — Design

## System fit

Everything this feature shows is already produced by the existing pipeline; the feature is a read-model plus one small state table:

```
gmail/outlook/imap sync (sync-functions.ts)
  └─ activities (email_received, sentiment, intent[], threadId, rawContent)
  └─ reply detection → outbound_emails.repliedAt/replySnippet → email/reply-received
       └─ processReply (functions.ts): classify → pauseEnrollment("replied"),
          OOO reschedule, unsubscribe opt-out  [FIX: also persist reply_classification]
            └─ reply/classified → reply-handler.ts: generates DRAFT reply rows
                                   (outbound_emails.status='draft', step+100)
  └─ thread-intelligence.ts → activities.metadata.threadIntelligence

NEW read model:  lib/inbox/conversations.ts (pure assembly + lanes + ordering)
NEW state:       inbox_triage table (done/snoozed per conversation_key)
NEW API:         GET /api/inbox/conversations, GET /api/inbox/conversations/[key],
                 POST /api/inbox/triage, POST /api/inbox/drafts/[id]/consume
UI:              /inbox master-detail; old table kept as the Outbound tab
```

## Data model

### New table (migration `0071_inbox_triage.sql`)

```sql
CREATE TABLE IF NOT EXISTS "inbox_triage" (
  "id" text PRIMARY KEY,
  "tenant_id" text NOT NULL REFERENCES "tenants"("id"),
  "conversation_key" text NOT NULL,
  "status" text NOT NULL DEFAULT 'open',          -- open | done | snoozed
  "done_at" timestamptz,
  "snoozed_until" timestamptz,
  "updated_at" timestamptz DEFAULT now(),
  CONSTRAINT "inbox_triage_tenant_key_uq" UNIQUE ("tenant_id", "conversation_key")
);
CREATE INDEX IF NOT EXISTS "inbox_triage_tenant_idx" ON "inbox_triage" ("tenant_id");
```

Drizzle schema added to `db/schema/outbound.ts`. Reopen is **computed, not stored**: a `done` row with `done_at < lastInboundAt` reads as open. Snooze expiry likewise (`snoozed_until <= now()` reads as open). One upsert per verb, no reopen writes needed.

### Conversation key

`threadId` when present, else `contact:<contactId>`, else `email:<activityId|outboundId>`. Encoded in URLs as-is (text), validated server-side per tenant.

## Pure assembly module — `lib/inbox/conversations.ts`

Input (plain rows, injected — fully unit-testable):
- inbound: `{id, threadId, contactId, occurredAt, summary, rawContent, metadata, sentiment, intent[]}`
- outbound: `{id, threadId, contactId, subject, bodyText, sentAt, status, repliedAt, replyClassification, bounceType, stepNumber, toAddress, fromAddress, enrollmentId}`
- triage rows, now()

Output: `Conversation[]` with `{key, lane, priority, subject, contactId, displayName, fromAddress, snippet, reason, lastInboundAt, lastMessageAt, messages[], intelligence|null, counts}`.

### Lane + priority rules (deterministic, label-driven only)

```
handled  : last inbound intent includes out_of_office/unsubscribe
           OR replyClassification in (ooo, unsubscribe)
           OR conversation's last outbound bounced
attention: has >=1 inbound AND effective triage = open
snoozed  : triage snoozed AND snoozed_until > now AND no newer inbound
done     : triage done AND done_at >= lastInboundAt
```

Priority buckets inside attention (1 = top):
1. `meeting_request` / `interested` (classification or intent)
2. `question` / `pricing_inquiry` / `demo_request` / info requests
3. `objection_*` / `objection` intent
4. everything else (neutral)
Tie-break: lastInboundAt desc.

### Reason line

Template lookup from the winning label, never free text:
`meeting_request→"Meeting request"`, `interested→"Interested"`, `question→"Asked a question"`, `pricing_inquiry→"Asked about pricing"`, `objection_price→"Objection: pricing"`, `objection_timing→"Objection: timing"`, `objection_competitor→"Objection: competitor"`, `objection_authority→"Objection: authority"`, `out_of_office→"Out of office — sequence rescheduled"`, `unsubscribe→"Unsubscribed — added to opt-out list"`, bounce→"Bounced — sending stopped". Fallback: sentiment ("Positive reply"/"Replied"). Time-ago appended client-side.

## API contracts

### GET `/api/inbox/conversations?lane=attention|handled|snoozed|done&page=N`
Loads the tenant's inbound activities + outbound emails (both capped at the most recent 500 rows each — assembly is in-memory), contact names, triage rows; returns `{conversations (light: no message bodies), counts: {attention, handled, snoozed, done, outbound}, pagination}` for the requested lane (pageSize 30).

### GET `/api/inbox/conversations/detail?key=...`
Returns one conversation with full `messages[]` (bodies), `intelligence` (from latest activity `metadata.threadIntelligence`, validated shape), `enrollment` (`{id, sequenceId, status}` active/paused for the contact), `preparedDraft` (`{id, subject, body}` = latest outbound_emails status='draft' for the contact created after lastInboundAt), `contact {id, name, email}`.

### POST `/api/inbox/triage`
Body `{conversationKey, action: "done"|"snooze"|"reopen", snoozeUntil?}`. Upserts (`onConflictDoUpdate` on tenant+key). `done` sets status=done+done_at=now; `snooze` requires future snoozeUntil; `reopen` sets status=open, clears timestamps. Returns the row.

### POST `/api/inbox/drafts/[id]/consume`
Marks a prepared draft (`status='draft'`, same tenant) as `skipped`. Called by the UI after a successful composer send that originated from that draft.

### processReply fix (R8)
In `classify-reply` step flow, after classification: `UPDATE outbound_emails SET reply_classification = <classification> WHERE id = <outboundEmailId>`. The event already carries `outboundEmailId` from sync-functions.

## UI — `app/(dashboard)/inbox/page.tsx` (rewrite) + `_conversation-pane.tsx`

```
PageHeader "Inbox"  [attention count subtitle]
FilterBar: [Needs attention (n)] [Snoozed (n)] [Done] [Handled (n)] [Outbound (n)]
┌───────────────────────────┬──────────────────────────────────────────┐
│ Conversation list (~38%)  │ Reading pane (~62%)                      │
│ row: name · timeago       │ header: name→/contacts/[id] · subject    │
│      subject              │ chips: sentiment, urgency                │
│      reason line (accent) │ actions: Reply · Book meeting · Stop seq │
│ selected = accent border  │          Done (e) · Snooze ▾             │
│ [Load more]               │ [Prepared reply card — Use draft]        │
│                           │ [Intelligence: signals+quotes,           │
│                           │  objections, next steps]                 │
│                           │ messages: full bodies, chronological,    │
│                           │  outbound indented + muted border        │
└───────────────────────────┴──────────────────────────────────────────┘
Outbound tab = existing table component (extracted to _outbound-table.tsx, + pagination)
```

Conventions honored: lucide icons only (no emoji), English chrome, tokens (`var(--color-*)`), `ls-table` for the Outbound tab, EmptyState component, no new heavy deps, no GPU effects. Keyboard handler on the page root checks `event.target` tagName/contenteditable before acting.

Reuses as-is: `EmailComposerPanel` (send as me), `CallActions` (call-mode booking widget — imported, it is self-contained), `Badge`, `EmptyState`, `PageHeader/FilterBar`.

## Failure handling

- LLM never called by this feature; absence of intelligence/labels degrades to neutral bucket + generic reason.
- Triage POST failures toast and revert optimistic UI.
- Detail fetch 404 (key vanished) → list refresh.
- suggest-reply failure → blank composer (existing pattern).
- Missing table → 500 surfaced, not swallowed (migration is a deploy gate).

## Security

- Every query tenant-scoped (`authCtx.tenantId`); conversationKey never trusted to cross tenants (all loads re-filter by tenant).
- Draft consume verifies tenant ownership of the row.
- No user-supplied HTML rendered: inbound `rawContent` is plain text rendered in `white-space: pre-wrap` (no dangerouslySetInnerHTML).

## Review-driven decisions (2026-06-10 code review)

- `inbox_triage` is **tenant-level by design**: the CRM is a shared workspace
  (like archive/restore and capture approvals), so one teammate finishing a
  conversation finishes it for the workspace. Revisit if multi-seat triage
  diverges.
- A classification label (`reply_classification`) is only trusted while it
  describes the LAST inbound message; a newer inbound supersedes it (prevents
  the permanent-handled trap for once-ooo threads).
- `processReply` accepts both `replyBody` (the sync pipeline's field) and
  `replyContent` (legacy) — reading only the latter dead-lettered every real
  classification.
- Lane fetches await any in-flight triage POST (tab-switch race).

## Documented gaps (vs 10/10)

- Composer replies don't set In-Reply-To/References headers (new SMTP thread). Follow-up: thread-aware deliverInteractiveEmail.
- preparedDraft is keyed by contact (reply-handler drafts carry no threadId); with two live threads for one contact the draft can be offered on the sibling thread.
- Handled lane shows what processReply did but offers no undo of the opt-out (Settings remains the place).
- Up-Next feed and inbox priorities not yet unified (shared lib makes it possible).
