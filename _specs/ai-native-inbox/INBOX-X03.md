# INBOX-X03 — Shared threads (live presence)
> Theme: T8 · Autonomy rung: helper · Priority: P2
> Pillar: cross (P4 triage + collaboration)

## User story
As a member about to reply to a shared conversation, I want to see when a teammate is
already viewing or drafting on the same thread, so we don't send two replies or step on
each other's draft — and I want to deliberately share a specific thread (or a draft of it)
with a teammate for a second pair of eyes.

## Why (audit anchor)
Superhuman's composer offers **"Share draft"** and the thread action bar offers
**Share** (`findings.md:32` action bar "Share · Done · Snooze"; deep-dive composer
"Send · Smart Send · Remind me · **Share draft**", `ai-feature-deep-dive.md:81`). The
team value is **live awareness** — knowing a colleague is on the same thread. We don't
imitate the look; we render presence in Elevay's DNA and ground "who's here" in the same
**member identity + real activity attribution** we already use for collision, so presence
and our after-the-fact collision notice are two views of one truth.

## Requirements (EARS)
- WHEN a member opens a shared conversation, the system SHALL register a lightweight,
  expiring "viewing" presence for that `conversation_key` and SHALL show other members
  currently viewing the same conversation (avatar/name chips).
- WHEN a member starts a reply/draft on a shared conversation, the system SHALL upgrade
  their presence to "drafting" and SHALL surface that state to other viewers ("Alice is
  drafting a reply").
- Presence SHALL expire automatically (heartbeat TTL) so a closed tab or crash clears it
  within a bounded interval; the system SHALL never show a stale "viewing" forever.
- The system SHALL let a member explicitly **share a thread** with a chosen teammate,
  creating a notification that deep-links to that conversation (reuse the mention/notify spine).
- The system SHALL let a member **share a draft** (a not-yet-sent reply) with a teammate for
  review, surfacing it on the thread for that teammate without sending it to the counterparty.
- Presence and sharing SHALL be tenant-scoped and restricted to members/admins of shared
  mailboxes; a **viewer** MAY appear as "viewing" (read presence) but SHALL NOT share a thread
  or draft (write-gated).
- The system SHALL NOT expose presence on a **personal** mailbox — a personal conversation has
  no other authorized viewer, so presence there is suppressed entirely.
- WHEN two members are drafting on the same thread, the system SHALL warn the second drafter
  ("Alice is also drafting") so a deliberate decision is made before both send.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a shared conversation open in two members' inboxes WHEN both are viewing THEN each sees
  the other's presence chip on that thread.
- GIVEN I start a reply WHEN a teammate is viewing the same thread THEN their pane shows "You are
  drafting" state for me within the heartbeat interval.
- GIVEN a teammate closes the thread / their tab WHEN the TTL elapses THEN their presence chip
  disappears (no stale presence).
- GIVEN a thread I want reviewed WHEN I "Share with @Bob" THEN Bob gets a notification linking to
  the thread, and the counterparty receives nothing.
- GIVEN a draft I want checked WHEN I "Share draft with @Bob" THEN Bob sees my unsent draft on the
  thread and no email is sent until I send it.
- GIVEN a viewer WHEN they open a shared thread THEN they may appear as viewing but the Share /
  Share-draft actions are absent and a POST is rejected.
- GIVEN a personal-mailbox conversation WHEN opened THEN no presence chips render (suppressed).
- GIVEN two members drafting the same thread WHEN the second opens the composer THEN a non-blocking
  "Alice is also drafting" notice shows (reinforcing the collision discipline).

## Edge cases & failure handling
- Heartbeat endpoint flaps / offline → presence simply doesn't render (fail-soft); the user can still
  read and reply; no error surfaced. (Consistent with the machine-network-flap reality on this stack.)
- Same user in two tabs → coalesced to one presence entry (keyed by `users.id`, not tab).
- Drafting presence but the draft is discarded → presence downgrades to "viewing" on next heartbeat,
  then expires.
- Shared draft references a thread that gets archived/done → the shared-draft surface degrades to a
  link; never dangles.
- Presence on a mailbox that flips shared→personal mid-session → presence for non-owners clears on the
  next heartbeat (scope re-evaluated server-side).
- Multi-tenant: presence keys carry `tenant_id`; a `conversation_key` is never trusted cross-tenant.
- Privacy: presence is intentionally coarse (viewing/drafting + identity + timestamp) — never the draft
  *contents* unless explicitly "Share draft"-ed.

## Best-in-class bar
- Presence is grounded in the **same member graph + activity attribution** as collision (INBOX-G06):
  live "Alice is here now" + after-the-fact "Alice emailed them yesterday" are one coherent story, not
  two disconnected features.
- "Share draft" surfaces an **unsent** draft for review with zero risk of send — the internal review
  path is structurally separate from the send path (like internal comments in INBOX-X02), so a shared
  draft can never accidentally go to the customer.
- Sovereignty: presence is a lightweight self-hostable heartbeat (no third-party realtime SaaS),
  consistent with the Pilae deployment target — a "live" feature that still runs on your own infra.

## Design sketch
- **Data:** ephemeral presence — `inbox_presence(tenant_id, conversation_key, user_id, state
  (viewing|drafting), last_seen_at)` with `unique(tenant_id, conversation_key, user_id)`; rows are
  TTL-swept (last_seen_at older than the heartbeat window are treated as gone, swept by a light cron
  or on read). Shared-thread / shared-draft reuse the `inbox_comment`/notification spine from INBOX-X02
  (a "shared with you" notification + an optional draft payload), rather than a new store.
- **API:** `POST /api/inbox/presence { conversationKey, state }` (heartbeat upsert, member+, tenant-
  scoped, shared-mailbox only), `GET /api/inbox/presence?conversationKey=…` (who's here now, fresh
  rows only). `POST /api/inbox/share { conversationKey, toUserId, draftBody? }` → notification fan-out
  (reuse INBOX-X02's notify path). All viewer-write-blocked by `viewer-guard.ts:37`.
- **UI:** presence chips in the `_conversation-pane.tsx` header (next to assignee chip from INBOX-X01)
  and a small marker on the `_conversation-list.tsx` row; "Share" / "Share draft" actions in the pane
  action bar + composer. Surface = pane header chips + action bar; tokens `--color-accent-soft`
  (viewing), `--color-warning-soft` (drafting), `--color-text-secondary`; lucide `Eye` (viewing) /
  `PenLine` (drafting) / `Share2` (share). No keyboard shortcut needed for presence (passive); Share =
  in the existing action bar. Light + dark via tokens, no emoji, no provider name, cited (chip tooltip
  shows the member name + "viewing since HH:MM").
- **AI:** none.
- **Security/perf:** presence is coarse + TTL'd (no draft contents leaked); heartbeat is cheap (single
  upsert) and read returns only fresh rows; everything tenant-scoped + shared-mailbox-gated; a flap just
  hides presence (no hard dependency).

## Tasks (ordered)
1. Migration: `inbox_presence` table (+ unique key + last_seen index). (verify: drizzle apply clean)
   (test: schema-shape test)
2. Presence heartbeat upsert + fresh-only read, TTL sweep on read; member+ + shared-mailbox scope.
   (verify: two sessions see each other; closing one clears it after TTL) (test: route test incl. TTL
   freshness + viewer-write block)
3. "Share thread" / "Share draft" via the INBOX-X02 notify spine (no send path touched). (verify: share
   → teammate notified, counterparty receives nothing) (test: an assertion that share never enqueues an
   `outbound_emails` row)
4. Presence chips + drafting notice in pane/list; suppress on personal mailboxes. (verify: browser — two
   inboxes, live chips; personal mailbox shows none) (test: dom test for chips + personal suppression)

## Current-state notes (VERIFY before building — code moves)
- No presence/realtime table exists in `db/schema/*`; this is the first live-presence surface. Keep it
  ephemeral + TTL-swept (no growth).
- This spec DEPENDS on INBOX-X01 (the `shared` flag + scope widening) and INBOX-X02 (the comment/notify
  spine) — build those first; presence + share reuse them.
- Collision is the after-the-fact twin (`lib/collision/recent-touch.ts`, `ContactCollisionNotice`) —
  presence is the live twin; both key on `users.id` and tenant.
- The reading pane is `_conversation-pane.tsx`; assignee chip lands in its header from INBOX-X01; presence
  chips sit beside it. List rows: `_conversation-list.tsx`.
- Machine-network-flap reality on this box (reference memory) → presence MUST be fail-soft; never block
  read/reply when the heartbeat can't reach the server.
