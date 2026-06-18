# INBOX-CAL02 — One-click book / event-from-email
> Theme: T9 · Autonomy rung: helper · Priority: P0
> Pillar: P5 GTM moat / P3 writing (cross)

## User story
As a founder reading a thread where a prospect proposes a time ("Thursday at 3 works"), I want
one click to turn that email into a booked meeting — on my connected calendar, with a sovereign
visio link, written to the CRM — so I never re-type a time the email already contains, and never
leave the inbox to schedule.

## Why (audit anchor)
Superhuman's Calendar settings expose **event-from-email** (turn a message into a calendar event)
alongside Meeting Links / Scheduling, and its Advanced settings include **RSVP + Mark Done**
(`feature-inventory.md` §Calendar, §Advanced). Its Ask AI resolves contacts + calendar to schedule
(`findings.md` §I). The bar: a message becomes a meeting in one action. OUR edge: we already book
on whichever calendar the user connected (CalDAV/Microsoft/Google) with a **sovereign Jitsi** link
and a CRM write — `POST /api/meetings/book` → `bookSovereignMeeting` (`calendar-write.ts`). CAL02
extracts the proposed time/duration from the open email and pre-fills that booking, one click.

## Requirements (EARS)
- WHEN a conversation is open, the system SHALL detect any concrete date/time proposed in the latest
  inbound message and offer a one-click "Book this" action pre-filled with that start time + a default
  duration (30 min, or the stated one).
- The system SHALL resolve the start time relative to the user's timezone and the email's date, and
  SHALL surface the resolved time for confirmation before writing (never book silently from parsing).
- The booking SHALL go through `POST /api/meetings/book` (capacity-aware) → `bookSovereignMeeting`,
  using the conversation's resolved contact (`detail.contact`) and a **sovereign** visio link by
  default; the system SHALL NOT mint Google Meet/Teams unless the user explicitly opts in.
- WHEN the contact cannot be resolved (unknown sender, no contact row), the system SHALL offer to
  capture the contact first (INBOX-G02) and SHALL NOT book against a fabricated contact.
- WHEN no time is detectable in the email, the system SHALL fall back to the manual "Book meeting"
  picker (existing) and/or "Insert availability" (CAL01) — never invent a time.
- ON a successful book, the system SHALL write a `meeting_scheduled` activity (CRM), surface the join
  link + calendar link, and the conversation SHALL reflect the booked state.
- WHEN the proposed time is ambiguous (e.g. "Thursday" with no time, or two candidate times), the
  system SHALL present the candidates for the user to pick, rather than guessing one.
- The action SHALL be per-user/tenant scoped (books on the viewer's calendar, the viewer's contact).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an inbound "Thursday at 3pm works for me" from a known contact WHEN "Book this" is clicked
  THEN the booking dialog pre-fills the resolved Thursday 15:00 (user tz) + 30 min; on confirm a
  sovereign meeting is booked, a `meeting_scheduled` activity is written, and the join link shows.
- GIVEN the email says "let's do 45 minutes Tuesday 10am" WHEN booking THEN duration pre-fills 45 min
  and start pre-fills Tuesday 10:00.
- GIVEN an unknown sender proposes a time WHEN "Book this" is invoked THEN the system offers "Add to
  CRM" (INBOX-G02) first; it does not book against a non-existent contact.
- GIVEN the email proposes no concrete time WHEN the conversation is open THEN no "Book this" appears;
  the manual "Book meeting" picker + "Insert availability" remain available.
- GIVEN "Thursday" with no time WHEN detected THEN the user is asked for the time (or shown candidate
  slots), never auto-booked at a guessed hour.
- GIVEN a deep-dive-stage deal at/over the weekly cap WHEN booking a deep-dive THEN the capacity gate
  applies (409 unless `override:true`), same as the existing endpoint.
- GIVEN the booked invite is opened in any calendar THEN it shows a first-class join link (location/
  description/URL), not a proprietary widget.

## Edge cases & failure handling
- Relative dates ("tomorrow", "next Tue") → resolve against the email's sent date and the user's tz;
  show the absolute resolved date/time for confirmation.
- Timezone mismatch (sender wrote in their tz) → resolve to the user's tz, label it, let the user adjust.
- Past/expired time (email proposed a slot that has since passed) → flag it and offer the manual picker.
- Multiple times in one email → list candidates; the user picks; never silently choose the first.
- No calendar connected → the existing `CalendarNotConnectedError` copy fires ("connect Google /
  Microsoft / IMAP-SMTP in Réglages → Mail & Calendar"); no booking attempted.
- Contact has no email → cannot send the invite; surface the existing "Contact not found or has no
  email" error, no partial book.
- Slot now busy on the user's own calendar → warn of the conflict before writing (free/busy check).
- Zero-retention: the extracted time is used for the booking only; raw email content not persisted by
  this feature beyond the existing capture pipeline.
- Multi-tenant: the contact + calendar are strictly the viewer's tenant/user; never cross-tenant.

## Best-in-class bar
- One click turns the email's own proposed time into a **booked, CRM-written, sovereign-visio**
  meeting — Superhuman's event-from-email creates a calendar event but has no native CRM write and no
  sovereign link; ours books on any connected calendar (incl. CalDAV) and logs the deal activity.
- The time is **extracted from the email, confirmed, never guessed** — and an unknown sender routes to
  capture-first, so we never book a meeting against a contact we can't cite.

## Design sketch
- **Data:** booking via `POST /api/meetings/book` → `bookSovereignMeeting` (`calendar-write.ts`),
  capacity via `lib/calendar/capacity.ts` (`meetingType`/`override`); writes `activities`
  (`activity_type:"meeting_scheduled"`, `channel:"meeting"`, `metadata:{ eventId, joinUrl, meetLink,
  calendarProvider, conferencing, roomName, startTime, durationMinutes, meetingType }`) exactly as the
  route does today (`book/route.ts:150`). Conversation/contact from `/api/inbox/conversations/detail`
  (`detail.contact`). Sovereign link via `video-meeting.ts`.
- **API:** `GET /api/inbox/proposed-time?conversationKey=…` → `{ candidates: [{ startIso, durationMinutes,
  rawPhrase, confidence }], timezone }` (parses the latest inbound body). Booking reuses the EXISTING
  `POST /api/meetings/book` (add no second booking path).
- **UI:** when ≥1 candidate is detected, a "Book this — Thu Jun 19, 3pm" button appears in the
  `_conversation-pane.tsx` action bar (`:291`) next to "Book meeting" (`:303`), `CalendarCheck` lucide
  icon; clicking opens the existing booking dialog pre-filled (start/duration), confirm → book. Surface
  = inline card `--color-bg-card`, `--shadow-panel`; resolved time shown in `--color-text-primary`,
  tz label `--color-text-tertiary`. Shortcut `b` on the open thread. Light+dark via tokens, no emoji,
  no provider name, cited ("time read from this email · books via Elevay").
- **AI:** time extraction = `claude-sonnet-4-6` via `tracedGenerateObject` with a strict schema
  (start ISO, duration, raw phrase, confidence) over the **quarantined** inbound body (reuse
  `wrapUntrustedInput`/`escapeForPrompt`, `lib/chat/prompt-safety.ts`); `_trace.agentId="proposed-time"`.
  The model only *extracts*; the user confirms; the calendar does the booking. Low confidence / no time
  → no button.
- **Security/perf:** inbound body is attacker-controlled → injection-quarantined for the extractor;
  capacity gate preserved; per-user/tenant scope; conflict-check against the user's own free/busy before
  writing; rate-limited.

## Tasks (ordered, each with verify + test)
1. `GET /api/inbox/proposed-time`: extract candidate time(s)+duration from the latest inbound (quarantined
   prompt, strict schema, confidence). (verify: "Thursday 3pm" → resolved ISO; "no time" → empty) (test:
   `proposed-time.route.test.ts` incl. relative dates, multiple candidates, none, injection-in-body).
2. Pre-filled booking from a candidate via the EXISTING `/api/meetings/book` (sovereign default, capacity
   gate). (verify: confirm books a sovereign meeting + writes `meeting_scheduled`) (test: book-from-email test).
3. Unknown-sender → capture-first (wire INBOX-G02); no booking without a contact. (verify: unknown sender
   shows Add-to-CRM, no book) (test: unknown-sender test).
4. UI "Book this <time>" action + pre-filled dialog + ambiguity picker in `_conversation-pane.tsx`.
   (verify: browser — button appears only when a time is detected, books on confirm, invite shows sovereign
   join link) (test: UI test).
5. Conflict check + tz resolution + zero-retention + scope. (verify: own-calendar conflict warns; resolved
   tz correct; nothing extra persisted) (test: conflict/tz/retention test).

## Current-state notes (VERIFY before building — code moves)
- Booking EXISTS: `POST /api/meetings/book` (`app/api/meetings/book/route.ts`) → `bookSovereignMeeting`
  (`calendar-write.ts`), capacity-aware (`lib/calendar/capacity.ts`), sovereign default, writes the
  `meeting_scheduled` activity with the metadata shape above (`book/route.ts:150-175`). The chat tool
  `bookMeeting` (`lib/chat/tools/action.ts:476`) is the same call from chat — reuse, don't fork.
- Composer already has a manual "Book meeting" picker (`_conversation-pane.tsx:303`, `CalendarPlus`,
  gated on `detail.contact`, toggles `schedOpen`); CAL02 adds a *pre-filled-from-email* path beside it.
- Prompt-injection primitives EXIST (`lib/chat/prompt-safety.ts`: `wrapUntrustedInput`, `escapeForPrompt`)
  and MUST wrap the inbound body fed to the extractor (inbound is attacker-controlled).
- `reply-handler.ts:131` already classifies replies as `meeting_request`/`interested` and proposes slots
  in the *auto-reply* path — that is the autonomous draft path, NOT the manual one-click book; CAL02 is
  the user-driven inbox action. No "extract proposed time" endpoint exists yet.
- Sovereign visio EXISTS (`video-meeting.ts`, Jitsi, `VIDEO_MEET_BASE_URL`); the booked event MUST use it.
