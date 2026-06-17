# INBOX-N03 — Do-not-disturb / focus mode
> Theme: T10 · Autonomy rung: helper · Priority: P2
> Pillar: P4 triage

## User story
As a founder doing deep work or a call, I want a focus mode that silences inbox notifications and
strips the inbox down to only what matters — so I'm not interrupted, and when I come back I get
the calm summary of what I missed instead of a wall of pings.

## Why (audit anchor)
Superhuman's focus discipline is "hide empty Split Inboxes" + a quiet, get-to-zero surface and a
deliberate notification model (`findings.md` §B "Hide empty Split Inboxes", §F; `feature-inventory.md`
— Triage → Hide Empty Split Inboxes). The bar: a mailbox that *reduces* itself on demand and holds
its interruptions. Ours adds a true DND that gates the smart-notification pipeline (INBOX-N01) and
flushes a missed-while-focused summary on exit — turning focus from a cosmetic filter into a real
attention contract.

## Requirements (EARS)
- The system SHALL provide a focus mode the user can toggle on/off instantly, and optionally
  schedule (e.g. recurring 09:00–12:00 local, or "until end of my next meeting").
- WHEN focus mode is active, the system SHALL suppress live inbox notifications (INBOX-N01) across
  all channels (in-app banner, email, Slack), queuing qualifying ones for the focus-end summary.
- WHEN focus mode is active, the system SHALL still record the underlying `notifications` rows
  (so nothing is lost) but SHALL NOT surface them as live/unread-badge interruptions until exit.
- WHEN focus mode ends (toggle off or schedule elapses), the system SHALL deliver a single
  "while you were focused" summary of what was queued (count + the top items, deep-linked), not a
  burst of individual notifications.
- The system SHALL hide empty inbox lanes/splits while focus mode is on (the "hide empty splits"
  behaviour), and MAY narrow the inbox to a single "Important only" view (INBOX-T04 threshold).
- The system SHALL NOT suppress scheduled digests (INBOX-N02) — the Morning Brief / Wrap are the
  calm summaries focus mode is meant to encourage — but SHALL still honour channel preferences.
- The system SHALL persist focus state per-user (and its schedule) so it survives reloads and is
  consistent across the user's devices/sessions.
- The system SHALL show a clear, dismissible indicator that focus mode is on (so the user never
  silently misses things), with a one-click "exit focus".
- The system SHALL keep focus state per-user/tenant-scoped; one user's focus never affects another.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN focus mode is on WHEN a qualifying important reply arrives THEN no live notification/email/
  Slack fires; the item is queued.
- GIVEN focus mode then turns off WHEN exited THEN one "3 replies while you were focused" summary
  appears with the top items deep-linked, not 3 separate pings.
- GIVEN focus mode is on WHEN the user opens the inbox THEN empty lanes are hidden and the view is
  narrowed to important items.
- GIVEN a scheduled focus block 09:00–12:00 WHEN it is 09:00 local THEN focus auto-activates and a
  visible indicator shows; at 12:00 it auto-exits and flushes the summary.
- GIVEN focus mode is on WHEN the Morning Brief's scheduled time arrives THEN the Brief is still
  delivered (digests are exempt), honouring its channel prefs.
- GIVEN the user toggles focus off manually mid-block WHEN exited THEN the queued summary flushes
  immediately and the schedule does not re-activate until its next occurrence.
- GIVEN focus mode is on across a reload WHEN the page reloads THEN focus is still on (persisted).
- GIVEN two users WHEN one enables focus THEN the other's notifications are unaffected.

## Edge cases & failure handling
- Focus on with nothing queued at exit → no summary (don't send "0 missed").
- Overlapping schedule + manual toggle → manual action wins for the current block; schedule resumes
  next occurrence.
- Long focus block with a large queue → the exit summary caps items (top N) with "+M more → inbox".
- Browser closed during a scheduled block → focus state is server-persisted, so the suppression
  still applies to email/Slack; in-app reflects it on next load.
- Timezone/DST for scheduled blocks → evaluate in the user's tz each time; never fire an hour off.
- A truly urgent override (optional) → allow a per-user "let SLA breaches through focus" toggle
  (INBOX-N04) so a hard SLA breach can still ping; default off.
- DND must not break the unread-count integrity → counts still increment in the data; only the
  live interruption is held, so re-entering shows the correct unread state.

## Best-in-class bar
- Focus is a real **attention contract**, not a cosmetic filter: it gates the actual notification
  pipeline (INBOX-N01) and **flushes one cited summary** on exit — Superhuman hides empty splits but
  has no unified "hold my pings and brief me after" mechanism.
- It **reuses** the notification-preferences + smart-notification gate, so suppression is a single
  flag the existing dispatcher already checks — minimal surface, no parallel muting system.

## Design sketch
- **Data:** `notification_preferences.preferences.focus` = `{ active:boolean, until:ISO|null,
  schedule:[{days, start, end}]|null, narrowInbox:boolean, allowSlaBreach:boolean }`. The
  focus-end queue reuses the already-written `notifications` rows tagged (e.g.
  `metadata.deferredByFocus=true`) so nothing is duplicated; the summary reads those.
- **API:** `POST /api/inbox/focus` to toggle/schedule (writes the preference);
  the INBOX-N01 dispatcher checks `focus.active` (or schedule-in-window) before live delivery and,
  if focused, marks the row deferred instead of sending email/Slack/live badge. `GET
  /api/inbox/focus/summary` returns the queued items for the exit summary. A coarse reuse of the
  INBOX-N02 sweep evaluates scheduled focus windows (no new minute-cron).
- **UI:** a focus toggle in the inbox header (`page.tsx`) and the command palette (INBOX-K01),
  lucide `Moon` / `MoonStar`, shortcut e.g. `shift+f`. Active state shows a slim banner ("Focus on
  · exit") using `--color-accent-soft` + `--color-text-secondary`. When on, the lane list hides
  empty lanes and (if `narrowInbox`) filters to important. The exit summary renders as one
  `NotificationBell` entry / a light toast (`--color-bg-card`, `--shadow-floating`) with deep
  links. Light+dark via tokens, no emoji, no provider name.
- **AI:** none (deterministic gating + summary count); the per-item "why" reuses INBOX-N01's line.
- **Security/perf:** per-user preference; suppression is a cheap flag check in the existing
  dispatcher; scheduled windows evaluated in the digest sweep (cost-safe, no extra cron);
  unread-count data integrity preserved (only live surfacing is deferred).

## Tasks (ordered, each with a verify step + test to write)
1. `focus` preference shape on `notification_preferences` (+ a `POST /api/inbox/focus`). (verify:
   round-trip persists active/schedule) (test: route — toggle, schedule stored)
2. Gate INBOX-N01 live delivery on `focus.active`/schedule-in-window; tag deferred rows. (verify:
   focus-on suppresses email/Slack/badge, still writes row) (test: gate integration)
3. `GET /api/inbox/focus/summary` + focus-end flush (one summary, capped). (verify: exit yields one
   summary of queued items) (test: summary unit — empty→none, N→one capped)
4. Hide-empty-lanes + optional narrow-to-important in the inbox when focused. (verify: browser —
   empty lanes vanish, view narrows) (test: render)
5. Header toggle + command-palette action + active banner + indicator. (verify: browser — toggle
   on/off, banner shows, exit) (test: render)
6. Scheduled focus windows evaluated in the INBOX-N02 sweep (tz-correct). (verify: 09:00 local
   auto-on, 12:00 auto-off + flush) (test: window unit)
7. Optional "let SLA breaches through" override (INBOX-N04). (verify: with override, a breach pings
   through focus) (test: integration with N04)

## Current-state notes (VERIFY before building — code moves)
- Notification suppression hook point: the dispatcher path `sendNotification`
  (`lib/emails/notifications.ts:34`) already branches on `notification_preferences`; focus adds one
  more gate (deferred-instead-of-deliver). Preferences table `db/schema/outbound.ts:425`
  (JSONB `preferences` `:435`).
- In-app bell + unread count: `components/notification-bell.tsx` (badge `:192`, poll `:96`); the
  exit summary surfaces here. Read endpoint `app/api/notifications/route.ts`.
- Inbox header / lane rendering to add the toggle + hide-empty behaviour:
  `app/(dashboard)/inbox/page.tsx` (lanes Needs attention/Snoozed/Done/Handled/Outbound). NOTE the
  page currently has NO focus/DND control and NO hide-empty-lane logic — VERIFY.
- Scheduled-window evaluation should ride the INBOX-N02 `inbox-digest-sweep` (same coarse cron),
  not a new cron (Inngest cost-reduction).
- Depends on INBOX-N01 (the gate it suppresses) and pairs with INBOX-N04 (the one allowed override).
- No focus mode exists today.
