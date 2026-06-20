# Requirements — inbox-list-and-thread (Upstream-faithful, expert-PM)

## Problem (one sentence)

Opening a thread in Elevay shows a wall of intelligence cards before the email
itself; Upstream opens on the subject + the message — the inbox feels "années
lumières" away because the reading view buries the email under analysis.

## Goal

Make the list + reading view read like a calm email client (Upstream/Superhuman)
while keeping Elevay's intelligence (signals, brief, next action) one click away,
never deleted. Email-first, intelligence-on-demand.

## In scope

- Reading view (`_conversation-pane.tsx`) re-layout: email-first, intelligence
  collapsed into an openable panel; compact toolbar; bigger subject; composer
  placeholder exposing the ⌘/Ctrl+J AI-draft affordance.
- List row (`_inbox-row.tsx`) polish: bold sender when unread, multi-select
  checkbox revealed on hover, column alignment.

## Out of scope

- Full-screen thread (founder: "on s'en fou du plein écran" — keep split pane).
- New backend/data; no prod migration (reference_prod-schema-behind-drizzle).
- Changing the intelligence pipeline itself — only its placement in the UI.

## Acceptance criteria (GIVEN/WHEN/THEN)

### R1 — Email-first reading view
- GIVEN a thread with persisted intelligence (signals/brief/action items),
  WHEN I open it, THEN the FIRST scrollable content under the header is the
  message body (the email), NOT an intelligence card.
- GIVEN a thread, WHEN it opens, THEN the subject renders at 18–20px bold as the
  top element of the header (Upstream hierarchy).
- Edge: a thread with NO intelligence renders identically minus the panel toggle
  (no empty "Intelligence" affordance shown).

### R2 — Intelligence on demand
- GIVEN a thread that HAS intelligence, WHEN it opens, THEN an "Intelligence"
  toggle (count-badged) is present and the cards are COLLAPSED by default.
- WHEN I click the toggle, THEN the intelligence cards (signals, brief, action
  items, next action, key details, objections, competitors) expand in place.
- Exception (stay visible, condensed): a `preparedDraft` and a `nextAction`
  remain surfaced above the messages (highest actionable value) even when the
  panel is collapsed — but condensed to one line each.
- Edge: the toggle state is per-open (resets when switching threads); a thread
  with intelligence opens collapsed every time (calm default).

### R3 — Compact toolbar
- GIVEN a thread, WHEN it renders, THEN the primary actions live in a compact
  icon toolbar (Reply/Generate-draft, Snooze, Done, ⋮ overflow), not 8 wrapping
  buttons. Secondary actions (Book meeting, Assign, Labels, Stop sequence) move
  into the ⋮ overflow or the intelligence panel.
- The Reply/Generate-draft primary action stays a labeled button (discoverable).

### R4 — Composer AI affordance
- GIVEN the composer is closed, WHEN a reply-worthy thread is open, THEN the
  reply entry point shows "⌘/Ctrl+J to draft with AI" as its hint/placeholder.
- GIVEN the composer opens, THEN ⌘/Ctrl+J behaviour is unchanged (it already
  drafts; this only makes it discoverable).

### R5 — List: unread weight
- GIVEN an unread conversation, WHEN the row renders, THEN the sender name is
  bold (font-semibold) and the unread dot shows; a read row uses normal weight.

### R6 — List: multi-select on hover
- GIVEN a row at rest, THEN no checkbox is visible; WHEN I hover the row OR any
  row is selected for bulk, THEN a checkbox appears in the leading column
  (replacing/overlaying the avatar area), Upstream-style.
- Existing bulk-select behaviour (if any) is preserved; this only governs reveal.

## Non-functional

- No regression in the 341 inbox tests; new behaviour gets tests.
- Build green (tsc + next build) AND verified live on :3007 (build-green ≠
  runtime-works — reference_prod-schema-behind-drizzle).
- No prod migration, no query on schema-only columns/enums.
