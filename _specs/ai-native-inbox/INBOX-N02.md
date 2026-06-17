# INBOX-N02 — Morning brief + end-of-day wrap digest
> Theme: T10 · Autonomy rung: proactive · Priority: P1
> Pillar: P4 triage / P5 GTM moat

## User story
As a founder, I want a short Morning Brief (what needs me today) and an End-of-Day Wrap (what
moved, what's still open) delivered to my inbox and the app — grounded in my real pipeline — so I
start and close the day knowing the revenue state without digging through mail.

## Why (audit anchor)
Superhuman ships exactly these as **pre-built MCP Skills** — "Morning Briefing" and
"End-of-Day Wrap-Up" — schedulable agent workflows that summarize your inbox/calendar/tasks
(`ai-feature-deep-dive.md` "Pre-built Skills"; `findings.md` §F "Latest Updates"). The gap to
beat: theirs summarizes mail + calendar only. Ours is **revenue-native** — it reuses our cross-page
"Up next / Needs you" feed (replies needing answers, deals at risk, today's meetings/tasks) and
cites every line, so the brief is the founder's GTM state, not an inbox recap
(`ai-native-mailbox-audit.md` §4 P5; the moat).

## Requirements (EARS)
- The system SHALL generate a Morning Brief once per user per morning containing: replies that
  need them (the inbox attention lane, INBOX-N01/T04 ordered), deals at risk, today's meetings,
  and today's tasks — reusing the existing `/api/home/up-next` builders, not a parallel pipeline.
- The system SHALL generate an End-of-Day Wrap once per user per evening containing: what closed
  or moved today (replies handled, deals advanced/won/lost, meetings completed), and what is still
  open going into tomorrow (unanswered important replies, due tasks).
- Each digest line SHALL carry a deep link into the app (thread / deal / meeting) and, where it
  states a fact, its source — never an unsourced claim (citations-everywhere convention).
- The system SHALL deliver each digest through the branded email shell (`renderBrandedEmail` +
  `getBrandedEmailAttachments`) AND as an in-app digest the user can open from the bell/feed,
  honouring `notification_preferences` (new `digest` type with `{email,inApp}`).
- The system SHALL be per-user/tenant-scoped: each digest reflects only that user's own mailbox
  + the entities they can see (`getInboxScope` + tenant scope), never the whole workspace.
- The system SHALL respect the user's timezone and a configurable send time (default Morning 07:30
  local, Wrap 17:30 local), and SHALL let the user turn either digest off independently.
- WHEN there is nothing to report (empty attention lane, no movement), the system SHALL skip the
  send entirely (no "you have 0 things" emails), or send a one-line "all clear" only if the user
  opted into that.
- The system SHALL be driven by a SINGLE scheduled sweep that selects due users by local-time
  window and dispatches per-user work as events — NOT one cron per tenant and NOT minute-polling
  (per the Inngest cost-reduction constraint).
- The system SHALL be idempotent per user per day per kind: re-running the sweep SHALL NOT send a
  second Morning Brief / Wrap to a user who already received today's.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a founder with 3 replies needing answers + 1 deal at risk + 2 meetings WHEN their morning
  window hits THEN one Morning Brief email + in-app digest lists those, each deep-linked, branded.
- GIVEN a day where 2 deals advanced and 1 meeting completed WHEN the evening window hits THEN the
  Wrap summarizes that movement plus the still-open important replies, deep-linked.
- GIVEN a user whose attention lane is empty and nothing moved WHEN the window hits THEN no email
  is sent (unless "all clear" opted in).
- GIVEN a user in `Europe/Zurich` with default times WHEN it is 07:30 in Zurich THEN their Morning
  Brief sends (not at 07:30 UTC).
- GIVEN the sweep runs twice in the same window WHEN re-evaluated THEN the user receives the brief
  exactly once (idempotent).
- GIVEN the user turned the Wrap off but kept the Brief WHEN evening comes THEN only the Brief
  setting governs; no Wrap is sent.
- GIVEN any digest line WHEN rendered THEN it links to the right in-app surface and shows its
  source for asserted facts; no provider name appears.
- GIVEN two tenants WHEN digests send THEN each user's digest contains only their own scoped data.

## Edge cases & failure handling
- User has no connected mailbox → the inbox section is empty/omitted; still send deal/meeting/task
  sections if non-empty (or skip if all empty).
- `RESEND_API_KEY` absent → email skipped; the in-app digest is still written (degrade, never throw).
- Up-next builders partially fail (a lane errors) → that lane degrades to empty independently (the
  route already does this); the digest sends with the lanes that succeeded.
- Very large attention lane → cap the listed items (e.g. top 8 by importance) with a "+N more →
  open inbox" link, never an unbounded email.
- DST / timezone change → recompute the local window each run; never double-send across a DST shift
  (idempotency key is user+date+kind in the user's tz).
- A user across multiple mailboxes → one digest, sections attribute the mailbox where relevant.
- Sweep lag (cron late) → the local-time window is a range (not an instant) so a late run still
  catches due users; idempotency prevents a catch-up double-send.
- Focus mode / DND (INBOX-N03) does NOT suppress the scheduled digest (it's the calm summary), but
  honours the channel prefs.

## Best-in-class bar
- The digest is **revenue-native and cited**: it reuses the same "Needs you / Actualités" feed the
  founder already trusts (`buildNeedsYou`/`buildActualites`), so the Morning Brief is the GTM state
  — deals at risk, replies that move money — not an inbox recap. Superhuman's Skills summarize mail;
  ours summarizes the pipeline.
- It **reuses** the branded email shell + the up-next builders + the notification-preferences
  system, so it's consistent chrome, zero new read-logic, and respects existing opt-outs — and it
  runs on ONE event-driven sweep, honouring the Inngest cost discipline rather than a cron per skill.

## Design sketch
- **Data:** new `NotificationType` `digest` (+ enum) with `preferences.digest.{email,inApp,
  morningTime,wrapTime,morningOn,wrapOn,allClear}` on `notification_preferences`. Idempotency via a
  lightweight `digest_sends(user_id, tenant_id, kind, sent_for_date)` unique row (or reuse a
  `notifications` row with a deterministic key). Timezone from the user's profile/preferences.
- **API:** extract a pure `lib/inbox/digest.ts` `buildMorningBrief(scopeBundle)` /
  `buildEndOfDayWrap(scopeBundle)` that consumes the SAME inputs as `/api/home/up-next`
  (`buildNeedsYou`, `buildActualites`, summary metrics) and returns a structured digest
  `{sections:[{title, items:[{text, href, source}]}]}`. Render to email with `renderBrandedEmail`
  (sections as body HTML, primary CTA "Open Elevay"). An in-app `GET /api/inbox/digest/today`
  returns the same structure for the feed view.
- **Inngest:** ONE function `inbox-digest-sweep` on a coarse cron (e.g. every 30 min) that selects
  users whose local Morning/Wrap time falls in the current window and `inngest.send` a per-user
  `inbox/digest-requested {userId, tenantId, kind}`; a consumer builds + delivers + records the
  idempotency row. This mirrors the event-driven dispatcher pattern (sweep + per-entity events),
  NOT the per-tenant `skill-crons.ts` fan-out. Reuses `sendNotification` for the in-app row.
- **UI:** in-app digest = a light card (`--color-bg-card`, `--shadow-card`) at the top of `/home`
  or a "Today's brief" entry reachable from the feed; sections with deep-linked rows, lucide
  `Sunrise` (Morning) / `Moon` (Wrap), each row using token text + source popover. The email uses
  the existing branded shell verbatim. Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** optional one-line natural-language summary at the top of each digest ("3 replies need
  you; Acme advanced to proposal") generated once at send and cached on the digest record
  (zero-retention option, T11); the body is deterministic from the feed (no per-line LLM).
- **Security/perf:** per-user scope via `getInboxScope` + tenant scope; single sweep + events
  (cost-safe); idempotency key user+date+kind; item caps bound email size; lanes degrade independently.

## Tasks (ordered, each with a verify step + test to write)
1. Add `digest` to `NotificationType` + enum (+ migration) and the `digest` preference shape.
   (verify: type-checks + inserts) (test: schema/enum)
2. `lib/inbox/digest.ts` pure `buildMorningBrief` / `buildEndOfDayWrap` over the up-next inputs.
   (verify: unit on fixtures) (test: `digest.test.ts` — needs-you + at-risk in brief; movement +
   open in wrap; empty → skip flag)
3. Email render via `renderBrandedEmail` (sections → body HTML, CTA, item cap). (verify: snapshot
   HTML has logo cid + sections + deep links) (test: render-email)
4. `GET /api/inbox/digest/today` returning the in-app structure (scoped). (verify: returns sections
   for a seeded user) (test: route, scope)
5. Inngest `inbox-digest-sweep` (single coarse cron → per-user `inbox/digest-requested` events) +
   consumer that builds, delivers via `sendNotification` + email, and records idempotency.
   (verify: due user gets one brief; second sweep no-ops) (test: sweep unit + idempotency)
6. Timezone + per-kind on/off + send-time settings in INBOX-O06 hub. (verify: Zurich user sends at
   local 07:30; Wrap-off suppresses) (test: window selection unit)
7. In-app "Today's brief" card on `/home`. (verify: browser — card lists deep-linked rows)
   (test: render)

## Current-state notes (VERIFY before building — code moves)
- Up-next builders to reuse (DON'T re-query): `lib/home/up-next` (`buildNeedsYou`, `buildKpis`,
  `buildActualites`, types `ReplyInput`/`DealRiskInput`/`MeetingInput`/`TaskInput`); the route
  `app/api/home/up-next/route.ts` already assembles replies (personal-scoped via `getInboxScope`,
  `:91`), deals at risk, today's meetings/tasks, and a real-event feed — each lane degrades to
  empty independently (`:31-74`, `loadReplies` `:78`, `loadActualites` `:153`).
- Branded email shell: `lib/emails/email-shell.ts` (`renderBrandedEmail` `:38`,
  `getBrandedEmailAttachments` `:113`, `escapeHtml` `:130`); `EMAIL_FROM` `lib/emails/from.ts`.
- Notification dispatch + per-type prefs: `lib/emails/notifications.ts:34`; types union `:12`.
- Inngest cost discipline: AVOID the per-tenant fan-out cron shape in `inngest/skill-crons.ts`
  (`getActiveTenantIds` → per-tenant `step.run` → notifications). Prefer the event-driven sweep
  pattern (project_inngest-cost-reduction: sweep + sleepUntil + per-entity events). Hourly cron
  precedent: `inngest/auto-briefing-trigger.ts` (`cron: "0 * * * *"`, windowed catch-once).
- No digest builder, digest endpoint, or digest cron exists yet. Depends on INBOX-T04 (importance
  ordering) for "important replies"; degrades to recency order if T04 not yet shipped.
