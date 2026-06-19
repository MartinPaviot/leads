# INBOX-CAL04 — RSVP / reschedule from the inbox
> Theme: T9 · Autonomy rung: helper · Priority: P1
> Pillar: cross (calendar) + P5 sovereignty

## User story
As someone who receives (or sent) a meeting invite, I want to RSVP — accept / decline /
tentative — or propose a new time, right from the inbox, so I never leave for a separate
calendar app and my answer reaches the organiser correctly.

## Why (audit anchor)
Superhuman has **RSVP + Mark Done** and reschedule (`feature-inventory.md` "Advanced",
`findings.md` §F). But Superhuman is Google/Microsoft-only. We do it **sovereign**: an iTIP
`.ics` REPLY over the user's own provider (CalDAV / Microsoft Graph / Google / SMTP-iTIP for
Zimbra), so RSVP works for self-hosted mailboxes too — a category they can't serve. Builds on
INBOX-R12 (inline `.ics` render) and the multi-provider calendar write.

## Requirements (EARS)
- WHEN a thread contains a calendar invite (`.ics`/`text/calendar`), the system SHALL render
  RSVP controls (Accept / Tentative / Decline) on the invite card (INBOX-R12).
- WHEN the user RSVPs, the system SHALL send a standards-compliant iTIP `REPLY` to the organiser
  via the user's connected provider, and reflect the status locally.
- WHEN the user chooses "Propose new time", the system SHALL open the availability picker
  (INBOX-CAL01) and send a `COUNTER`/proposal to the organiser.
- The system SHALL write the RSVP to the user's own calendar (CalDAV / Graph / Google) where the
  provider supports it (`calendar-write.ts`).
- IF "RSVP + Mark Done" is enabled, the system SHALL mark the conversation Done after a positive RSVP.
- The system SHALL NOT fabricate an RSVP if the send fails — it SHALL surface the error and keep
  the invite actionable (never silently "accepted").
- The system SHALL scope to the user's own mailbox/calendar (`lib/inbox/user-scope.ts`).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an invite in my inbox WHEN I click Accept THEN an iTIP REPLY (PARTSTAT=ACCEPTED) reaches
  the organiser and the event lands on my calendar, and (if enabled) the thread is marked Done.
- GIVEN an invite WHEN I click Decline THEN a REPLY with PARTSTAT=DECLINED is sent and no event
  is added.
- GIVEN an invite WHEN I "Propose new time" THEN the availability picker opens and a counter is sent.
- GIVEN my provider has no calendar API (SMTP-only Zimbra) WHEN I RSVP THEN the REPLY is sent via
  SMTP iTIP and the UI says so honestly (no false "added to calendar").
- GIVEN the REPLY send fails WHEN I RSVP THEN an error is shown and the RSVP buttons stay active.

## Edge cases & failure handling
- Updated invite (SEQUENCE bump) supersedes a prior RSVP → show the latest, re-RSVP.
- Cancellation (`METHOD:CANCEL`) → show "cancelled", offer to remove from calendar.
- Recurring events → RSVP the series vs this instance (explicit choice).
- Malformed `.ics` → fall back to a read-only invite (INBOX-R09/R12), no RSVP buttons, never crash.
- Timezone/DST: render in the user's tz; never shift the organiser's intended time.
- Cross-tenant/user: only the recipient mailbox can RSVP its own invite.

## Best-in-class bar
- **Provider-neutral, sovereign RSVP** (CalDAV / Graph / Google / SMTP-iTIP) — works for Zimbra
  and self-hosted mail where Superhuman simply can't operate.
- Honest provider truth: we never claim "added to your calendar" when the path is SMTP-only iTIP.

## Design sketch
- **Data:** the invite is already in the thread (INBOX-R13 retains the `.ics`/calendar part);
  RSVP status cached on the activity `metadata`. No new table.
- **API:** `POST /api/inbox/rsvp` `{ conversationKey, decision, proposeAt? }` → builds the iTIP
  REPLY (`lib/integrations/ics.ts`) → sends via the user's provider + writes the event
  (`lib/calendar/calendar-write.ts`, multi-provider) → optional Mark Done.
- **UI:** RSVP buttons on the R12 invite card in `_conversation-pane.tsx` — Accept (lucide
  `Check`, `--color-success`), Tentative (`CircleHelp`, `--color-warning`), Decline (`X`,
  `--color-error`), "Propose new time" (`Calendar`, accent). On the `--color-bg-card` invite
  card; selected state uses the semantic `-soft` token. Keyboard: invite focused → `y/m/n` for
  yes/maybe/no (registered in the hotkey registry). Light+dark via tokens; no emoji; no provider
  name in copy ("added to your calendar", not "Google Calendar"); status is cited.
- **AI:** none (CAL03 may suggest the counter time; the model never invents — times come from
  the calendar).
- **Security:** per-user mailbox/calendar scope; iTIP REPLY only to the invite's organiser.

## Tasks (ordered)
1. iTIP REPLY/COUNTER builder in `lib/integrations/ics.ts` (PARTSTAT, SEQUENCE, organiser).
   (verify: a real client accepts the REPLY) (test: ics-reply unit)
2. `POST /api/inbox/rsvp` → REPLY send via the provider router + `calendar-write.ts` write +
   optional Mark Done. (verify: event lands on a CalDAV test calendar) (test: route + provider mock)
3. RSVP controls on the R12 invite card + the honest SMTP-only messaging. (verify: browser on a
   real invite) (test: dom render)
4. "Propose new time" → CAL01 picker → COUNTER. (verify: counter reaches organiser) (test: unit)

## Current-state notes (VERIFY before building — line numbers approximate)
- `lib/integrations/ics.ts` is a builder today (incl. `writeSmtpIcsEvent` iTIP for Zimbra per
  `project_sovereign-visio`); it needs REPLY/COUNTER methods (sibling to R12's parser `ics-parse.ts`).
- `lib/calendar/calendar-write.ts` already writes CalDAV / Graph / Google (multi-provider). Reuse.
- `connected_mailboxes` carries `caldav_url` + `smtp_custom` (`db/schema/outbound.ts`) for the path choice.
- Depends on INBOX-R12 (inline `.ics` render) + R13 (retain the calendar part at capture).
- "RSVP + Mark Done" exists as a Superhuman setting; mirror it as a user preference (INBOX-O06).
- Sibling: CAL01 (availability), CAL02 (event-from-email), CAL03 (AI scheduler), CAL05 (sovereign visio).
