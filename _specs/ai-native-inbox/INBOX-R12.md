# INBOX-R12 — Calendar invite (.ics) inline render + RSVP
> Theme: T1 · Autonomy rung: helper · Priority: P1
> Pillar: P1 fidelity / P9 calendar

## User story
As a user receiving a meeting invite, I want the `.ics` invitation rendered inline as a real event
card — title, time, location, organizer, attendees — with Accept / Tentative / Decline buttons, so I
can RSVP and get it on my calendar without leaving the inbox or downloading a file.

## Why (audit anchor)
Event-from-email and RSVP are core mailbox features — Superhuman has a Calendar split, "RSVP + Mark
Done", event-from-email, and scheduling (`feature-inventory.md` → Calendar; Advanced › RSVP + Mark
Done). Today an invite arrives as a `text/calendar` part or an `invite.ics` attachment that our
capture discards (`imap.ts:124` keeps only text/HTML; attachments dropped) — so the user sees, at
best, the fallback text and no RSVP. We already have an **ICS builder + multi-provider calendar-write
path** (sovereign visio: `lib/integrations/ics.ts`, CalDAV/Graph/Google write per memory) — we just
need to **parse inbound ICS** and wire RSVP through the existing write path. This is the inbound
counterpart to the sovereign-booking work.

## Requirements (EARS)
- WHEN a message contains a `text/calendar` part or an `.ics` attachment with `METHOD:REQUEST`, the
  system SHALL parse it and render an inline event card (summary, start/end with timezone, location,
  organizer, attendee list, recurrence summary).
- The system SHALL offer Accept / Tentative / Decline actions that write the user's RSVP to their
  connected calendar via the existing multi-provider write path (CalDAV/Graph/Google) and, where the
  organizer expects it, email a `METHOD:REPLY` back.
- WHEN the invite is an update (`SEQUENCE` incremented) or cancellation (`METHOD:CANCEL`), the system
  SHALL reflect the change on the card (updated time / "Cancelled") and update/remove the calendar event.
- The system SHALL show conflicts: if the user's calendar is busy at that time, the card SHALL surface
  the conflict before they accept.
- The system SHALL render times in the user's timezone with the original timezone noted.
- WHEN no calendar is connected, the system SHALL still render the card and offer "Download .ics" / "Add
  to calendar" rather than a dead RSVP.
- The system SHALL be per-user/tenant scoped — RSVP writes only to the viewer's own connected calendar.
- The system SHALL never auto-RSVP without the user's click (helper rung, not autonomous).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an email with a `METHOD:REQUEST` invite for Thu 14:00–15:00 CET WHEN opened THEN an event card
  shows title/time (in the user's TZ, CET noted)/organizer/attendees with Accept/Tentative/Decline.
- GIVEN the user clicks Accept (calendar connected) WHEN it completes THEN the event appears on their
  calendar and a REPLY is sent to the organizer (if expected).
- GIVEN a `METHOD:CANCEL` for an event already accepted WHEN opened THEN the card shows "Cancelled" and the
  calendar event is removed.
- GIVEN an updated invite (new time) WHEN opened THEN the card reflects the new time and updates the event.
- GIVEN the proposed time conflicts with an existing event WHEN opened THEN the card shows a conflict notice
  before RSVP.
- GIVEN no connected calendar WHEN opened THEN the card offers Download .ics / Add to calendar (no broken RSVP).

## Edge cases & failure handling
- Malformed/partial ICS → render what parses (at least summary + time); never crash the pane.
- All-day / multi-day / recurring events → render correctly (recurrence summarized, not expanded fully).
- Timezone-less floating times → interpret per the user's TZ, note the assumption.
- Multiple VEVENTs in one ICS → render each (or the primary, list the rest).
- Organizer ≠ sender (forwarded invite) → show both honestly; RSVP still targets the organizer.
- RSVP write fails (calendar API/CalDAV error) → clear error, offer retry/download; never silently "accept".
- Multi-tenant: write only to the viewer's mailbox-linked calendar; never another user's.

## Best-in-class bar
- RSVP writes through our **sovereign multi-provider calendar path** (CalDAV/Graph/Google) — so it works
  for self-hosted/Zimbra/Infomaniak users, not only Google/Microsoft like Superhuman; the same engine that
  injects sovereign visio links (INBOX-CAL05) handles inbound RSVP, end to end on EU/CH infra.
- **Conflict-aware before accept** and update/cancel handling make it a real scheduling surface, not just a
  pretty card — grounded in the user's actual calendar, not a guess.

## Design sketch
- **Data:** the ICS arrives as a part/attachment (persisted by INBOX-R04 / retained by R13). No new table;
  RSVP state lives on the calendar event via the write path.
- **API:** new `lib/integrations/ics-parse.ts` (pure ICS → event object; sibling of the existing builder
  `lib/integrations/ics.ts`). New `POST /api/inbox/invite/rsvp` → resolves the user's calendar →
  Accept/Tentative/Decline via the existing CalDAV/Graph/Google write module (`calendar-write.ts` per
  memory) + optional `METHOD:REPLY` email. Conflict check reads the user's calendar (existing read path).
- **AI:** none (deterministic parse).
- **UI:** an inline event card in `_conversation-pane.tsx` (above/with the body) — `CalendarPlus`,
  `Clock`, `MapPin`, `Users` (lucide); RSVP buttons reuse `components/ui/button` (`Check` accept in
  `--color-success`, tentative neutral, `X` decline in `--color-error`); card surface `--color-bg-card`,
  border `--color-border-default`, conflict notice `--color-warning-soft`. Keyboard: matches the existing
  pane action pattern; an "RSVP + done" affordance mirrors Superhuman's. Reuse `MeetingSchedulerCard`
  styling (`_conversation-pane.tsx:356-362`) for visual consistency. Light+dark via tokens, no emoji, no
  provider name, cited.
- **Security/perf:** RSVP scoped to viewer's calendar; ICS parse is pure + bounded; no external fetch to render.

## Tasks (ordered)
1. `lib/integrations/ics-parse.ts` — pure ICS parser (VEVENT, METHOD, SEQUENCE, TZ, recurrence summary).
   (verify: unit across REQUEST/CANCEL/update/recurring/all-day fixtures) (test: `ics-parse.test.ts`)
2. Detect + persist the calendar part at capture (INBOX-R04/R13). (verify: invite captured) (test: capture test)
3. `POST /api/inbox/invite/rsvp` → write via existing CalDAV/Graph/Google path + optional REPLY + conflict
   read. (verify: accept lands on calendar, decline removes) (test: route test, mocked providers)
4. Inline event card UI + RSVP + conflict + no-calendar fallback. (verify: browser — invite renders, Accept
   writes) (test: card render)

## Current-state notes (VERIFY before building)
- `lib/integrations/ics.ts` is a **builder only** (RFC 5545 generate, `IcsEventInput`, `toIcsUtc`; for
  CalDAV write + SMTP invite) — there is **no inbound ICS parser**; this spec adds the sibling parser.
- The multi-provider calendar-WRITE path exists on the sovereign-visio branch (`calendar-write.ts`,
  CalDAV/Graph/Google; memory: project_sovereign-visio) — REUSE for RSVP; VERIFY it's merged/available.
- Inbound invites are dropped today (`imap.ts:124` keeps only text/HTML; attachments unpersisted) — depends
  on INBOX-R04 (attachment persistence) + R13 (parts retained).
- `MeetingSchedulerCard` (`components/meeting-scheduler`, used at `_conversation-pane.tsx:356`) is the
  outbound booking card — reuse its styling idiom for the inbound RSVP card; do not rebuild calendar plumbing.
