# Office hours — Unified multi-mailbox inbox ("augmented inbox")

Date: 2026-06-14
Owner: Martin
Status: planning (this doc) → per-slice Kiro specs follow in this folder

## Problem statement (one sentence)

A single user who runs outreach from many mailboxes (e.g. 15) needs ONE
centralized inbox page that shows every mailbox together, tells them which box
each conversation belongs to, and behaves like a real augmented mail client
(Superhuman-class) — not the per-mailbox triage list we ship today.

## Premise challenge

- "We have nothing centralized" — FALSE. The read-model already aggregates ALL
  of a user's mailboxes: `getInboxScope(tenantId, userId)` collects every
  `connected_mailboxes` row the user owns (a SET of addresses + ids), and
  `scopeConversationRows` keeps inbound to ANY of them + outbound from ANY of
  them. 15 boxes already merge into one feed. (`lib/inbox/user-scope.ts:42`)
- "Sync can't handle 15 boxes" — FALSE for IMAP/SMTP. The cron enumerates every
  `smtp_custom` active mailbox and syncs each, attributing the owner via
  `connected_mailboxes.user_id`, inbound captured with `metadata.to` = that
  box. (`inngest/sync-functions.ts:916`)
- So this is NOT an architectural rewrite. The data + sync are already
  multi-mailbox. The gaps are UI (no per-box visibility) + a few real-inbox
  features + the OAuth-at-scale connect path.

## Verified current state (read live, 2026-06-14)

- `/settings/mailboxes` → redirects to `/settings/mail-calendar`. Connecting
  many boxes works TODAY only via "Other provider (IMAP/SMTP)" (one
  `connected_mailboxes` row per POST, unlimited). Google/Microsoft OAuth is
  wired as the LOGIN identity (`auth.ts:222`, `allowDangerousEmailAccountLinking:false`)
  → effectively one OAuth mailbox per user. 15 Gmail-via-OAuth needs a new
  "add mailbox via OAuth, decoupled from login" flow.
- Inbox read path: `loadConversationRows(tenantId)` (tenant-wide) →
  `scopeConversationRows(rows, scope)` (per-user filter) → `buildConversations`
  → lanes (attention/snoozed/done/handled) + Outbound tab. 3 endpoints share
  the seam: `api/inbox/conversations`, `.../detail`, legacy `api/inbox`.
- `ConversationListItem` (`_types.ts`) carries NO mailbox field. No per-box
  sidebar/filter/chip/counts.
- Capture is CRM-gated: `captureInboundEmail` drops unknown senders not in the
  CRM graph → a real outreach inbox would miss cold replies.
- No read/unread concept. No full-text search. No compose-new (reply only).

## Layer check

- Layer 1 (tried & true): IMAP/SMTP sync, master-detail inbox, keyboard nav —
  already in repo, reuse.
- Layer 2 (new & popular): Superhuman feature grammar (command palette, split
  inbox, send later, snippets, reminders, Ask AI / instant reply, read status,
  undo send). Grounded via 2026 reviews (sources in chat). Adopt selectively.
- Layer 3 (first principles): the centralized multi-mailbox VIEW + attribution
  is the genuinely-load-bearing primitive; build it first and well.

## Decomposition — lakes (ship now) vs ocean (flag)

### Phase 1 — Centralized multi-mailbox cockpit  [target 10/10]
- **L1. Mailbox attribution in the read-model** (pure, no migration): derive the
  owning mailbox per conversation (inbound `metadata.to` ∈ my addresses → that
  box; else outbound `mailboxId`/`from`). Add `mailboxId/mailboxAddress/
  mailboxLabel` to `Conversation` + `ConversationListItem` + detail. Unit-tested
  like `user-scope.test.ts`. ← FOUNDATION, build first.
- **L2. Per-mailbox navigation** on `/inbox`: left rail "All inboxes" + each box
  with per-box attention counts; `?mailbox=<id>` filters lanes; "received on X"
  chip per row.
- **L3. Multi-mailbox copy/empty-states**: "Connect another mailbox", N boxes,
  the personal-vs-shared copy stays honest.

### Phase 2 — Real-inbox essentials (the 4 picked)  [target 8–9/10 each]
- **L4. Capture-all inbound**: show EVERY reply incl. unknown senders (loosen the
  CRM gate). Open design Q: relax `captureInboundEmail` to always store vs. a
  dedicated `inbox_messages` store. Likely a migration. → own Kiro spec.
- **L5. Unread/read state**: per-user read markers (migration). New concept.
- **L6. Instant search**: full-text over subject/body/from (ILIKE → tsvector).
- **L7. Compose new**: compose modal + send from a chosen box via existing
  `smtp-send`/`owner-mailbox` infra (not just thread reply).

### Phase 2.5 — Connect at scale
- **L8. OAuth-multi-add**: "add a Gmail/Microsoft mailbox" decoupled from login,
  each stored as its own `connected_mailboxes` row + per-mailbox token. Only if
  Martin's boxes are OAuth (he said: mix / TBD → build IMAP-first, then this).

### Phase 3 — Augmented (Superhuman-class)  [OCEAN — flag, prioritize per-item]
Command palette (Cmd-K) · Send Later / scheduled send · Follow-up reminders
("remind me if no reply") · Snippets/templates (shared) · Split inbox
(VIP/newsletter/team) · Undo send · Ask-AI over inbox + Instant Reply / auto-
draft (partial: prepared drafts + chat exist) · Auto-summarize (partial:
threadIntelligence exists) · Read receipts (partial: outbound `openedAt`) ·
Offline. Each is its own milestone; none blocks Phase 1–2.

## Build order & autonomy

Build L1 → L2 → L3 (Phase 1 cockpit) first; it's the unambiguous core of the
ask and valuable regardless of how Phase 2/3 land. Each L = its own branch,
test, eval, merge-on-PASS. Phase 3 stays flagged until Martin prioritizes.
