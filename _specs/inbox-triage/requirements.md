# INBOX-TRIAGE — Requirements

## User story

As a founder doing founder-led sales, when I open Inbox I want to see the conversations that need my judgment first — each one readable in full, explained (why it needs me), pre-prepared (agent draft ready), and dismissable (done/snooze) — so that processing my pipeline's email takes minutes, not a hunt across truncated table cells.

## Glossary

- **Conversation**: all messages sharing a `threadId` (inbound rows from `activities` where `activityType='email_received'`, outbound rows from `outbound_emails`). Fallback grouping key when threadId is null: `contact:<contactId>`, else `email:<id>`.
- **Lane**: one of `attention` (open, needs human), `handled` (agent auto-processed: ooo / unsubscribe / bounce / automated), `snoozed`, `done`.
- **Triage state**: per-conversation row in `inbox_triage` (tenant_id + conversation_key unique): status open/done/snoozed, done_at, snoozed_until.

## Acceptance criteria

### R1 — Conversation list (master)
- GIVEN inbound activities and outbound emails exist for the tenant, WHEN I open /inbox, THEN I see a left-hand conversation list grouped into lanes, defaulting to **Needs attention**, each row showing: contact name (or from-address), subject, one-line snippet, time ago, and a **reason line** derived only from persisted labels (intent / replyClassification / sentiment), e.g. "Meeting request · 2h ago", "Objection: pricing", "Question".
- GIVEN two conversations in `attention`, WHEN both are open, THEN ordering is by priority bucket (meeting_request/interested > question/info > objection > neutral) then most-recent-inbound first.
- GIVEN more than 30 conversations in a lane, WHEN I scroll to the end, THEN a "Load more" control fetches the next page (no silent truncation).

### R2 — Reading pane (detail)
- GIVEN I select a conversation, WHEN the pane opens, THEN I can read **every message in full** (no clamp), chronological, with direction clearly distinguished, sender, and timestamp.
- GIVEN the conversation's latest activity carries `metadata.threadIntelligence`, THEN a context section shows buying signals (with their evidence quote), objections (with status), next steps, and urgency. GIVEN no intelligence exists, THEN the section is absent (never placeholders, never invented).
- GIVEN the contact is known, THEN the contact name links to /contacts/[id].

### R3 — Triage verbs
- WHEN I click Done (or press `e`), THEN the conversation moves to `done` and the next conversation is selected.
- WHEN I snooze (tomorrow / 3 days / next week), THEN it moves to `snoozed` and reappears in `attention` after snoozed_until.
- GIVEN a conversation marked done, WHEN a **new inbound** message arrives after done_at, THEN it reappears in `attention` (reopen rule computed at read time: lastInboundAt > done_at).
- Keyboard: `j`/`k` move selection, `e` done, `r` reply. Keys are ignored while typing in an input/textarea/contenteditable.

### R4 — Reply with the agent's draft
- GIVEN reply-handler has created a draft (`outbound_emails.status='draft'` for the same contact, created after the last inbound), WHEN I open the conversation, THEN the draft is shown as "Prepared reply" with one click to open it in the composer (editable, sent as me via /api/emails/send).
- GIVEN no prepared draft exists, WHEN I click Reply, THEN /api/emails/suggest-reply pre-fills the composer (brief tone) addressed to the prospect; on suggest failure the composer opens blank (never a dead end).
- WHEN a reply is sent from a conversation whose prepared draft was used, THEN that draft row is marked `skipped` so it cannot be double-sent later.

### R5 — Actions beyond reply
- GIVEN the contact has an `active` or `paused` sequence enrollment, THEN a "Stop sequence" action sets it to `completed` (existing PUT /api/sequences/[id]/enroll).
- A "Book meeting" action reuses the Call Mode scheduler (POST /api/meetings/book) for the focal contact.

### R6 — Handled-by-agent lane
- GIVEN inbound classified `ooo` or `unsubscribe` (or a bounced outbound), THEN the conversation lands in the collapsed **Handled** lane with a one-line statement of what the pipeline actually did ("Sequence rescheduled to ~Jun 17", "Added to opt-out list", "Bounced — sending stopped"), sourced from real pipeline behavior, not narrative.
- The Handled lane never mixes into `attention` counts.

### R7 — Outbound monitoring is secondary, not the default
- The existing sent-emails table remains available under an **Outbound** tab (statuses, steps, opens/clicks), unchanged in behavior, with working pagination.

### R8 — Classification persistence (silent-bug fix)
- GIVEN processReply classifies a reply, THEN the classification is persisted to `outbound_emails.reply_classification` (today it is computed and dropped; outcome-detector reads an always-null column).

## Edge cases

- Inbound with no matched contact (metadata.from only) → renders with the raw address; reply still works.
- Thread with only outbound messages → belongs to Outbound tab, not attention.
- Conversation with threadId null → grouped per contact; multiple no-thread contacts never merge.
- Same conversationKey done then snoozed → latest action wins (single row, upsert).
- Empty mailbox / no connected mailbox → empty state explains how mail lands here (existing copy reused).
- inbox_triage table missing in an environment → API returns 500 with a clear error (fail loudly; migration is a deploy prerequisite).
- Draft reply exists but contact email differs from inbound from-address → composer uses the inbound from-address.

## Evaluation steps (Phase 6)

1. Seed/verify a tenant with inbound activities of varied intents (interested, question, objection, ooo) + outbound thread.
2. Verify lane assignment, ordering, reason lines against the seeded labels.
3. Open a conversation: full bodies visible, intelligence section only when metadata has it.
4. Done → disappears; simulate newer inbound (occurred_at > done_at) → reappears.
5. Snooze → in snoozed lane; set snoozed_until in the past → back in attention.
6. Reply via prepared draft → /api/emails/send called, draft marked skipped.
7. Keyboard j/k/e/r; verify no hijack while typing in composer.
8. Outbound tab unchanged + paginates.
9. `npx vitest run` from app/apps/web green; `tsc` green.
