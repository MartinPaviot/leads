# INBOX-T06 — Follow-up / no-reply nudge reminders (the "if no reply" engine)
> Theme: T2 · Autonomy rung: proactive · Priority: P1
> Pillar: P4 triage / P5 GTM moat

## User story
As a user, I want the inbox to nudge me when a conversation I'm waiting on goes quiet — only if
no reply came — so I never drop a prospect, without manually tracking who owes me a response.

## Why (audit anchor)
Superhuman unifies the no-reply nudge **into** snooze via the "if no reply" toggle (`findings.md`
§B/§H). The audit calls for "follow-up reminders (no-reply nudge)" as a core triage capability
(`ai-native-mailbox-audit.md` §2). T06 is the **engine** behind INBOX-T05's "if no reply" mode:
it resurfaces a conversation only when no inbound reply arrived, and ties into our **sequence +
reply-tracking** data so "no reply" is grounded in real send/reply state — the moat angle that a
generic mailbox can't match.

## Requirements (EARS)
- WHEN a conversation is snoozed with "if no reply" (INBOX-T05) and the resurface time arrives,
  the system SHALL resurface it to the attention lane ONLY if no inbound reply occurred since the
  snooze.
- WHEN an inbound reply arrives before the resurface time, the system SHALL cancel the pending
  nudge (the conversation reopens immediately via the existing computed-reopen).
- The system SHALL offer "Remind me if no reply in N days" directly after the user sends a reply
  (a natural moment to set a follow-up), defaulting N from the deal cadence / a sensible default.
- WHEN we have an open sequence enrollment for the contact, the system SHALL reconcile the nudge
  with the sequence (don't double-nudge if the sequence will already follow up; defer to the
  sequence cadence).
- The system SHALL surface a no-reply nudge with a "why" line (e.g. "you replied 5 days ago, no
  answer since") and a one-click "draft a follow-up" (INBOX-C09, sequence-aware).
- The system SHALL never nudge on automated/bulk threads or handled conversations.
- The system SHALL keep nudges per-user/tenant; the resurface is computed/triggered against the
  owner's scoped mail only.
- The system SHALL make the nudge idempotent — a reply, a manual done, or a stop-sequence cancels
  it exactly once.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a sent reply snoozed "if no reply in 3 days" WHEN 3 days pass with no inbound THEN the
  conversation resurfaces to attention with "no answer in 3 days".
- GIVEN the same WHEN the contact replies on day 2 THEN it reopens on day 2 and no day-3 nudge
  fires.
- GIVEN the user just sent a reply WHEN the composer closes THEN an inline "remind me if no reply
  in 3 days?" affordance appears.
- GIVEN a contact with an active sequence that will follow up in 2 days WHEN the user sets a
  no-reply nudge THEN the system defers to the sequence (no duplicate nudge) and says so.
- GIVEN a resurfaced no-reply conversation WHEN opened THEN "draft a follow-up" produces a
  sequence-aware draft (INBOX-C09).
- GIVEN an automated/bulk thread WHEN any no-reply logic runs THEN it is never nudged.
- GIVEN two tenants WHEN nudges fire THEN no cross-tenant conversation resurfaces.

## Edge cases & failure handling
- Reply arrives exactly at resurface time → reply (reopen) wins; nudge suppressed (idempotent).
- Outbound bounced (no real send) → don't nudge "no reply"; the bounce path already handles it
  (`conversations.ts:235`, handled lane).
- Contact unsubscribed / sequence stopped → cancel pending nudges.
- Clock/cron lag → resurface is computed at read time too (not solely cron-driven), so a late
  cron never loses a nudge.
- Many due nudges at once → batch; cap per run; never block the inbox load.
- Multi-tenant/per-user: trigger evaluates `inbox_triage` + reply state within owner scope.

## Best-in-class bar
- "No reply" is grounded in **our own send + reply-tracking** (`outbound_emails.repliedAt`,
  `reply_classification`) and **reconciled with the live sequence**, so we don't nag when the
  cadence will already follow up — Superhuman has no sequence to reconcile against.
- The nudge lands with a **sequence-aware follow-up draft** (INBOX-C09) ready to send, turning a
  reminder into a finished next action — the revenue-motion framing, not just a ping.

## Design sketch
- **Data:** reuse `inbox_triage.snooze_if_no_reply` + `snoozed_until` (INBOX-T05). Reply state from
  `activities` (inbound) + `outbound_emails.repliedAt` (`outbound.ts:299`). Sequence state from
  `sequenceEnrollments` (`outbound.ts`); reconcile with `lib/sequences/` (enrollment.ts,
  nurture-recycle.ts, triggers.ts).
- **API:** a pure decision helper `lib/inbox/no-reply-nudge.ts` `shouldResurface({triage, lastInbound,
  lastOutbound, enrollment, now}) → boolean + why`, consumed BOTH at read time
  (`conversations.ts` snooze branch) and by an Inngest cron `inbox-no-reply-sweep` that flips due
  conditional snoozes (event-driven sweep like the existing senders, per the Inngest cost pattern).
  "Remind me if no reply" posts to `/api/inbox/triage` (snooze + conditional).
- **UI:** the post-send affordance lives where `handleSent` runs (`_conversation-pane.tsx:186`) — an
  inline chip "Remind me if no reply in 3 days" (token `--color-accent-soft`, lucide `BellRing`).
  Resurfaced items show the "why" line + a "Draft follow-up" button (lucide `Sparkles`, → INBOX-C09).
  Light+dark via tokens, no emoji, no provider name, "why" cited.
- **AI:** none for the trigger (deterministic); the follow-up draft is INBOX-C09. Default N from
  deal cadence else a constant.
- **Security/perf:** read-time + cron both owner-scoped; idempotent; batched; reconciled with
  sequences to avoid double-touch.

## Tasks (ordered)
1. `lib/inbox/no-reply-nudge.ts` pure `shouldResurface` + `why` (reconciles enrollment). (verify:
   unit) (test: `no-reply-nudge.test.ts` — reply cancels, bounce no-nudge, sequence defers, due fires)
2. Consume it in the snooze branch of `conversations.ts` (read-time resurface). (verify: due
   conditional snooze appears in attention) (test: conversations.test.ts)
3. Inngest `inbox-no-reply-sweep` (event-driven/15-min, owner-scoped, batched). (verify: cron flips
   due rows) (test: cron unit)
4. Post-send "remind me if no reply" affordance. (verify: chip appears after send) (test: render)
5. Resurfaced "why" + "Draft follow-up" (wire INBOX-C09). (verify: browser — resurfaced item offers
   a sequence-aware draft) (test: integration)
6. Cancellation idempotency (reply / done / stop-sequence). (verify: nudge fires at most once)
   (test: idempotency)

## Current-state notes (VERIFY before building)
- The "reply cancels the snooze" half already exists (computed reopen): `conversations.ts:246-253`.
- Reply-tracking + bounce: `outbound_emails.repliedAt`/`reply_classification`/`bounceType`
  (`outbound.ts:299-305`); bounce already → handled (`conversations.ts:235`).
- Sequence engine to reconcile against: `lib/sequences/enrollment.ts`, `nurture-recycle.ts`,
  `triggers.ts`; stop-sequence flow `_conversation-pane.tsx:195`.
- Post-send hook: `_conversation-pane.tsx:186` `handleSent`.
- Inngest event-driven sweep precedent: project_inngest-cost-reduction (sleepUntil + */15 sweep).
- No `snooze_if_no_reply` column or no-reply engine exists yet (depends INBOX-T05).
