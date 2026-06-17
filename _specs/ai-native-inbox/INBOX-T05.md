# INBOX-T05 — Snooze + AI-suggested resurface time (unified "if no reply" control)
> Theme: T2 · Autonomy rung: helper · Priority: P1
> Pillar: P4 triage

## User story
As a user, I want one snooze control that takes natural language ("monday", "2d"), suggests a
smart resurface time, and offers an "if no reply" mode — so a single picker handles both
"remind me later" and "nudge me only if they go quiet", instead of two features.

## Why (audit anchor)
Superhuman's Remind Me / Snooze overlay takes **natural-language input** ("type 'monday' or
'2d'" → "on Monday · MON 8:00 AM") with quick options, AND a **key "if no reply" toggle** that
fires the reminder only when there's been no reply (`findings.md` §B). That single conditional
**unifies snooze + the no-reply nudge into one control** (`findings.md` §H, "Patterns to STEAL").
Today we have a 3-option snooze popover only (`_conversation-pane.tsx:32` `SNOOZE_OPTIONS`,
triage verb `snooze` at `triage/route.ts:41`). T05 turns that into the unified picker; INBOX-T06
is the engine behind "if no reply".

## Requirements (EARS)
- The system SHALL accept a natural-language time in the snooze input ("monday", "2d", "next
  week", "this weekend", "tomorrow 9am") and parse it to a concrete resurface timestamp.
- The system SHALL show parsed result confirmation ("on Monday · 8:00 AM") before committing.
- The system SHALL keep the existing quick options (Tomorrow morning, In 3 days, Next Monday) and
  add "Someday" + an AI-suggested time.
- The system SHALL offer an **AI-suggested resurface time** derived from context (their timezone,
  the deal cadence, when this contact usually replies) with a one-line "why".
- The system SHALL offer an **"if no reply" mode**: the conversation resurfaces at the chosen time
  ONLY if no inbound reply arrived in the interim; if a reply arrives, it reopens immediately
  (the existing reopen-on-new-inbound already does this) and the pending nudge is cancelled.
- WHEN "if no reply" is OFF, the system SHALL resurface unconditionally at the time (today's
  behaviour).
- The system SHALL store the conditional flag so INBOX-T06's engine knows to suppress the
  resurface if a reply landed.
- The system SHALL validate the resurface time is in the future (mirrors `triage/route.ts:46`).
- The system SHALL keep snooze per-user/tenant and computed-reopen at read time (no new stored
  "open" writes), consistent with `inbox_triage`.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the snooze input WHEN the user types "2d" THEN it parses to two days out and shows the
  resolved date/time before commit.
- GIVEN the snooze input WHEN the user types "monday" THEN it resolves to next Monday morning.
- GIVEN an unparseable string ("bananas") WHEN entered THEN the control shows "couldn't read that
  time" and does not commit.
- GIVEN "if no reply" ON snoozed to Friday WHEN the contact replies Wednesday THEN the
  conversation reopens Wednesday and the Friday nudge does not fire.
- GIVEN "if no reply" ON snoozed to Friday WHEN no reply arrives THEN it resurfaces Friday.
- GIVEN "if no reply" OFF snoozed to Friday WHEN the contact replies Wednesday THEN it still
  resurfaces Friday as scheduled (plus reopens on the reply, per existing logic).
- GIVEN the AI-suggested time WHEN shown THEN it carries a one-line "why" (e.g. "they usually
  reply mid-morning CET").
- GIVEN a past time WHEN submitted THEN the API rejects it (422).

## Edge cases & failure handling
- Timezone unknown → suggest in the user's tz; note the assumption in the "why".
- NL parser ambiguous ("next month" vs "in a month") → show the resolved date so the user
  confirms; never silently pick.
- "if no reply" but the thread has no outbound from us → still valid (nudge me to follow up);
  the resurface fires if no inbound arrives.
- Reply arrives exactly at resurface time → reply (reopen) wins; nudge suppressed (idempotent).
- AI suggestion unavailable → fall back to quick options; no blocking.
- Multi-tenant/per-user: snooze + conditional stored on `inbox_triage` scoped to owner.
- Offline/optimistic: the existing optimistic remove-from-lane path (`page.tsx:146`) still applies.

## Best-in-class bar
- **One control** for snooze AND no-reply nudge (Superhuman's insight), so users don't juggle two
  mental models — and ours ties the "if no reply" to our **sequence + reply-tracking** data
  (`outbound_emails.repliedAt`), so "no reply" is grounded in real send/reply state, not a guess.
- The AI-suggested time is grounded in **this contact's reply pattern + deal cadence**, with a
  cited "why" — competitors offer fixed presets only.

## Design sketch
- **Data:** extend `inbox_triage` (`db/schema/outbound.ts:370`) with `snooze_if_no_reply bool`
  and (optional) `snooze_reason text` for the "why". Reuse `snoozed_until`, computed reopen at
  read time (`conversations.ts:251`).
- **API:** `POST /api/inbox/triage` (`triage/route.ts`) extends the schema to accept
  `snoozeIfNoReply` + a pre-parsed `snoozeUntil`; a small NL-time helper `lib/inbox/parse-when.ts`
  (pure) resolves "2d"/"monday"/"tomorrow 9am" client-side before the POST. AI suggestion endpoint
  `GET /api/inbox/snooze-suggestion?key=` returns `{ when, why }` (grounded; fail-soft).
- **UI:** replace the fixed `SNOOZE_OPTIONS` popover (`_conversation-pane.tsx:316-341`) with a
  light popover (`--color-bg-card`, `--shadow-floating`) containing a text input (NL), the parsed
  echo, quick chips, an AI-suggested chip with its "why", and an "if no reply" toggle. lucide
  `AlarmClock` (existing) + `Sparkles` for the AI suggestion. Shortcut `h` opens snooze (aligns
  Superhuman's H + INBOX-K06). Light+dark via tokens, no emoji, no provider name, "why" cited.
- **AI:** suggestion model role = pick a resurface time from contact reply-history + tz + deal
  cadence, returns a short rationale; cached briefly. Zero-retention option (T11).
- **Security/perf:** future-time validation (existing); owner-scoped; reopen stays computed.

## Tasks (ordered)
1. `lib/inbox/parse-when.ts` NL→timestamp (pure). (verify: unit) (test: `parse-when.test.ts` —
   "2d","monday","tomorrow 9am","next week", reject garbage)
2. Extend `inbox_triage` with `snooze_if_no_reply` (+ migration). (verify: drizzle) (test: schema)
3. Extend `POST /api/inbox/triage` to persist the conditional flag. (verify: round-trip) (test:
   route — flag stored, past-time rejected)
4. `GET /api/inbox/snooze-suggestion` grounded `{when, why}`. (verify: returns cited time) (test:
   route, fail-soft)
5. Unified snooze popover UI (NL input + parsed echo + AI chip + "if no reply"). (verify: browser
   — "2d" resolves, toggle persists) (test: render)
6. Wire the conditional into INBOX-T06's resurface suppression. (verify: reply cancels nudge)
   (test: integration with T06)

## Current-state notes (VERIFY before building)
- Snooze today = 3 fixed presets: `_conversation-pane.tsx:32` `SNOOZE_OPTIONS`, popover `:316-341`.
- Triage verb + future validation: `app/api/inbox/triage/route.ts:41-49`; schema `:13`.
- Reopen-on-new-inbound already computed (this is the "reply cancels the snooze" half):
  `conversations.ts:246-253`.
- Reply-tracking data for "no reply": `outbound_emails.repliedAt`/`reply_classification`
  (`outbound.ts:299-302`). No `snooze_if_no_reply` column yet; no NL parser yet.
