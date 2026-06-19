# INBOX-CAL01 — Inline availability insertion (Share-Availability equivalent)
> Theme: T9 · Autonomy rung: helper · Priority: P0
> Pillar: P3 writing / P5 GTM moat (cross)

## User story
As a founder writing a reply, I want to drop my real open slots straight into the email body
in one click — already conflict-checked against my connected calendar — so booking a call is
one message, never a "when works for you?" round-trip and never a fabricated time.

## Why (audit anchor)
Superhuman ships **Share Availability** — booking pages generated from your calendar — surfaced
in the Latest Updates widget and the Calendar → Scheduling / Meeting Links settings
(`findings.md` §F; `feature-inventory.md` §Calendar). Its Ask AI, asked to follow up about a
demo, **read the calendar and proposed real dates inside the draft** ("Wed June 17 / Thu June
18", `findings.md` §I). The bar: insert real availability into the body. OUR edge: we already
compute free slots (`getAvailableSlots`, `meeting-booking.ts:19`) and have a multi-provider book
path; CAL01 is the **manual one-click insert** primitive (no LLM needed) — the lightweight
sibling of the agentic scheduler (CAL03) and the full scheduling-email drafter (INBOX-C10).

## Requirements (EARS)
- WHEN the user invokes "Insert availability" in the reply composer, the system SHALL insert N
  (default 3) real open slots from the user's connected calendar as plain text into the body at
  the cursor.
- The system SHALL compute slots from the user's actual free/busy, working-hours-bounded, and
  SHALL NOT insert a slot that is busy or outside the configured window (no fabricated times).
- The system SHALL render each slot in a stated timezone (the user's by default; the recipient's
  inferred tz, or UTC, when offered) and label the timezone explicitly.
- The system SHALL let the user pick the slot count (2–5), duration (15/30/45/60), and the date
  window before inserting; strong defaults (3 × 30 min, next 5 working days) require no config.
- The inserted text SHALL be editable plain prose (e.g. "Would any of these work? — Tue Jun 17
  at 2pm, Wed Jun 18 at 10am, or Thu Jun 19 at 3pm (CET)"), not a locked widget.
- WHEN no calendar is connected, the system SHALL NOT insert times; it SHALL insert a neutral
  "share two or three windows that work for you" line and prompt the user to connect a calendar.
- The system SHALL re-validate slots at insert time (fetch fresh free/busy), so a slot taken
  since the composer opened is never inserted.
- The system SHALL be per-user/tenant scoped (the slots come from the *viewer's* calendar only)
  and SHALL NOT persist the computed slots beyond the request (zero-retention, INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a connected calendar with free time WHEN "Insert availability" is clicked THEN 3 genuinely
  free 30-min slots appear in the body as editable text, each with an explicit timezone label.
- GIVEN a slot that is busy on the calendar WHEN availability is inserted THEN that slot is absent.
- GIVEN the user sets count=2 and duration=45 WHEN inserting THEN exactly two 45-min free slots
  are inserted, phrased "… or …".
- GIVEN no calendar is connected WHEN "Insert availability" is invoked THEN no times are inserted,
  a "share a couple of windows" line is offered, and a connect-calendar prompt appears.
- GIVEN a slot is booked elsewhere between opening the composer and clicking insert WHEN inserted
  THEN the now-busy slot is excluded (slots were re-fetched).
- GIVEN the inserted text WHEN the user edits a slot's wording THEN it remains free prose the user
  can change before sending.

## Edge cases & failure handling
- Multiple connected calendars / accounts → union busy across them so no double-book is offered.
- Recipient timezone unknown → insert in the user's tz, clearly labelled; optionally also offer UTC.
- All candidate slots busy in the window → widen the window by one step and tell the user no slots
  were free in the requested window (never silently insert nothing).
- Free/busy lookup fails or times out → insert nothing + show "couldn't read your calendar just now"
  (never fabricate times); the user can retry or type windows manually.
- Sovereign / non-Google calendar (CalDAV/Microsoft) → slots must still compute (see Design → reuse
  the CAL03 sovereign slot extension); until then, fall back to the no-times line, never to fake slots.
- Multi-tenant: free/busy is read strictly for the viewer's own calendar; never another user's.

## Best-in-class bar
- The slots are **real, fresh, conflict-checked** from our own free/busy and inserted as editable
  prose in the user's voice — Superhuman's Share Availability sends a booking-page *link*; we can do
  both, and inline insertion keeps the founder's warm, personal phrasing intact.
- Works on **sovereign / non-Google** calendars (CalDAV/Microsoft) — a category Superhuman (Google/
  MS SaaS only) and most inboxes can't insert real availability for.

## Design sketch
- **Data:** free/busy via `getAvailableSlots(userId, { daysAhead, slotDurationMinutes, windowStart,
  windowEnd })` (`lib/integrations/meeting-booking.ts:19`) — TODAY Google-only via `getCalendarClient`
  (`lib/integrations/calendar.ts:10`). For CalDAV/Microsoft users, reuse the CAL03 sovereign slot
  extension (CalDAV busy from `fetchCalDavMeetings`, `lib/integrations/caldav.ts:118`; Microsoft busy
  via Graph `getSchedule`). Slot prose via `formatSlotsForEmail(slots, count)` (`meeting-booking.ts:134`).
  No new table; nothing persisted.
- **API:** `GET /api/inbox/availability?count=&durationMinutes=&daysAhead=` → `{ slots: [{ startIso,
  endIso, formatted }], text, timezone, calendarConnected }`. Re-validates free/busy on every call.
- **UI:** an "Insert availability" control in the reply composer beside "Book meeting"
  (`_conversation-pane.tsx:303`), using the `CalendarClock` lucide icon (distinct from `CalendarPlus`
  used for Book); shortcut `g a` (go-availability) inside the composer. A small popover (surface
  `--color-bg-card`, border `--color-border-default`, `--shadow-panel`, `rounded-lg`, Inter
  `text-[12px]`) to pick count/duration/window; on confirm the text drops at the cursor. Slots are
  attributed "from your calendar (via Elevay)". Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** none — slots come from the calendar, not a model (no hallucinated times). The *phrasing* of
  the surrounding sentence is the user's; CAL01 only inserts the slot list. (Voice-matched whole-email
  drafting that *wraps* these slots is INBOX-C10.)
- **Security/perf:** rate-limited; per-user/tenant scope; zero-retention (computed slots not stored);
  free/busy re-validated at insert; works inside a Vercel Node function (short-lived calendar reads).

## Tasks (ordered, each with verify + test)
1. `GET /api/inbox/availability`: compute slots (Google via `getAvailableSlots`) + `formatSlotsForEmail`,
   return slots + text + timezone + `calendarConnected`. (verify: 200 with real free slots; no-calendar →
   `calendarConnected:false`, no times) (test: `inbox-availability.route.test.ts`, incl. no-calendar case).
2. Extend slot computation to CalDAV + Microsoft (shared with CAL03) so non-Google users get real slots;
   union busy across accounts. (verify: real slots for a CalDAV user; a busy slot is excluded) (test:
   `available-slots-multiprovider.test.ts`).
3. Composer "Insert availability" control + count/duration/window popover; insert text at cursor.
   (verify: browser — clicking inserts 3 editable free slots with a tz label) (test: composer UI test).
4. No-calendar fallback line + connect-calendar prompt; insert-time re-validation. (verify: no-calendar
   inserts the windows line; a slot taken before insert is excluded) (test: fallback + freshness test).
5. Zero-retention + scope. (verify: nothing persisted; only the viewer's calendar is read) (test:
   retention/scope test).

## Current-state notes (VERIFY before building — code moves)
- Availability EXISTS but **Google-only**: `getAvailableSlots(userId, opts)` (`meeting-booking.ts:19`)
  queries Google freebusy via `getCalendarClient` (`calendar.ts:10`, `authAccounts.provider="google"`).
  `formatSlotsForEmail(slots, count)` (`meeting-booking.ts:134`) already phrases the list. Sovereign
  users (CalDAV/Microsoft) need slot support (extend — shared with CAL03).
- The composer's existing "Book meeting" button (`_conversation-pane.tsx:303`, `CalendarPlus`, gated on
  `detail.contact`) is the sibling action; CAL01 adds an "Insert availability" control next to it.
- CalDAV busy data is reachable via `fetchCalDavMeetings` (`caldav.ts:118`) + `mapIcsToMeetings`
  (`caldav.ts:241`); Microsoft via `getMicrosoftAccessToken` (`calendar-microsoft.ts:75`) + Graph.
- No inbox availability endpoint exists yet. INBOX-C10 (scheduling-email drafter) wraps slots in a
  voice-matched whole email; CAL01 is the lighter manual-insert primitive — keep them distinct, share
  the slot computation.
