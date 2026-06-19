# INBOX-CAL03 — AI meeting scheduler (end-to-end, sovereign)
> Theme: T9 · Autonomy rung: proactive → agent · Priority: P0
> Pillar: P5 GTM moat / P3 writing (cross)

## User story
As a founder, I want to say "set up a call with this prospect" (or have it offered when an inbound
asks to meet) and have the assistant run the whole flow — read the thread, pick the right meeting
type for the deal stage, propose my real open slots in a voice-matched reply, and on acceptance
book a sovereign-visio meeting and write it to the CRM — with every step shown and gated on my
approval, so scheduling is one approval instead of a thread of back-and-forth.

## Why (audit anchor)
This is the bar Superhuman set: its Ask AI is **an agent that schedules** — asked to follow up, it
ran a multi-tool flow (look up the contact, analyze your voice, **check your calendar
availability**) "all at once", drafted grounded in all three with real proposed dates, and gated on
Send / Create Draft (`findings.md` §I). Superhuman even ships a schedulable **Meeting Scheduler**
skill (`ai-feature-deep-dive.md` §MCP). OUR moat: we join the **whole GTM graph** (deal stage,
last interaction, signals — cited), propose slots from **our own** free/busy, and book a
**sovereign** Jitsi meeting on any connected calendar (incl. CalDAV) with a CRM write — a
revenue-native, sovereignty-native scheduler, not a calendar bolt-on.

## Requirements (EARS)
- WHEN the user invokes "Schedule a call" on a thread (or accepts a proactive offer triggered by an
  inbound meeting-request), the system SHALL run an auditable flow: (1) resolve the counterparty +
  cited GTM context (contact/company/deal/last-interaction/signals), (2) choose the meeting
  type/duration appropriate to the deal stage, (3) compute the user's real open slots, (4) draft a
  voice-matched reply proposing those slots + a sovereign link, and (5) on acceptance, book + write CRM.
- The system SHALL compute slots from the user's **actual** free/busy on **whichever** calendar they
  connected (Google, Microsoft, or CalDAV) — not Google-only — working-hours-bounded, and SHALL NOT
  propose a busy or out-of-window slot. The model SHALL NEVER invent times; slots come from the calendar.
- The system SHALL show its reasoning + sources for each step (which contact, which deal stage, which
  slots, why this duration) and SHALL gate the proposing reply on the user's approval (Send / Insert
  Draft), exactly like the agentic compose flow (INBOX-C01/G08).
- The proposed meeting SHALL use a **sovereign** visio link by default (Jitsi via `video-meeting.ts`);
  the system SHALL NOT mint Google Meet/Teams unless the user explicitly opts in.
- WHEN a recipient accepts a slot (reply parsed via CAL02, or one-click), the system SHALL book it via
  `POST /api/meetings/book` (capacity-aware), write a `meeting_scheduled` activity, and remove the
  accepted slot from any further proposals.
- The system SHALL keep proposed slots fresh: re-validate free/busy at draft time and again at
  send/accept; a slot taken in between SHALL be re-fetched and never offered stale.
- WHEN the deal is at a capacity-bound stage (deep-dive), the system SHALL respect the weekly cap
  (`meetingType:"deep_dive"`, `override`), surfacing saturation rather than over-committing the calendar.
- WHEN no calendar is connected, the system SHALL draft a "share two or three windows that work for you"
  reply (no fabricated availability) and prompt the user to connect a calendar.
- The whole flow SHALL be per-user/tenant scoped, rate-limited, injection-hardened on inbound content,
  and honour zero-retention (INBOX-P03) — computed slots + drafts not persisted beyond the request/draft.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread from a known prospect with an open deal WHEN "Schedule a call" is invoked THEN the
  assistant shows: the resolved contact + deal stage (cited), the chosen duration, 3 real free slots,
  and a voice-matched draft proposing them with a sovereign link — gated on Send / Insert Draft.
- GIVEN a CalDAV-only (Infomaniak/Zimbra) user WHEN slots are computed THEN real free slots are
  proposed from their CalDAV free/busy (not an empty list, not Google-only).
- GIVEN a Microsoft-only user WHEN slots are computed THEN real free slots come from Graph free/busy.
- GIVEN the recipient replies "Thursday 3pm works" WHEN parsed THEN the meeting is booked (sovereign),
  a `meeting_scheduled` activity is written, and that slot is no longer proposed in any follow-up.
- GIVEN a slot becomes busy between draft and send WHEN the user reviews THEN that slot is replaced
  (re-fetched), never sent stale.
- GIVEN the deal is at deep-dive stage and the weekly cap is reached WHEN scheduling a deep-dive THEN
  saturation is surfaced and booking requires `override:true` (per `/api/meetings/book`).
- GIVEN no calendar is connected WHEN invoked THEN the draft proposes "a couple of windows" with no
  fabricated times and prompts to connect a calendar.
- GIVEN any step WHEN the assistant shows the draft THEN every asserted fact (deal stage, last
  interaction, the slots) carries a citation / "why", and nothing is auto-sent without approval.

## Edge cases & failure handling
- Multiple connected calendars / accounts → union busy so no double-book is proposed.
- Recipient timezone unknown → propose in the user's tz, labelled; optionally also offer UTC.
- Ambiguous/relative time in the acceptance reply → resolve via CAL02 (confirm, don't guess); two
  candidates → ask which.
- Slot race (two prospects accept the same slot) → first booking wins; the second triggers a re-propose
  with fresh slots.
- Free/busy lookup fails for the connected provider → degrade to the "share a couple of windows" draft
  (never fabricate slots); surface the read failure.
- Sovereign host unset (`VIDEO_MEET_BASE_URL`) → still works via public Jitsi but flags non-sovereign in
  prod (the helper already `console.warn`s); never silently substitute Meet/Teams.
- Inbound content (the meeting request) is attacker-controlled → injection-quarantined before any model sees it.
- Capacity cap → surface the goulot; allow founder override; the dashboard badge stays truthful.
- Multi-tenant: calendar, contact, deal, and booking strictly within the viewer's tenant/user scope;
  NEVER the `reply-handler` "first user in the table" shortcut (see Current-state notes — that is a bug
  the user-driven scheduler must not inherit).
- Zero-retention: computed slots + the draft are not persisted beyond the request/draft staging.

## Best-in-class bar
- It is **GTM-grounded and cited end-to-end** — the meeting type, duration, and pitch are tied to the
  deal stage + last interaction + signals from our own graph, not just "contact + voice + calendar"
  like Superhuman's scheduler. Revenue-native, with provenance.
- It is **sovereign and multi-provider**: real slots from Google/Microsoft/**CalDAV**, booking a Jitsi
  visio on EU/CH infra — a scheduler a US Google/MS-only inbox structurally cannot offer.
- Every step is **auditable and approval-gated** — the user sees which contact, which slots, and why,
  and nothing sends or books without a click (the human-in-the-loop spine, Lightfield's approval model).

## Design sketch
- **Data:** GTM context reuses the Call Mode cited prospect brief (career timeline + grounded company
  summary, jsonb-cached, fail-closed) + deal stage + `lib/accounts/last-interaction.ts` + signals
  (`lib/signals/freshness.ts`) — compose, don't rebuild (same sources as INBOX-G01). Free/busy via
  `getAvailableSlots` (`meeting-booking.ts:19`) **EXTENDED** to all providers (see below). Booking via
  `POST /api/meetings/book` → `bookSovereignMeeting` (`calendar-write.ts`); capacity `lib/calendar/capacity.ts`;
  link `video-meeting.ts`. Voice few-shot via `getWritingSamples`/`buildWritingStylePrompt` (`lib/writing-profile.ts`).
- **Sovereign slot extension (the key gap to close):** refactor `getAvailableSlots(userId, opts)` to
  resolve the user's connected calendar the way `bookSovereignMeeting` does (CalDAV → Microsoft → Google)
  and compute busy per provider:
  - **Google** (today): `getCalendarClient` → `freebusy.query` (`meeting-booking.ts:52`).
  - **CalDAV** (Infomaniak/Zimbra/OVH): `fetchCalDavMeetings(creds, ...)` (`caldav.ts:118`) →
    `mapIcsToMeetings` (`caldav.ts:241`) gives busy intervals; subtract from candidate slots. Creds from
    `connectedMailboxes` (`caldav_url`/`smtp_*`/`secret_encrypted`, `outbound.ts:246`), decrypted as in
    `calendar-write.ts:findSmtpMailbox`.
  - **Microsoft**: `getMicrosoftAccessToken` (`calendar-microsoft.ts:75`) → Graph
    `POST /me/calendar/getSchedule` for free/busy.
  Keep the slot-generation + weekend/window logic in one pure function; only the busy source differs.
- **API:** `POST /api/inbox/schedule` `{ conversationKey, durationMinutes?, count?, meetingType? }` →
  `{ steps: [{ kind, summary, citations }], slots: [{ startIso, endIso, formatted }], draft: { subject,
  body }, conferencing:"sovereign", calendarConnected }`. Acceptance routes through the EXISTING
  `/api/meetings/book` (via CAL02's extracted-time path). Re-validate slots at draft + send/accept.
- **UI:** "Schedule a call" action in `_conversation-pane.tsx` action bar (`:291`) and as an offered
  chip when an inbound is classified meeting-request; opens a stepper card (surface `--color-bg-card`,
  `--shadow-floating`, `rounded-lg`, Inter) showing each step + citations + selectable slot chips, then
  the draft with Send / Insert Draft. `CalendarClock` lucide icon; shortcut `g s` (go-schedule) on the
  thread. Reasoning rendered with the existing cited-text / confidence-state components
  (`components/coaching/cited-text.tsx`, `components/ai-ui/confidence-state.tsx`). Light+dark via tokens,
  no emoji, no provider name, every fact cited "(via Elevay)".
- **AI:** `claude-sonnet-4-6` via `tracedGenerateObject` for (a) meeting-type/duration choice from deal
  stage and (b) the voice-matched reply *around* the computed slots — the slots themselves are calendar
  facts, never model output. `_trace.agentId="inbox-scheduler"`. Inbound quarantined via
  `lib/chat/prompt-safety.ts`. Reasoning steps are real tool outputs, shown for audit.
- **Security/perf:** per-user/tenant scope (resolve the *viewer's* userId — never a global "first user");
  injection-hardened; rate-limited; capacity gate preserved; slots re-validated; zero-retention honoured.

## Tasks (ordered, each with verify + test)
1. Refactor `getAvailableSlots` to multi-provider (Google/CalDAV/Microsoft) busy resolution behind one
   pure slot generator; union busy across the user's calendars. (verify: real free slots for Google,
   CalDAV, and Microsoft users; no busy slot returned) (test: `available-slots-multiprovider.test.ts`).
2. `POST /api/inbox/schedule`: resolve cited GTM context → choose type/duration → compute slots → draft
   voice-matched reply (sovereign link) → return steps+slots+draft. (verify: 200 with cited steps, real
   slots, sovereign URL; no-calendar → windows draft) (test: route test incl. capacity + no-calendar).
3. Acceptance → EXISTING `/api/meetings/book` (via CAL02 extracted-time) → `meeting_scheduled` write →
   drop accepted slot; freshness re-validation at send/accept. (verify: accept books sovereign + writes
   CRM; taken slot re-proposes) (test: accept + freshness test).
4. UI stepper (reasoning + citations + slot chips + Send/Insert Draft) in `_conversation-pane.tsx` +
   proactive offer chip on meeting-request inbound. (verify: browser — steps shown, slots real, books on
   accept, invite shows sovereign join link) (test: UI test).
5. Scope hardening (per-viewer userId), injection quarantine, capacity gate, zero-retention. (verify:
   scoped to viewer; injected inbound inert; deep-dive cap enforced; nothing persisted) (test:
   scope/injection/capacity/retention test).

## Current-state notes (VERIFY before building — code moves)
- Availability is **Google-only**: `getAvailableSlots(userId, opts)` (`meeting-booking.ts:19`) →
  `getCalendarClient` (`calendar.ts:10`, `authAccounts.provider="google"`) → Google `freebusy.query`.
  CalDAV/Microsoft users get `[]` today → the scheduler MUST extend this (task 1) or sovereign users have
  no real slots.
- Booking EXISTS and is sovereign + capacity-aware: `POST /api/meetings/book` (`book/route.ts`) →
  `bookSovereignMeeting` (`calendar-write.ts`), writes `meeting_scheduled` (metadata shape at
  `book/route.ts:150-175`). The chat `bookMeeting` tool (`lib/chat/tools/action.ts:476`) is the same path.
- An auto-reply scheduler ALREADY exists but is the autonomous path and has a known scoping shortcut:
  `reply-handler.ts:131-140` classifies `meeting_request`/`interested` and calls `getAvailableSlots(user.id)`
  where `user` is `db.select().from(users).limit(1)` — the **"first user in the table"** (commented
  "simplified"). The user-driven scheduler MUST resolve the *viewer's* userId, never this shortcut, and
  should also fix the autonomous path to be per-recipient-owner.
- CalDAV building blocks EXIST: `discoverCalDavUrl` + `fetchCalDavMeetings` + `mapIcsToMeetings`
  (`caldav.ts:91/118/241`, using `ical.js`). Microsoft token via `getMicrosoftAccessToken`
  (`calendar-microsoft.ts:75`, scope `Calendars.ReadWrite`). Reuse these for busy data.
- Cited GTM context builders EXIST (Call Mode prospect brief; `lib/accounts/last-interaction.ts`; signal
  freshness) — compose them (as INBOX-G01 does). Voice few-shot EXISTS (`lib/writing-profile.ts`).
- No `/api/inbox/schedule` endpoint exists yet. Keep CAL03 (agentic, multi-step, GTM-grounded) distinct
  from CAL01 (manual slot insert) and INBOX-C10 (single voice-matched scheduling email); share the slot
  computation across all three.
