# INBOX-N01 — Smart notifications (only what's important)
> Theme: T10 · Autonomy rung: helper · Priority: P1
> Pillar: P4 triage / P5 GTM moat

## User story
As a founder, I want to be notified only about mail that actually needs me — a buying-signal
reply, a hot prospect, an SLA breach — not every inbound, so the bell means "act now" instead
of "more noise", and I can ignore my inbox the rest of the day.

## Why (audit anchor)
Superhuman's whole thesis is signal over noise: Auto Archive hides low-value mail, Auto Labels
surface the meaningful ("emails needing your response"), and the inbox is built so you reach
zero on what matters (`feature-inventory.md` — Auto Archive / Get Me To Zero;
`findings.md` §F "Latest Updates"). The gap to beat: their importance is generic VIP/recency
guessing because they have no pipeline. Ours gates notifications on the **revenue-relevance
score** (INBOX-T04) grounded in our deal + signal graph, so "important" means *important to the
deal*, with a cited "why" — the moat a generic mailbox can't reach (`ai-native-mailbox-audit.md`
§4 P5, `findings.md` §H).

## Requirements (EARS)
- The system SHALL raise an inbox notification for an inbound conversation ONLY when its
  importance score (INBOX-T04) crosses a per-user threshold, never for every inbound.
- The system SHALL NOT notify on automated/bulk threads or conversations that land in the
  `handled` lane (out-of-office / unsubscribe / bounce), consistent with `buildConversations`.
- The notification SHALL carry a one-line "why it's important" derived from the T04 rationale
  (e.g. "Reply on an open deal · asked about pricing"), never an opaque "new email".
- The system SHALL route each smart notification through the existing `sendNotification`
  pipeline (in-app `notifications` row + optional email + optional Slack), honouring the user's
  `notification_preferences` and the new `inbox_reply` type, so existing channel + per-type
  opt-outs apply unchanged.
- The system SHALL be per-user/tenant-scoped: a notification is raised for the mailbox owner
  only (the conversation's inbox owner via `getInboxScope`), never fanned out to the whole tenant.
- WHEN Do-Not-Disturb / focus mode is active (INBOX-N03), the system SHALL suppress or queue the
  notification per that spec, not deliver it immediately.
- The system SHALL be idempotent per conversation: at most one "needs you" notification per new
  inbound on a conversation (dedup on conversation key + last-inbound timestamp), never re-firing
  on every sync pass.
- The system SHALL let the user tune the threshold (Off / Important only / All replies) from a
  single setting, defaulting to "Important only".
- The system SHALL be event-driven (fire when a qualifying inbound is captured), not a
  minute-polling cron that scans every tenant (per the Inngest cost-reduction constraint).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a prospect reply "can we book a demo?" on an open deal WHEN captured THEN one notification
  fires with "why" = the deal-grounded rationale, and it appears in the bell + (if enabled) email.
- GIVEN a generic "thanks, will review" reply with no deal WHEN captured AND threshold = "Important
  only" THEN no notification fires (it still appears in the inbox attention lane).
- GIVEN an out-of-office auto-reply WHEN captured THEN no notification fires (handled lane).
- GIVEN the same conversation receives a second sync pass with no new inbound WHEN re-evaluated
  THEN no duplicate notification is created.
- GIVEN the user set threshold = "All replies" WHEN any genuine inbound reply arrives THEN a
  notification fires (still excluding automated/handled).
- GIVEN focus mode is on (INBOX-N03) WHEN a qualifying reply arrives THEN the notification is
  queued for the focus-end digest, not delivered live.
- GIVEN two tenants WHEN qualifying replies arrive THEN each owner is notified only for their own
  mailbox; no cross-tenant notification.
- GIVEN the user disabled the `inbox_reply` type in preferences WHEN a qualifying reply arrives
  THEN no in-app/email notification is created for it.

## Edge cases & failure handling
- Importance not yet computed (pre-enrich inbound) → defer the notify decision to the enrich pass
  that writes the score (INBOX-T04), rather than notify on an unscored row.
- Score borderline / flapping near the threshold → decide once on capture using the persisted
  score; do not re-notify if a later recompute nudges it over.
- Sender resolves to an unknown contact → still notifiable if intent is high (e.g. inbound demo
  request); "why" notes "new sender", no fabricated CRM facts.
- `sendNotification` email channel down (no `RESEND_API_KEY`) → in-app row still created; email
  silently skipped (existing behaviour).
- Slack webhook missing → Slack channel skipped (existing non-critical path).
- Bulk burst (many qualifying replies at once, e.g. a campaign wave) → cap per-run + coalesce
  into a single "N replies need you" notification above a count threshold, never N separate pings.
- Multi-account user → notification attributes the mailbox it landed in (per-mailbox attribution).

## Best-in-class bar
- "Important" = **revenue relevance** (deal stage + fresh signal + buyer intent, INBOX-T04), each
  **cited** — Superhuman/Shortwave notify on generic VIP/recency. Ours is right because it reads
  our own pipeline, and it explains *why* it pinged you.
- It **reuses** the shipped 3-channel notification pipeline + per-type preferences, so smart
  notifications inherit email + Slack + in-app and granular opt-outs for free — no new plumbing,
  no new noise vector.

## Design sketch
- **Data:** new `NotificationType` value `inbox_reply` (extend the union in
  `lib/emails/notifications.ts:12` + `notificationTypeEnum`, `db/schema/outbound.ts:408`). Reuses
  the persisted importance score/rationale on the conversation (`metadata.importance`, INBOX-T04)
  and `notification_preferences.preferences.inbox_reply.{email,inApp,slack}`. A per-user threshold
  stored on `notification_preferences.preferences.inbox_reply.threshold` ("off"|"important"|"all").
- **API:** a pure gate `lib/inbox/notify-gate.ts` `shouldNotify({importance, lane, threshold,
  isAutomated}) → {notify, whyLine}`; called from the capture/enrich seam, not the request path.
  Delivery goes through the existing `sendNotification(...)` (`lib/emails/notifications.ts:34`).
  The in-app bell already reads `GET /api/notifications` — no new read endpoint.
- **UI:** no new surface — qualifying notifications appear in the existing `NotificationBell`
  (`components/notification-bell.tsx`), which already maps a type → lucide icon + token color;
  add an `inbox_reply` entry (lucide `Reply`, `--color-info`) to `typeIconMap` (`:38`). The "why"
  line renders as the notification `body` (token `--color-text-secondary`, existing styling).
  Setting lives in INBOX-O06's per-feature autonomy hub: a 3-way "Inbox replies: Off / Important
  only / All". Light+dark via tokens, no emoji, no provider name, "why" cited.
- **AI:** none new — the importance score + rationale come from INBOX-T04 (cached at enrich,
  zero-retention option per T11). The gate is deterministic.
- **Security/perf:** owner-scoped (never tenant fan-out for inbox replies); event-driven trigger
  on capture (no per-tenant polling cron); idempotent dedup on conversation key + last-inbound ts;
  bulk coalescing caps notification volume.

## Tasks (ordered, each with a verify step + test to write)
1. Add `inbox_reply` to the `NotificationType` union + `notificationTypeEnum` (+ migration).
   (verify: `sendNotification({type:"inbox_reply"})` type-checks + inserts) (test: schema/enum test)
2. `lib/inbox/notify-gate.ts` pure `shouldNotify` (threshold + lane + automated + importance).
   (verify: unit) (test: `notify-gate.test.ts` — demo-on-deal notifies, generic at "important"
   doesn't, OOO never, "all" notifies on any genuine reply)
3. Call the gate at the capture/enrich seam and dispatch via `sendNotification` (owner-scoped),
   with idempotent dedup on conversation key + last-inbound. (verify: one row per new inbound)
   (test: capture integration — no duplicate on re-sync)
4. Add `inbox_reply` to `typeIconMap` in `notification-bell.tsx`. (verify: bell renders the new
   type with its icon/color) (test: render)
5. 3-way threshold setting in INBOX-O06 hub + persist to `preferences.inbox_reply.threshold`.
   (verify: switching to "Off" stops notifications) (test: preference round-trip)
6. Bulk coalescing above a count threshold ("N replies need you"). (verify: a campaign wave makes
   one notification, not N) (test: coalesce unit)
7. Respect INBOX-N03 focus mode (queue instead of deliver). (verify: focus-on queues; focus-end
   flushes) (test: integration with N03)

## Current-state notes (VERIFY before building — code moves)
- `sendNotification` 3-channel (in-app + email branded shell + Slack) honouring
  `notification_preferences`: `lib/emails/notifications.ts:34-148`; per-type prefs read at `:44-46`.
- `NotificationType` union: `lib/emails/notifications.ts:12-22` (no `inbox_reply` yet).
- `notifications` table `db/schema/outbound.ts:402`; `notification_preferences` `:425` (per-type
  JSONB `preferences` at `:435`); `notificationTypeEnum` is the enum the `type` column uses.
- In-app bell already polls `GET /api/notifications` every 30s + maps type→icon:
  `components/notification-bell.tsx:38` (`typeIconMap`), `:81` (fetch), `:96` (poll).
- Importance score + rationale source: INBOX-T04 (`lib/inbox/importance.ts`, cached on
  `metadata.importance`) — NOT YET BUILT; this spec depends on it.
- `handled`/automated lane derivation (what to never notify on): `lib/inbox/conversations.ts`
  (`HANDLED_LABELS`, `inboundIsAutomated → handled`). Owner scope: `lib/inbox/user-scope.ts`.
- No inbox-specific notification gate exists yet; cron fan-out antipattern to avoid lives in
  `inngest/skill-crons.ts` (per-tenant scans → notification rows).
