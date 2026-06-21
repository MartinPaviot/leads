# Inbox Shell Redesign — Requirements (EARS)

Goal. Rebuild the Elevay inbox shell to faithfully reproduce Upstream email-client
information architecture (app.upstream.do, captured live 2026-06-20): a left
email-folder sidebar + a top split-tab strip (two nav axes), a full-width dense
list, and a full-screen thread view that replaces the list. Founder directive:
match Upstream; do NOT preserve the triage-lane model for its own sake. Where
Upstream has a folder/concept we lack, map it to existing data, build the backend,
or omit it — explicitly, per requirement.

Verified against live code (feat/inbox-ai-draft worktree, 2026-06-20). Anchors are
file:line. Tags: [DONE] shipped, do NOT re-spec / [NEW] frontend-IA gap, no backend /
[NEW-backend] needs route/column/job / [OMIT] out of scope or deferred / [LOCKED]
stack decision, do NOT reopen.

---

## R0 — Mapping: every Upstream folder + split to our data

Have = data exists and is surfaced; Partial = data exists, not surfaced as this
folder; New backend = no data; Omit = not built now.

| Upstream sidebar item | Elevay equivalent | Status | Anchor |
|---|---|---|---|
| Inbox | attention lane | Have | conversations.ts:330, _inbox-folders.tsx:155 |
| Needs Reply | needs_reply split | Have | splits.ts:35, conversations.ts:491 |
| Follow Ups | follow_ups split | Have | splits.ts:36, followup-due.ts |
| Starred | none (no star field) | New backend | inbox_triage has no star col (outbound.ts:389) |
| Snoozed | snoozed lane | Have | conversations.ts:341, _inbox-folders.tsx:156 |
| Sent | outbound (OutboundTable) | Have | page.tsx:867, _outbound-table.tsx |
| Drafts | AI prepared drafts (status=draft) | Partial | outbound_emails.status (outbound.ts:305); no folder-list route |
| Scheduled | held+holdUntil / scheduledSendAt | Partial | outbound.ts:310, outbound.ts:169; worker residual |
| All Mail | union of all lanes (no filter) | New | route filters per-lane (conversations/route.ts:150) |
| Spam / Trash | none | Omit | no spam/trash model; out of scope |
| Footer promo card | none | Omit | growth surface, not IA |

| Upstream split tab | Elevay equivalent | Status | Anchor |
|---|---|---|---|
| Primary | attention minus other splits | Partial | needs a primary bucket; today other (splits.ts:39) |
| Needs Reply (n) | needs_reply split | Have | splits.ts:35 |
| Follow Ups | follow_ups split | Have | splits.ts:36 |
| Promotions (n) | promotions split | Have | splits.ts:37, splitCounts |
| Social | social split | Have | splits.ts:38 |
| Qonto (n) custom | custom per-sender split | Have | resolveCustomSplit (splits.ts:84), /api/inbox/splits |
| Noise (n) | noise flag (no split id) | Partial | conversations.ts:551; counted (route.ts:255), no tab |

---

## R1 — Two-axis layout (folder sidebar + split-tab strip)

- R1.1 [DONE] THE SYSTEM SHALL render a left vertical email-folder sidebar
  (InboxFolders, _inbox-folders.tsx:131) listing built-in mailbox folders top to
  bottom, each with a live count chip.
- R1.2 [NEW] THE SYSTEM SHALL order the sidebar to match Upstream: Inbox, Needs
  Reply, Follow Ups (intention folders promoted above the divider), a divider, then
  Starred, Snoozed, Sent, Drafts, Scheduled, All Mail — replacing the current
  attention/snoozed/outbound/done/handled order (_inbox-folders.tsx:155-160).
- R1.3 [NEW] THE SYSTEM SHALL render the intention splits (Needs Reply / Follow Ups)
  as top-tier sidebar rows, not under a Splits group header, matching the Upstream
  sidebar (_inbox-folders.tsx:162-184 currently nests them).
- R1.4 [NEW] THE SYSTEM SHALL render a horizontal split-tab strip above the
  conversation list as the SECOND nav axis — Primary, Needs Reply (n), Follow Ups,
  Promotions (n), Social, custom, Noise (n) — each a small colored icon + count chip.
  This strip does not exist today (no top tab band; page.tsx:884 jumps to the list div).
- R1.5 [NEW] WHEN the user selects a split tab, THE SYSTEM SHALL filter the list to
  that split over the attention lane via the existing split= param
  (conversations/route.ts:124-149) — reusing the wired backend, no route change.
- R1.6 [NEW] THE SYSTEM SHALL keep the sidebar and the split strip in sync: selecting
  Needs Reply in either axis SHALL drive the same activeSplit state (page.tsx:84,
  page.tsx:841) so the two axes never disagree.
- R1.7 [DONE] THE SYSTEM SHALL render the search field; THE SYSTEM SHALL promote it
  from inside the sidebar (_inbox-folders.tsx:137) to a full-width bar spanning the
  content area above the split strip (see R4).
- R1.8 [LOCKED] THE SYSTEM SHALL keep the split engine, lane assignment, and
  importance scoring server-side and signal-composed (no new LLM call): splits.ts,
  conversations.ts:262. Do NOT reopen the classification model.

## R2 — Full-width list + full-screen thread

- R2.1 [NEW] WHILE no thread is open, THE SYSTEM SHALL render the conversation list at
  full content width, replacing the current behavior that narrows it to w-[380px]
  whenever a row is selected (page.tsx:886).
- R2.2 [NEW] WHEN the user opens a conversation, THE SYSTEM SHALL show the thread
  full-screen, replacing the list (Upstream /threads/<id>), instead of the current
  side-by-side list + ConversationPane split (page.tsx:1003).
- R2.3 [NEW] THE SYSTEM SHALL drive open/closed thread state from the URL
  (/inbox/threads/<key> or a deep-linkable ?thread=<key>) so a thread is shareable and
  back-navigable; today selection is in-memory only (selectedKey, page.tsx:104).
  Design picks the exact form (design.md section 3).
- R2.4 [NEW] WHEN the user invokes back / archive / trash from the thread toolbar, THE
  SYSTEM SHALL return to the full-width list at the prior scroll position. Today there
  is no thread-level back/archive/trash toolbar; the pane shows triage verbs inline.
- R2.5 [DONE] THE SYSTEM SHALL preserve j/k navigation, e done, r reply, x select,
  hover-prefetch and the command palette (page.tsx:618-719) under the new layout —
  these are behavior, not chrome.
- R2.6 [NEW] WHILE the list is full-width, THE SYSTEM SHALL keep j/k to move the
  focused row, Enter/click to enter the full-screen thread, and Esc to leave it.

## R3 — Row anatomy (Upstream single-line density)

- R3.1 [DONE] THE SYSTEM SHALL render each row as one fixed-height 44px single line:
  checkbox(hover) + avatar + bold sender + bold subject + muted snippet + right-aligned
  relative time (_inbox-row.tsx, globals.css:32).
- R3.2 [NEW] THE SYSTEM SHALL render an unread blue dot on the LEFT of unread rows
  (Upstream). Today the left dot is a priority/importance dot only on the attention
  lane (_inbox-row.tsx:97-103); there is no unread signal.
- R3.3 [NEW-backend] THE SYSTEM SHALL expose a per-conversation unread boolean for the
  row dot. No read/seen-per-conversation state exists today (seen-store.ts tracks only
  a single last-seen marker, conversations/route.ts:208). May be derived from last-seen
  vs lastInboundAt as a stopgap (design.md section 4).
- R3.4 [DONE] THE SYSTEM SHALL keep sender + subject at weight 700 and the snippet at
  weight 400 / 60% on one truncated line (_inbox-row.tsx:104-114, teardown/12).
- R3.5 [NEW] THE SYSTEM SHALL show the hover checkbox at the row far left and per-row
  quick actions (archive/snooze/done) on hover at the far right (teardown/12). Today
  only the checkbox toggles on hover (_inbox-row.tsx:75-93); no right-side actions.

## R4 — Top full-width search bar

- R4.1 [NEW] THE SYSTEM SHALL render a full-width search bar spanning the content area
  at the top (right of the sidebar), with the existing debounced q= search wired to it
  (page.tsx:113-222, conversations/route.ts:120).
- R4.2 [NEW] THE SYSTEM SHALL place an Upgrade to Pro affordance + user avatar at the
  top-right of this bar (Upstream). The upgrade pill may be a visual stub; billing is
  [OMIT] here.
- R4.3 [DONE] THE SYSTEM SHALL keep search filtering across ALL lanes (not just the
  open one) when a query is active (conversations/route.ts:127).

## R5 — Starred (new backend)

- R5.1 [NEW-backend] THE SYSTEM SHALL persist a per-conversation star toggle
  server-side (a starred/starred_at column on inbox_triage or a sibling table) — no
  such field exists (outbound.ts:389-403).
- R5.2 [NEW-backend] THE SYSTEM SHALL surface a Starred sidebar folder listing starred
  conversations across all lanes, with a live count.
- R5.3 [NEW] THE SYSTEM SHALL render a star toggle on the row (hover) and in the thread
  toolbar.
- R5.4 [OMIT-now] Until R5.1 ships, the Starred folder SHALL be omitted from the
  sidebar rather than shown empty/broken (the visual slice ships without it).

## R6 — Drafts folder (partial to backend)

- R6.1 [DONE] THE SYSTEM SHALL store inbox reply drafts as outbound_emails.status=draft
  and consume them on send (/api/inbox/drafts/[id]/consume).
- R6.2 [NEW-backend] THE SYSTEM SHALL provide a Drafts folder list route returning the
  unsent status=draft reply rows (subject, snippet, thread key, updatedAt). No such
  list endpoint exists (only per-id consume).
- R6.3 [NEW] THE SYSTEM SHALL render a Drafts sidebar folder with a live count;
  selecting it lists drafts and opening one re-enters the composer with the draft body.
- R6.4 [OMIT-now] Until R6.2 ships, the Drafts folder SHALL be omitted from the visual
  slice.

## R7 — Scheduled folder (partial to backend)

- R7.1 [DONE] THE SYSTEM SHALL model held/scheduled sends via
  outbound_emails.status=held + holdUntil (CLE-11, outbound.ts:310) and the send-later
  timing math (send-later.ts).
- R7.2 [NEW-backend] THE SYSTEM SHALL provide a Scheduled folder list route returning
  the pending scheduled/held sends with their send time; confirm the worker actually
  releases held rows before promising user scheduling (teardown notes it residual).
- R7.3 [NEW] THE SYSTEM SHALL render a Scheduled sidebar folder with a count; selecting
  it lists pending sends with cancel/reschedule affordances.
- R7.4 [OMIT-now] Until R7.2 ships, the Scheduled folder SHALL be omitted from the
  visual slice.

## R8 — All Mail, Noise split, Primary

- R8.1 [NEW] THE SYSTEM SHALL render an All Mail sidebar folder listing every
  conversation regardless of lane (no lane filter). The route filters per-lane today
  (conversations/route.ts:150); All Mail needs a lane=all pass-through (no new model —
  skip the lane predicate).
- R8.2 [NEW] THE SYSTEM SHALL add a Noise split tab backed by the existing noise flag +
  noiseCount (conversations.ts:551, conversations/route.ts:255) so noise is a
  first-class tab, not only a demotion.
- R8.3 [NEW] THE SYSTEM SHALL add a Primary split = attention rows not in Needs Reply /
  Follow Ups / Promotions / Social / Noise / custom (today the fallthrough is other,
  splits.ts:39); relabel other to Primary and order it first in the strip.

## R9 — Thread view as a collaborative object (scope guard)

- R9.1 [DONE] THE SYSTEM SHALL keep the existing thread affordances — AI draft
  (Ctrl/Cmd+J), assignment, notes, labels, summary, comments (_thread-*.tsx,
  _conversation-pane.tsx) — inside the new full-screen view.
- R9.2 [NEW] THE SYSTEM SHALL render a thread top toolbar (back, archive, trash, more;
  right side: add-channel/comment) wrapping those existing actions, matching the
  Upstream thread chrome (teardown/07). Layout, not new logic.
- R9.3 [OMIT] Emoji quick-reactions and rename-thread / channels (Upstream
  collaborative extras, teardown/07) are out of scope for the shell redesign; track
  separately.

## Non-goals (THE SYSTEM SHALL NOT)

- NG1 THE SYSTEM SHALL NOT re-implement the split classification model, lane
  assignment, importance scoring, noise heuristics, or SLA/follow-up math — all shipped
  and locked (conversations.ts, splits.ts).
- NG2 THE SYSTEM SHALL NOT build Spam or Trash folders (no model; [OMIT]).
- NG3 THE SYSTEM SHALL NOT build billing/upgrade flows behind the Upgrade to Pro pill —
  visual affordance only.
- NG4 THE SYSTEM SHALL NOT preserve done/handled as primary sidebar folders purely to
  keep the old model; they regress to secondary (reachable, de-emphasized) since
  Upstream has no equivalent top-level folders.
- NG5 THE SYSTEM SHALL NOT ship Starred / Drafts / Scheduled as empty shells — each
  waits on its backend (R5-R7) and is omitted from the visual slice.
