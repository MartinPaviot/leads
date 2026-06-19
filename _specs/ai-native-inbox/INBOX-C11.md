# INBOX-C11 — Undo send + send later (Smart Send)
> Theme: T4 · Autonomy rung: helper · Priority: P0
> Pillar: P3 writing

## User story
As a user, I want a few seconds to take back a send, and the option to schedule a reply for later
(or for the recipient's working hours), so a mis-send is recoverable and I send at the right time.

## Why (audit anchor)
Superhuman's composer offers **Send · Smart Send · Remind me · Share draft** (`ai-feature-deep-dive.md`
§"FULL AI-reply flow" step 3) and Settings expose **Send Later** + **Undo Send** + **Send + Mark
Done** (`feature-inventory.md` §Advanced/MCP). Undo-send and send-later are baseline expectations of
a fast inbox (`audit.md` §2 Compose ergonomics). OUR mapping: "Smart Send" = our **sequence +
signal-freshness + no-reply-nudge engine** (`_UI-DNA.md` §"Smart Send/Remind me"), and natural-
language time input ("monday", "2d") matches the teardown's snooze parser (`findings.md` §B).

## Requirements (EARS)
- WHEN the user sends a reply, the system SHALL hold the send for a short, configurable undo window
  (default ~10s) during which a single "Undo" cancels it before dispatch.
- The system SHALL offer "Send later" with both quick options (tomorrow / Monday / this evening) and a
  natural-language time input ("2d", "next week 9am"), parsed to an explicit scheduled time shown back
  to the user before confirming.
- The system SHALL offer a "Smart Send" option that defers to the recipient's working hours and respects
  sequence/no-reply state (do not send if the prospect already replied; do not collide with a queued
  sequence send) — our engine, not a generic delay.
- A scheduled send SHALL be visible and editable (reschedule/cancel) before it fires.
- The system SHALL dispatch a scheduled/held send exactly once (no double-send), reusing the outbound
  send path and idempotency that already guards drafts.
- The system SHALL mark the reply done on send if "Send + Mark Done" is enabled (reuse the existing
  done-lane mechanism).
- The system SHALL be tenant/user-scoped; scheduled sends SHALL only ever go from the user's own mailbox.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the user clicks Send WHEN within the undo window THEN clicking "Undo" cancels the send and
  restores the editable draft; no email leaves.
- GIVEN the user picks "Send later → 2d" WHEN confirmed THEN the resolved time is shown (e.g. "Wed 9:00")
  and the email dispatches then, once.
- GIVEN a scheduled send WHEN the user reschedules or cancels before it fires THEN the change takes
  effect and the email does not send at the old time.
- GIVEN "Smart Send" WHEN the recipient is outside working hours THEN the send is deferred to their next
  working window; IF the prospect replies before it fires THEN Smart Send holds and asks the user.
- GIVEN a scheduled send and the worker runs twice (retry) THEN the email is sent exactly once.
- GIVEN "Send + Mark Done" is on WHEN the email is sent THEN the conversation moves to Done (existing lane).

## Edge cases & failure handling
- App closed/offline during the undo window → the held send still dispatches server-side after the window
  (the window is server-tracked, not just client-side), unless undone.
- Reschedule past a sequence step / after the prospect replied → Smart Send re-evaluates and warns.
- Time parse ambiguity ("Friday" — which?) → resolve to the next occurrence and show it for confirmation.
- DST / timezone changes between schedule and fire → fire at the intended wall-clock time.
- Recipient working hours unknown → fall back to the user's working hours; label the assumption.
- Multi-tenant: scheduled rows are tenant/user-scoped; only the owning mailbox sends.

## Best-in-class bar
- "Smart Send" is backed by our **real sequence + signal-freshness + no-reply** engine, so it does more
  than delay — it won't send into a reply or collide with a queued step (Superhuman's Smart Send can't
  reason over an outbound graph it doesn't own).
- Natural-language time input everywhere (send-later, reminders, snooze) shares ONE parser with INBOX-T05,
  so the whole product speaks "2d / next week" consistently.

## Design sketch
- **Data:** `outbound_emails` needs a **`scheduled_for` (timestamptz, nullable)** column + a status for
  scheduled/held (e.g. `status='scheduled'`) — TODAY there is no such column (the table has `status` and
  `sent_at` only). A held-undo send is a very-near-future `scheduled_for`. The send worker claims rows
  atomically (reuse the existing claim/idempotency that prevents draft double-send).
- **API:** `POST /api/inbox/send` accepts `{ scheduleFor?, smartSend?, markDone? }`; `PATCH/DELETE
  /api/inbox/send/:id` to reschedule/cancel; a worker (`inngest`) dispatches due rows once. Smart Send
  resolves the time via working-hours + sequence/no-reply state (`lib/sequences/*`, `lib/signals/freshness.ts`).
  Time parsing shared with INBOX-T05.
- **UI:** composer send button becomes a split-button in `_conversation-pane.tsx`: primary **Send**, caret
  → **Send later** (quick options + NL input) + **Smart Send**. After send, an "Undo" toast/snackbar for
  the window (`Undo2`/`Clock` lucide icons). Scheduled sends listed (e.g. an Outbound/"Scheduled" view).
  Light+dark via tokens, no emoji, no provider name.
- **AI:** none for the mechanism; NL time parsing is deterministic (shared parser), not an LLM call.
- **Security/perf:** atomic claim + idempotency → exactly-once; server-tracked undo window (survives app
  close); tenant/user + mailbox scope on dispatch.

## Tasks (ordered, each with verify + test)
1. Schema: add `outbound_emails.scheduled_for` + scheduled/held status; migration. (verify: column exists;
   send worker query filters on it) (test: schema/migration shape test).
2. Send API + worker: hold for undo window, schedule for a time, dispatch due rows exactly once (atomic
   claim, reuse draft idempotency). (verify: held send cancellable; scheduled fires once even on retry)
   (test: `send-schedule.test.ts` incl. double-run idempotency).
3. NL time parser shared with INBOX-T05 ("2d","next week 9am" → explicit time shown). (verify: parses +
   echoes resolved time) (test: parser unit incl. ambiguity/DST).
4. Smart Send: defer to recipient working hours; hold on prospect-reply / queued-step collision. (verify:
   off-hours defers; reply-before-fire holds) (test: smart-send unit over sequence/no-reply fixtures).
5. Composer split-button + Undo snackbar + scheduled list + Send+Mark-Done. (verify: browser — undo works
   offline-safe; reschedule/cancel; done on send) (test: UI + lane test).

## Current-state notes (VERIFY before building — code moves)
- `outbound_emails` (`db/schema/outbound.ts:274`) has `status` (`:293`, default `draft`) and `sent_at` but
  **NO `scheduled_for`** — this spec adds it. Draft consume → `status='skipped'` already proves the
  non-sending/terminal pattern (`/api/inbox/drafts/[id]/consume`).
- The send worker + atomic-claim/idempotency that prevents double-send EXISTS (sequence/outbound senders;
  see `MEMORY` Inngest cost-reduction double-send fix) — REUSE its exactly-once claim for scheduled sends.
- Done lane EXISTS (`inbox_triage` done/snoozed with computed reopen, `lib/inbox/conversations.ts`); wire
  "Send + Mark Done" to it. NL time parser is shared with INBOX-T05 (build once).
