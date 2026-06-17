# INBOX-N04 — No-reply / SLA-breach alerts
> Theme: T10 · Autonomy rung: proactive · Priority: P1
> Pillar: P4 triage / P5 GTM moat

## User story
As a founder, I want to be alerted when I've let an important thread go too long — a prospect who
replied and is waiting on me, or a deal thread gone silent past its SLA — so I never drop a live
opportunity because it scrolled off the screen.

## Why (audit anchor)
Superhuman folds the no-reply nudge into snooze via the "if no reply" toggle (`findings.md` §B/§H)
and surfaces follow-up reminders as a core triage capability (`ai-native-mailbox-audit.md` §2).
N04 is the **alerting layer** on top of that engine (INBOX-T05/T06): it doesn't just resurface a
snoozed thread, it raises a notification when a response SLA is breached. The moat: "overdue" is
grounded in our **own send + reply-tracking** (`outbound_emails.repliedAt`) and reconciled with
the live sequence, so we alert on a genuinely silent deal, not a guess — and the alert lands with
a ready follow-up (INBOX-C09), the revenue-motion framing a generic mailbox can't match.

## Requirements (EARS)
- The system SHALL detect two breach conditions per conversation: (a) **they replied, you haven't
  responded** within a target response SLA; (b) **you replied, no answer** past an "if no reply"
  window (the INBOX-T06 engine) on an important/deal-linked thread.
- The system SHALL raise at most one SLA-breach notification per conversation per breach event
  (idempotent), routed through `sendNotification` with a new `sla_breach` type honouring
  `notification_preferences`.
- The breach notification SHALL state the "why" (e.g. "Acme replied 2 days ago — no response yet"
  or "You followed up 5 days ago — no answer"), include a deep link to the thread, and offer a
  one-click "Draft follow-up" / "Draft reply" (INBOX-C09, sequence-aware).
- The system SHALL only alert on conversations that are important (INBOX-T04 above threshold) or
  tied to an open deal — never on automated/bulk/handled threads.
- The system SHALL reconcile with the contact's live sequence: WHEN an active sequence will follow
  up within the window, the system SHALL defer to the sequence and NOT raise a duplicate alert
  (consistent with INBOX-T06).
- The system SHALL cancel a pending breach alert WHEN the owed action happens (you respond / they
  reply / the thread is marked done / the sequence is stopped) — exactly once (idempotent).
- The system SHALL let the user configure the response SLA target (e.g. 4h / 1 day / 2 days, or
  Off) and choose whether SLA breaches may pierce focus mode (INBOX-N03), defaulting breaches as
  the one allowed focus override only if the user opts in.
- The system SHALL be per-user/tenant-scoped: breaches evaluate the owner's own mail + reply state
  within scope, and alert only the owner.
- The system SHALL evaluate breaches via an event-driven sweep (the same `/15`-style sweep as the
  INBOX-T06 no-reply engine), NOT a new per-tenant minute-cron (Inngest cost-reduction).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a prospect on an open deal replied 2 days ago and you haven't responded WHEN the response
  SLA (1 day) is breached THEN one `sla_breach` alert fires with the "why" + deep link + "Draft
  reply".
- GIVEN you followed up 5 days ago with no answer on a deal thread WHEN the no-reply window elapses
  THEN one alert fires with "no answer in 5 days" + "Draft follow-up".
- GIVEN the breach condition then the prospect replies WHEN the reply lands THEN the pending alert
  is cancelled and does not fire (or is marked resolved if already sent).
- GIVEN an active sequence will follow up tomorrow WHEN the no-reply window would breach THEN no
  duplicate alert fires (defer to sequence) and the reason says so.
- GIVEN an automated newsletter that "you haven't replied to" WHEN evaluated THEN no alert fires.
- GIVEN the SLA target = Off WHEN any thread ages THEN no SLA-breach alert fires (the inbox lane
  still shows it).
- GIVEN focus mode on AND "allow SLA breaches" off WHEN a breach occurs THEN the alert is queued
  for focus-end (INBOX-N03); with the override on, it pierces focus.
- GIVEN two tenants WHEN breaches occur THEN each owner is alerted only for their own threads.
- GIVEN the same breach is evaluated by both the read-time path and the sweep WHEN both run THEN
  the alert is created at most once (idempotent).

## Edge cases & failure handling
- Outbound bounced (no real delivery) → not a "no reply"; suppress (bounce already → handled lane).
- They replied but it's an out-of-office → not an owed response; don't alert "they're waiting".
- Clock/cron lag → breach is computed at read time too (not solely cron-driven), so a late sweep
  never loses an alert; idempotency prevents a late double-alert.
- Many simultaneous breaches (backlog import / long absence) → batch + cap per run; coalesce into a
  digest ("6 threads are overdue → review") above a count threshold, never N pings.
- Weekend/after-hours SLA → optionally count business hours only (configurable); default wall-clock.
- A thread with both conditions (they replied late AND you'd set an if-no-reply) → alert once with
  the dominant reason (owed-response wins).
- Contact unsubscribed / sequence stopped → cancel pending breach alerts.
- Cross-tenant: all reply-state reads are owner+tenant scoped.

## Best-in-class bar
- "Overdue" is grounded in **our own send/reply-tracking + the live sequence** (`outbound_emails.
  repliedAt`, `reply_classification`, enrollment reconciliation), so we alert on a genuinely silent
  deal and never nag when the cadence already will — Superhuman has no sequence to reconcile against.
- The alert is **actionable**, not a ping: it lands with a sequence-aware follow-up/reply draft
  (INBOX-C09) and the deal-grounded "why", turning a missed SLA into a finished next step.

## Design sketch
- **Data:** new `NotificationType` `sla_breach` (+ enum). Reuses INBOX-T05/T06 plumbing:
  `inbox_triage.snooze_if_no_reply` + `snoozed_until`, reply state from `activities` (inbound) +
  `outbound_emails.repliedAt`/`reply_classification`/`bounceType`, sequence state from
  `sequenceEnrollments`. Per-user SLA target + focus-override on
  `notification_preferences.preferences.sla_breach.{slaTarget,allowThroughFocus,email,inApp,slack}`.
  Idempotency via a deterministic notification key (conversation key + breach kind + breach-day).
- **API:** extend the pure `lib/inbox/no-reply-nudge.ts` (INBOX-T06) with a sibling
  `lib/inbox/sla-breach.ts` `evaluateBreach({lastInbound, lastOutbound, ownedResponseDue, enrollment,
  slaTarget, importance, now}) → {breached, kind, why}` consumed BOTH at read time
  (`conversations.ts`, to badge an overdue conversation) and by the Inngest no-reply/SLA sweep
  (`inbox-no-reply-sweep`, INBOX-T06) which now also emits `sla_breach` notifications via
  `sendNotification`. "Draft follow-up/reply" reuses INBOX-C09.
- **UI:** the breach surfaces (1) as a `NotificationBell` entry — add `sla_breach` to `typeIconMap`
  (lucide `Clock`/`TimerReset`, `--color-warning`); (2) as an inline "overdue" marker on the
  conversation row/header (token `--color-warning-soft`) with the "why" + a `Sparkles` "Draft
  follow-up" button. Resolved breaches clear the marker. Light+dark via tokens, no emoji, no
  provider name, "why" cited.
- **AI:** none for detection (deterministic); the draft is INBOX-C09. The "why" line is templated
  from the breach kind + grounded facts.
- **Security/perf:** read-time + sweep both owner-scoped; idempotent (key-based); batched + coalesced
  on backlog; reconciled with sequences to avoid double-touch; rides the existing T06 sweep (no new
  cron, cost-safe).

## Tasks (ordered, each with a verify step + test to write)
1. Add `sla_breach` to `NotificationType` + enum (+ migration) and the `sla_breach` preference
   shape (SLA target + focus override). (verify: type-checks + inserts) (test: schema/enum)
2. `lib/inbox/sla-breach.ts` pure `evaluateBreach` (owed-response + no-reply, reconciles enrollment,
   bounce/OOO suppressed). (verify: unit) (test: `sla-breach.test.ts` — owed-response breaches,
   no-reply breaches, sequence defers, bounce/OOO/automated never, reply cancels)
3. Emit `sla_breach` via `sendNotification` from the INBOX-T06 `inbox-no-reply-sweep`, idempotent
   on the deterministic key, owner-scoped. (verify: due breach → one alert; second run no-ops)
   (test: sweep integration + idempotency)
4. Read-time "overdue" badge in `conversations.ts` (so an overdue thread is visible even pre-alert).
   (verify: overdue conversation shows the marker) (test: conversations.test.ts)
5. `sla_breach` in `typeIconMap` + inline overdue marker + "Draft follow-up/reply" (wire C09).
   (verify: browser — bell entry + row marker + draft) (test: render + integration)
6. SLA target + focus-override settings in INBOX-O06 hub. (verify: Off suppresses; override pierces
   focus) (test: preference round-trip; focus integration with N03)
7. Backlog coalescing ("N overdue → review") above a count threshold. (verify: a backlog yields one
   digest, not N) (test: coalesce unit)

## Current-state notes (VERIFY before building — code moves)
- The no-reply engine this builds on is INBOX-T06 (`lib/inbox/no-reply-nudge.ts` +
  `inbox-no-reply-sweep` Inngest, event-driven `/15` per project_inngest-cost-reduction) — NOT YET
  BUILT; N04 adds SLA-breach detection + alerting on the same sweep. Snooze plumbing is INBOX-T05
  (`inbox_triage.snooze_if_no_reply`).
- Reply/bounce state: `outbound_emails.repliedAt`/`reply_classification`/`bounceType`
  (`db/schema/outbound.ts:299-305`); bounce already → handled (`lib/inbox/conversations.ts:235`).
  Reopen-on-inbound (the "reply cancels it" half) computed at `conversations.ts:246-253`.
- Sequence reconciliation: `lib/sequences/enrollment.ts`/`triggers.ts`; enrollments in
  `db/schema/outbound.ts`. Follow-up draft: INBOX-C09.
- Dispatch + per-type prefs: `lib/emails/notifications.ts:34` (union `:12`, no `sla_breach` yet);
  bell type map `components/notification-bell.tsx:38`.
- Importance gate (what counts as "important"): INBOX-T04 (`metadata.importance`). Contact reply
  pattern for SLA tuning (optional): `lib/util/follow-up-timing.ts` (`analyzeFollowUpTiming`).
- Focus override pairs with INBOX-N03. Owner scope: `lib/inbox/user-scope.ts`.
- No SLA-breach detection or alert exists today.
