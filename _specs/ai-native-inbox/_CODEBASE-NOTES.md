# Inbox codebase map (verified 2026-06-16) — anchor for every spec

VERIFY line numbers before building (code moves); the structure is current.

## Capture / ingestion
- `lib/integrations/imap.ts` — IMAP poll. `:124` `body = parsed.text || parsed.html`
  (**discards HTML when a text part exists** — the rendering root cause). Returns
  `{ gmailMessageId, threadId, from(text), to[], cc[], subject, snippet, body, date, direction }`.
  Direction = inbound unless `from == mailbox address`.
- `lib/capture/email-capture.ts` — `captureInboundEmail(input)`: dedup on
  `metadata.messageId|gmailMessageId`; resolves contact (knownContactId → by sender email →
  auto-create under known company); returns `unresolved_sender` if no contact/company.
  Writes activity `activity_type:"email_received"`, `channel:"email"`, `direction:"inbound"`,
  `metadata:{ messageId, threadId, from, to, subject, snippet }` via `recordCapturedActivity`
  (auto-insert or queue for review per capture-approval mode).
- `inngest/sync-functions.ts` — scheduled multi-provider sync. Sentiment/intent enrichment
  pass writes `sentiment`, `intent` (column) and merges `metadata` (JUST FIXED this session:
  JSONB `||` merge — it previously clobbered `metadata.to`, orphaning inbound; see PR #260).
- `app/api/email/sync/route.ts` — "Force sync now": Gmail inline (`captureInboundEmail`,
  passes `toHeader`), dispatches `email/sync-requested` for `smtp_custom` + Microsoft.

## Read model
- `lib/inbox/load.ts` — `loadConversationRows(tenantId)`: inbound = `activities` WHERE
  `activity_type='email_received' AND deleted_at IS NULL` (500 cap, desc occurred_at), mapped to
  `{ id, threadId, contactId(entityType=contact?entityId), occurredAt, summary, rawContent,
  metadata, sentiment, intent }`; outbound = `outbound_emails` WHERE `sentAt NOT NULL`; triage =
  `inbox_triage`. `contactNameMap` resolves names.
- `lib/inbox/user-scope.ts` — `getInboxScope(tenantId, authCtx.userId)` reads `connected_mailboxes`
  WHERE `user_id = authUserId` → `{ hasMailbox, addresses(lowercased email_address), mailboxIds,
  mailboxes[] }`. `inboundBelongsToUser` = `metadata.to` addresses ∩ user addresses.
  `outboundBelongsToUser` = `mailbox_id ∈ user's` (fallback from_address). `scopeConversationRows`
  filters before assembly. No mailbox → empty inbox (`mailboxConnected:false`).
- `lib/inbox/conversations.ts` — `buildConversations({inbound,outbound,triage})`:
  groups by `conversationKeyFor` (threadId → `contact:<id>` → `email:<id>`); a group with 0 inbound
  and not bounced is dropped (Outbound tab). Lanes: `attention | handled | snoozed | done`
  (handled = ooo/unsubscribe/bounce; triage done/snoozed computed with reopen). `reason` =
  `REASON_BY_LABEL[topLabel]` else `"Replied"/"Positive reply"/"Negative reply"` (**sales-reply
  taxonomy** — `PRIORITY_BY_LABEL`/`REASON_BY_LABEL` ~lines 91/114; `HANDLED_LABELS` ooo/unsub).
  `ConversationMessage = { id, direction, from, to, subject, body, at, status, stepNumber }`
  (`body` = `rawContent ?? metadata.snippet` — **plain text**). `laneCounts`, `attributeMailbox`/
  `indexMailboxes` (per-mailbox rail) in `mailbox-attribution.ts`.

## API
- `GET /api/inbox/conversations` (`route.ts`): `getInboxScope` → `scopeConversationRows` →
  `buildConversations`; per-mailbox filter `?mailbox=`; `laneCounts`; returns `conversations`,
  `counts`, `mailboxes` rail, `mailboxConnected`. `/conversations/detail` (single thread, scoped),
  `/api/inbox` (Outbound tab, escaped-LIKE scope).
- `app/api/home/up-next/route.ts` — "Needs you" replies use the SAME scope (personal everywhere).

## UI
- `app/(dashboard)/inbox/page.tsx` — lanes (Needs attention/Snoozed/Done/Handled/Outbound),
  list + reading pane; empty state "Connect your mailbox" → `/settings/mail-calendar`.
- `_conversation-list.tsx` — list rows: `snippet` (`:99`) + `reason` badge (`:113`).
- `_conversation-pane.tsx` — reading pane: `reason` badge (`:277`); message body **plain text**
  at `:471` (`<p className="whitespace-pre-wrap">{m.body}`); a prepared-draft path exists (~140-168).
- `_outbound-table.tsx`, `_types.ts`.

## Schema (Drizzle)
- `connected_mailboxes` (`db/schema/outbound.ts`): `id, tenant_id, user_id(auth id), email_address,
  display_name, provider(gmail|outlook|smtp_custom), ee_account_id, imap_host/port, smtp_host/port,
  secret_encrypted, imap_last_uid, caldav_url, status(warming_up|active|…), …`.
- `activities` (`db/schema/core.ts`): `tenant_id, actor_type/id, entity_type/id, activity_type,
  channel, direction, occurred_at, metadata(jsonb), summary, raw_content, sentiment, thread_id,
  intent(text[]), deleted_at`.
- `outbound_emails`, `inbox_triage(conversation_key,status,done_at,snoozed_until)` (`outbound.ts`).

## Reusable adjacent systems (DON'T rebuild — compose)
- Call Mode cited prospect brief (career timeline + grounded company summary, jsonb-cached, fail-closed).
- `lib/collision/` (collision awareness), `lib/signals/freshness.ts` (signal TTL), role-status SSOT
  (role freshness), `lib/accounts/last-interaction.ts` (SSOT), sovereign visio/booking, sequences.

## Conventions (enforce in every spec)
- No emojis in UI (lucide icons; tests assert icon===""). No provider names shown ("sourced by
  Elevay" / "added manually"; unknown→null). Per-user + tenant scope mandatory. Every AI claim
  cited / "why". Sovereignty: smtp_custom/Zimbra/CalDAV path, EU/CH residency, zero-retention AI
  option. Bookings ≠ ARR; deal split; Pilae anti-creep. 100% test coverage goal; every bug → test.
