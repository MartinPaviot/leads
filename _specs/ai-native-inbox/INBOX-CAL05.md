# INBOX-CAL05 — Sovereign visio link injection
> Theme: T9 · Autonomy rung: helper · Priority: P1
> Pillar: P5 GTM moat (sovereignty)

## User story
As a founder booking a meeting from the inbox, I want the invite to carry a sovereign video
link by default (our own host, not Google Meet / Teams / Zoom), so every call my prospects
join stays on infrastructure I control — and I can still pick a provider link when I must.

## Why (audit anchor)
Superhuman injects Google Meet / Zoom links into invites (`feature-inventory.md` Calendar →
Meeting Links). We default to a **sovereign visio** (Jitsi on our host, `VIDEO_MEET_BASE_URL`,
e.g. visio.pilae.ch) — the sovereignty moat a US SaaS can't offer. This is the inbox surface of
the already-built sovereign-visio system (`project_sovereign-visio`): the link rides in the
calendar write's method-B body, never a Meet/Teams widget.

## Requirements (EARS)
- WHEN a meeting is booked from the inbox (INBOX-CAL02 / CAL03 / G10), the system SHALL attach a
  **sovereign** video link by default.
- The system SHALL let the user choose the conferencing provider per meeting (sovereign /
  google_meet / teams / zoom) where their account supports it (`resolveConferencing`).
- The system SHALL embed the sovereign link in the calendar event body (method B) and the `.ics`,
  NOT as a provider conferencing widget.
- The system SHALL surface the chosen link in the reply/booking draft so the prospect sees it.
- The system SHALL read the host from `VIDEO_MEET_BASE_URL` and default to `meet.jit.si` when
  unset (works without custom DNS).
- The system SHALL refer to it in UI copy as "video meeting" / "visio", NEVER name the underlying
  tech (Jitsi) — and NEVER a third-party provider unless the user explicitly chose it.
- The system SHALL scope the booking + link to the user's own mailbox/calendar.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN I book a meeting from a thread WHEN I confirm THEN the invite carries a sovereign video
  link by default, present in the event body, the `.ics`, and the reply draft.
- GIVEN I prefer Zoom for one meeting WHEN I switch the conferencing picker to Zoom THEN the
  invite carries the Zoom link instead (account permitting).
- GIVEN `VIDEO_MEET_BASE_URL` is unset WHEN I book THEN the link uses `meet.jit.si` and still works.
- GIVEN a sovereign link WHEN the UI shows it THEN copy reads "video meeting", never "Jitsi".
- GIVEN recording is disabled WHEN I book THEN no recording is implied or attempted.

## Edge cases & failure handling
- Provider conferencing chosen but the account can't create it → fall back to sovereign + tell the
  user honestly (never a dead link).
- Host (`VIDEO_MEET_BASE_URL`) unreachable → still generate the room URL (links are deterministic);
  surface a config hint to the operator, not the prospect.
- Reschedule (CAL04) → keep the same room link across the move unless the provider changes.
- Multi-attendee / external guests → the link is shareable; no per-guest auth assumed.
- Cross-tenant/user: the link + booking belong to the booking user's mailbox only.

## Best-in-class bar
- **Sovereign by default** — the call runs on our host (EU/CH, self-hostable), the one thing
  Google/Microsoft-bound clients structurally cannot do. Provider links remain an explicit opt-in,
  never the default.
- Zero-config baseline (`meet.jit.si`) with a one-env upgrade (`VIDEO_MEET_BASE_URL`) to full
  sovereignty — no per-meeting setup.

## Design sketch
- **Data:** none new — the chosen conferencing kind + link travel on the event/`.ics` and the
  booking record. Reuse the booking row from CAL02/CAL03/G10.
- **API:** the inbox booking path calls `resolveConferencing(...)` + `createSovereignMeeting(...)`
  (`lib/calendar/video-meeting.ts`) → link goes into `calendar-write.ts` (method-B body) + `ics.ts`.
- **UI:** in the booking/reply flow, a small conferencing picker (`--color-bg-card`,
  `--shadow-floating`) defaulting to "Sovereign video" (lucide `Video`), with provider options
  listed plainly; the link renders as a chip in the draft (accent). Light+dark via tokens; no
  emoji; copy says "video meeting"/"visio", never "Jitsi" or a provider name unless chosen; the
  meeting's provenance is cited ("via Elevay").
- **AI:** none (CAL03 inserts the link into the AI-drafted scheduling email; the model doesn't pick the host).
- **Security:** room URLs are deterministic per booking; recording stays behind
  `SOVEREIGN_RECORDING_ENABLED` (off); per-user scope.

## Tasks (ordered)
1. Wire `resolveConferencing` + `createSovereignMeeting` into the inbox booking path; default
   sovereign. (verify: booked invite carries a sovereign link) (test: conferencing-resolve unit)
2. Conferencing picker in the booking/reply UI (sovereign default, provider opt-in). (verify:
   browser — default is sovereign, copy says "video meeting") (test: dom render)
3. Inject the link into the event body + `.ics` + the reply draft via `calendar-write.ts`/`ics.ts`.
   (verify: link present in all three) (test: write-path unit)
4. `VIDEO_MEET_BASE_URL` unset → `meet.jit.si` fallback. (verify: works with no DNS) (test: env unit)

## Current-state notes (VERIFY before building — line numbers approximate)
- `lib/calendar/video-meeting.ts` exists: `createSovereignMeeting`, Jitsi default, `VIDEO_MEET_BASE_URL`,
  `resolveConferencing` (sovereign / google_meet / teams / zoom), Zoom S2S (`zoom.ts`). Per
  `project_sovereign-visio` (MERGED PR #244 → prod). Reuse, don't rebuild.
- `lib/calendar/calendar-write.ts` puts the link in method B (never a Meet/Teams widget); `ics.ts`
  builds the `.ics`. Both shipped.
- Recording (Jibri→Whisper→apply-transcript) is behind `SOVEREIGN_RECORDING_ENABLED` (off) — leave off.
- Microsoft write needs re-consent (per `project_sovereign-visio`) — out of scope here, note it.
- Sibling: CAL02 (event-from-email), CAL03 (AI scheduler), CAL04 (RSVP/reschedule), G10 (booked→CRM),
  C10 (scheduling drafter). The "no provider names" rule (`feedback_no-provider-names-ui`) governs copy.
