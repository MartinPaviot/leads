# INBOX-C10 — Scheduling-email drafter (real open slots, sovereign visio)
> Theme: T4 · Autonomy rung: proactive · Priority: P0
> Pillar: P3 writing / P5 GTM moat (cross)

## User story
As a founder, I want a reply that proposes my real open calendar slots and a sovereign meeting
link, so booking a call is one approved email — never a back-and-forth and never a Google Meet/
Teams room that contradicts our sovereignty pitch.

## Why (audit anchor)
Superhuman's Ask AI, asked to follow up about a demo, **checked the calendar and proposed real
dates** ("Wed June 17 / Thu June 18") inside the draft (`findings.md` §I screenshot 028); its
Settings expose Meeting Links + Scheduling booking pages (`feature-inventory.md` §Calendar). The bar
is a draft that proposes **actual availability**. OUR edge: we already compute free slots
(`getAvailableSlots`, `meeting-booking.ts:19`) and mint a **sovereign Jitsi** room
(`video-meeting.ts`) written into the calendar's native fields — so the scheduling email proposes
real slots AND a sovereign link, and on acceptance books via `/api/meetings/book` (capacity-aware).

## Requirements (EARS)
- WHEN the user invokes "Propose times" on a thread (or a scheduling-request inbound triggers it via
  C03), the system SHALL draft a reply offering N real open slots from the user's connected calendar.
- The system SHALL compute slots from the user's actual free/busy (working-hours-bounded), and SHALL
  NOT offer a slot that is busy or outside the configured window.
- The proposed meeting SHALL use a **sovereign** video link by default (Jitsi via
  `getVideoMeetBaseUrl`/`video-meeting.ts`); the system SHALL NOT mint Google Meet/Teams rooms.
- The draft SHALL state the slots in the recipient's likely timezone (or both), and SHALL include the
  meeting purpose/duration appropriate to the deal stage (intro/qualification/deep-dive).
- WHEN a recipient accepts a slot (reply or click), the system SHALL book it via `/api/meetings/book`
  (capacity-aware, sovereign), write it to the CRM, and remove the offered slots from future drafts.
- The system SHALL keep proposed slots fresh: if a slot is taken before send (or before acceptance),
  the system SHALL re-fetch and never offer a now-busy slot (the "stays updated as calendar changes"
  behaviour, `feature-inventory.md` §Auto Drafts).
- The system SHALL draft in the user's voice (reuse `buildWritingStylePrompt`), be tenant/user-scoped,
  rate-limited, and honour zero-retention (INBOX-P03).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a connected calendar with free time WHEN "Propose times" is clicked THEN the draft lists real
  open slots (e.g. 3 × 30-min), each genuinely free, with a sovereign join link, in the user's voice.
- GIVEN a slot becomes busy between draft and send WHEN the user reviews THEN that slot is gone/replaced
  (re-fetched), never offered stale.
- GIVEN no calendar is connected WHEN invoked THEN the draft falls back to "share two or three windows
  that work for you" copy and prompts the user to connect a calendar — no fabricated availability.
- GIVEN the deal is at "deep-dive" stage WHEN drafting THEN the proposed duration/purpose matches and
  respects the weekly deep-dive capacity cap (`/api/meetings/book` `meetingType`/`override`).
- GIVEN a recipient accepts a slot THEN a sovereign meeting is booked, written to the CRM, and the slot
  is not re-offered.
- GIVEN the proposed link WHEN the invite is opened in any calendar THEN it shows a first-class join link
  (location/description/URL), not a proprietary widget.

## Edge cases & failure handling
- Multiple calendars / busy across accounts → union free/busy so no double-book.
- Timezone unknown for recipient → offer in the user's tz and label it clearly; optionally offer UTC.
- Capacity cap reached (deep-dive) → surface saturation; allow founder override per `/api/meetings/book`.
- Slot race (two prospects accept the same slot) → first booking wins; the second gets a re-propose.
- Sovereign host unset (`VIDEO_MEET_BASE_URL`) → still works via public Jitsi but flag non-sovereign in
  prod (the helper already warns); never silently use Meet/Teams.
- Zero-retention → draft + computed slots not persisted beyond the request.
- Multi-tenant: calendar + booking strictly within the viewer's tenant/user scope.

## Best-in-class bar
- The draft proposes **real, fresh, conflict-checked** slots from our own free/busy and books via our
  capacity-aware endpoint — Superhuman proposes dates but has no native, capacity-aware booking + CRM write.
- The meeting link is **sovereign by default** (Jitsi on EU/CH infra), written natively into the calendar
  fields — a category US inboxes (Meet/Teams only) structurally cannot offer.

## Design sketch
- **Data:** free/busy via `getAvailableSlots` (`meeting-booking.ts:19`, Google) — EXTEND to the sovereign
  path (CalDAV `lib/integrations/caldav.ts` / Microsoft) so non-Google users get real slots too.
  Bookings via `/api/meetings/book` → `bookSovereignMeeting` (`calendar-write.ts`); link via
  `video-meeting.ts`. Capacity via `lib/calendar/capacity.ts`.
- **API:** `POST /api/inbox/propose-times` `{ conversationKey, durationMinutes?, count? }` → `{ body,
  slots[], citations }` (slots carry start/end + a one-click accept token). Acceptance → existing
  `/api/meetings/book`. Re-validate slots at send/accept.
- **UI:** a "Propose times" action in `_conversation-pane.tsx` (`CalendarPlus` lucide icon — already used
  for "Book meeting" at `:303`), producing a draft with selectable slot chips; surface = inline card
  `--color-bg-card`, `--shadow-panel`. Light+dark via tokens, no emoji, no provider name; slots cited to
  "your calendar (via Elevay)".
- **AI:** `claude-sonnet-4-6` via `tracedGenerateObject` to phrase the scheduling email in the user's
  voice around the computed slots (the slots themselves come from the calendar, not the model — no
  hallucinated times); `_trace.agentId="propose-times"`.
- **Security/perf:** rate-limited; slot re-validation before send/accept; tenant/user scope; zero-retention honoured.

## Tasks (ordered, each with verify + test)
1. Extend slot computation to sovereign calendars (CalDAV/Microsoft) so `getAvailableSlots` works
   non-Google; union busy across accounts. (verify: real slots for a CalDAV user; no busy slot offered)
   (test: `available-slots.test.ts` multi-provider + conflict).
2. `POST /api/inbox/propose-times`: compute slots → voice-phrased draft with sovereign link + accept tokens.
   (verify: 200 with real slots + sovereign URL) (test: route test incl. no-calendar fallback).
3. Slot freshness + acceptance → `/api/meetings/book` (capacity-aware) → CRM write → remove offered slot.
   (verify: accept books sovereign meeting + writes CRM; taken slot re-proposes) (test: book + freshness test).
4. UI action + slot chips in `_conversation-pane.tsx`. (verify: browser — draft lists real slots, books on
   accept, invite shows sovereign join link) (test: UI test).
5. Zero-retention + scope + non-sovereign-host warning. (verify: P03 → nothing stored; unset base URL warns)
   (test: retention/scope/sovereignty test).

## Current-state notes (VERIFY before building — code moves)
- Availability EXISTS but Google-only: `getAvailableSlots(userId, opts)` (`lib/integrations/meeting-booking.ts:19`)
  queries Google freebusy via `getCalendarClient`. Sovereign users need CalDAV/Microsoft slot support (extend).
- Sovereign visio EXISTS: `lib/integrations/video-meeting.ts` (Jitsi, `VIDEO_MEET_BASE_URL`, warns on public
  host in prod) — the meeting MUST use this, never Meet/Teams.
- Booking EXISTS: `POST /api/meetings/book` (`meetings/book/route.ts`) → `bookSovereignMeeting`
  (`calendar-write.ts`), capacity-aware (`lib/calendar/capacity.ts`, `meetingType`/`override`/`conferencing`).
- Voice few-shot EXISTS (`lib/writing-profile.ts`). No inbox "propose times" endpoint exists yet.
