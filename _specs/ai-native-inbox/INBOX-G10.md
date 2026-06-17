# INBOX-G10 — Meeting-booked → CRM + sovereign visio
> Theme: T7 · Autonomy rung: proactive · Priority: P1
> Pillar: P5 GTM moat / P9 calendar (cross)

## User story
As a founder, when a prospect agrees to meet, I want to book the meeting straight from the thread —
onto whichever calendar I connected, carrying a sovereign open-source visio link (never Google Meet
or Teams) — and have it logged to the CRM as an interaction automatically, so the deal advances and
the prospect gets a join link that doesn't contradict the pitch.

## Why (audit anchor)
Superhuman does "event-from-email" + "Meeting Links / Scheduling" but mints proprietary US
conference rooms and logs to an *external* CRM via Auto-Bcc (`feature-inventory.md` "Calendar:
Meeting Links / Scheduling", "Auto Bcc"). We sell sovereignty: `lib/integrations/video-meeting.ts`
mints a Jitsi room (Apache-2.0, self-hostable, EU/CH host via `VIDEO_MEET_BASE_URL`) — never Meet/
Teams (CLOUD Act) — and `app/api/meetings/book/route.ts` writes the event to the user's connected
calendar (CalDAV/Microsoft/Google) and logs a `meeting_scheduled` activity natively. Booking from the
inbox is a thin surface over capabilities we already own; the sovereign visio + native CRM log is the
moat Superhuman can't match.

## Requirements (EARS)
- WHEN the user books a meeting from a thread, the system SHALL create the event on the user's
  connected calendar via `bookSovereignMeeting`, carrying a sovereign Jitsi join link by default
  (`conferencing:'sovereign'`), never a Google Meet/Teams room.
- The system SHALL log a `meeting_scheduled` activity (`channel:'meeting'`, `direction:'outbound'`)
  with `joinUrl`/`roomName`/`calendarProvider` in `metadata`, so the meeting appears on the account
  timeline (INBOX-G03) and counts as a real interaction.
- The system SHALL pre-fill the booking from the thread: contact (resolved counterparty), a default
  title, and a proposed time (from the prospect's stated availability when present, else the user's
  next free slot).
- The system SHALL respect the deep-dive weekly capacity cap when `meetingType:'deep_dive'` (enforced
  in the book route) and SHALL surface the saturation rather than silently exceeding it.
- WHEN no calendar/mailbox is connected, the system SHALL show the existing honest error ("Aucune
  boîte connectée … Réglages → Mail & Calendar"), never a dead link or a fabricated booking.
- The system SHALL insert the chosen visio link into the reply draft (INBOX-G08) so the prospect
  receives the join URL in the email, and SHALL keep the link as the calendar event's first-class
  meeting link.
- The system SHALL advance the deal/next action (INBOX-G05/G09) after a successful booking (offer
  "advance to demo/proposal"), gated by the autonomy dial.
- The system SHALL hard-scope to the viewer's tenant + the booking user; bookings/links SHALL never
  leak across tenants.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a connected calendar and a prospect who said "Tuesday works" WHEN the user books from the
  thread THEN an event is created Tuesday with a Jitsi join link, and a `meeting_scheduled` activity
  is logged on the contact.
- GIVEN the default conferencing WHEN a meeting is booked THEN the join link host is the configured
  sovereign Jitsi (or the meet.jit.si fallback with the prod warning), NEVER meet.google.com or
  teams.microsoft.com.
- GIVEN the booking succeeds WHEN the reply draft is shown THEN the join URL is inserted into the body.
- GIVEN `meetingType:'deep_dive'` and the weekly cap reached WHEN booking THEN the route returns 409
  with the cap/usage and the UI surfaces it (override only on explicit user action).
- GIVEN no connected mailbox WHEN booking THEN the honest "Aucune boîte connectée" error shows, no event.
- GIVEN a successful booking WHEN done THEN the meeting appears in the G03 timeline and the deal
  next-action offers to advance (gated).
- GIVEN two tenants WHEN bookings occur THEN no event/link/activity crosses tenants.

## Edge cases & failure handling
- Calendar write fails (CalDAV/Graph/Google error) → surface the error; no half-written activity
  (the activity is logged after the booking returns).
- Prospect proposed an ambiguous time → propose 2 concrete windows (mirror Call Mode script) rather
  than guessing one.
- meet.jit.si fallback in prod → still works (zero-setup) but logs the non-sovereign warning;
  sovereignty = setting `VIDEO_MEET_BASE_URL` to an EU/CH Jitsi.
- Contact has no email → booking is blocked (the route requires `contact.email`); prompt to add one.
- Timezone mismatch → store UTC; render in the user's + the inferred prospect locale.
- Double-book (user clicks twice) → idempotent on the proposed slot (room name is the idempotency handle).
- Recording/transcription (if enabled) correlates via `roomName` (sovereign-recording webhook) — out
  of scope here but the metadata link is preserved.

## Best-in-class bar
- **Sovereign by construction**: the join link is open-source Jitsi on EU/CH infra — the prospect
  never opens a CLOUD-Act Meet/Teams room mid-pitch. Superhuman can only mint proprietary US rooms.
- **Native CRM log, no BCC**: the meeting becomes a first-class interaction on our own timeline and
  advances the deal — Superhuman logs to an external CRM via BCC, blind to the deal.
- **Capacity-aware**: deep-dive bookings respect the founder's weekly cap (a real GTM constraint),
  surfaced not hidden.

## Design sketch
- **Data:** `activities` `meeting_scheduled` (`db/schema/core.ts:235`, written at
  `app/api/meetings/book/route.ts:150`); booking via `bookSovereignMeeting`
  (`lib/integrations/calendar-write.ts`); visio via `createSovereignMeeting`
  (`lib/integrations/video-meeting.ts:141`); capacity via `lib/calendar/capacity.ts`.
- **API:** reuse `POST /api/meetings/book` (`route.ts:43`) — pass `contactId` (resolved counterparty),
  `startTime`, `meetingType`, `conferencing:'sovereign'`. The inbox adds a thin wrapper that resolves
  the counterparty from `conversationKey` and proposes the time. Join URL fed into G08 draft.
- **UI:** a "Planifier une visio" action in the G01 sidebar / on a meeting_request reply (lucide
  `CalendarPlus`, `--color-accent`), a light time-picker popover showing proposed slots (`--color-bg-card`,
  `--shadow-floating`); confirmation shows the join link + "Lien souverain" note (`--color-text-tertiary`).
  Shortcut: a number key. Light+dark via tokens, no emoji, no provider name (no "Jitsi/Meet/Teams" in
  user copy — say "visio souveraine"), the booking cited as an interaction.
- **AI:** none for booking; the slot proposal may reuse the scheduling drafter (INBOX-C10) but the
  visio + log are deterministic. Autonomy: booking is a user action (Suggest/confirm), never silent.
- **Security/perf:** tenant + user scope; honest not-connected error; capacity 409; idempotent slot.

## Tasks (ordered)
1. Inbox booking wrapper: resolve counterparty from `conversationKey`, propose a time, call
   `POST /api/meetings/book` with `conferencing:'sovereign'`. (verify: books on the connected
   calendar with a Jitsi link + logs the activity) (test: route test — sovereign link asserted, no
   Meet/Teams host)
2. Insert the join URL into the G08 reply draft. (verify: draft body contains the join link) (test:
   draft-insert test)
3. "Planifier une visio" sidebar action + slot picker + confirmation with the sovereign-link note.
   (verify: browser — meeting_request reply → book → event + link shown) (test: render)
4. Capacity 409 surfacing + not-connected error + advance-deal handoff (G05/G09, gated). (verify:
   deep-dive cap → 409 surfaced; no calendar → honest error; booking offers stage advance) (test:
   capacity + not-connected + handoff cases)

## Current-state notes (VERIFY before building — code moves)
- `lib/integrations/video-meeting.ts`: `createSovereignMeeting` (`:141`) mints a Jitsi room; never
  Meet/Teams (CLOUD Act, `:1`); `NON_SOVEREIGN_HOSTS` guard (`:41`); `VIDEO_MEET_BASE_URL` for the
  sovereign host (default meet.jit.si with prod warning, `:43`). **Reuse.**
- `POST /api/meetings/book` (`app/api/meetings/book/route.ts:43`): books via `bookSovereignMeeting`,
  default `conferencing:'sovereign'` (`:37`), deep-dive capacity gate (`:76`), honest not-connected
  error (`:138`), logs `meeting_scheduled` with `joinUrl`/`roomName`/`calendarProvider` (`:150`).
  **Reuse — do not write a parallel booker.**
- The activity is read by the G03 timeline (`meeting_scheduled` ∈ `INTERACTION_ACTIVITY_TYPES`,
  `lib/accounts/last-interaction.ts:18`).
- Sovereign visio + multi-provider calendar write is the [Sovereign visio booking] project (MEMORY):
  Jitsi host `visio.pilae.ch`, CalDAV/Graph/Google write, ICS. Confirm `bookSovereignMeeting`'s
  current signature before wiring (it moves).
- No inbox booking surface exists yet (grep: `/api/meetings/book` not invoked from `_conversation-pane.tsx`).
- UI DNA: no provider names — user copy says "visio souveraine", never "Jitsi"/"Meet"/"Teams".
