# INBOX-C03 — Auto-draft (pre-written, staged for approval)
> Theme: T4 · Autonomy rung: proactive · Priority: P0
> Pillar: P3 writing / P5 GTM moat (cross)

## User story
As a founder, I want a reply already written and waiting on the threads that clearly need one, so
I can approve-and-send instead of starting from a blank composer — but I always stay the sender.

## Why (audit anchor)
Superhuman's **Auto Drafts** pre-write full reply replies unprompted and stage them for you
(`feature-inventory.md` §"Auto Drafts"; `audit.md` autonomy rung 3 "a draft is *waiting*").
Crucially the teardown shows **three triggers** — follow-up due, a response is needed, and a
scheduling request — and the draft **stays updated as the calendar changes**. We already have the
exact staging mechanism: the reply-handler inserts `outbound_emails` rows with `status='draft'`,
the detail route surfaces the freshest one after the last inbound (`detail/route.ts:73-100`), and
the composer prefers it (`_conversation-pane.tsx:135`). C03 = drive that proactively on the three
triggers, grounded + cited, human-in-the-loop (Lightfield's approval spine, `audit.md` §1).

## Requirements (EARS)
- The system SHALL pre-compute a draft reply for a thread when ONE of three triggers fires:
  (a) an inbound that needs a response (per intent/priority), (b) a no-reply follow-up becomes due,
  (c) an inbound scheduling request.
- The system SHALL stage the draft as a non-sending `outbound_emails` row (`status='draft'`,
  `sentAt IS NULL`) so the send worker never picks it up (matching today's contract).
- The system SHALL only surface a staged draft created AFTER the prospect's last inbound; older
  drafts SHALL be treated as stale and hidden (mirror `detail/route.ts:93-99`).
- WHEN a scheduling-trigger draft proposes calendar slots, the system SHALL keep those slots fresh:
  if the calendar changes before send, the draft SHALL be regenerated/invalidated, never offering a
  taken slot (the "stays updated as calendar changes" behaviour).
- The system SHALL ground the draft in the contact/deal context with citations (reuse INBOX-C01)
  and SHALL NOT auto-send — approval is mandatory (the user clicks Send/Insert).
- The system SHALL show WHY a draft exists ("Follow-up due: 5 days no reply" / "Scheduling request"
  / "Needs a response") so the proactivity is auditable.
- The system SHALL respect the per-feature autonomy dial (INBOX-T11 / INBOX-O06): a user can set
  auto-draft off, suggest-only, or auto-stage per lane/persona; default = staged-for-approval.
- The system SHALL be tenant/user-scoped, rate-limited, and honour zero-retention (no stored draft
  body when P03 is enabled — fall back to on-open generation).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an inbound that needs a response WHEN it is captured THEN within the sync cycle a staged
  draft exists and the thread shows a "Draft ready" affordance with its reason.
- GIVEN a staged draft WHEN the user opens the thread THEN the composer pre-fills from it (existing
  `preparedDraft` path) and on send the draft is consumed (`/api/inbox/drafts/[id]/consume`).
- GIVEN a no-reply follow-up trigger WHEN it fires THEN the staged draft is a follow-up (reuse
  INBOX-C09), not a fresh cold message.
- GIVEN a scheduling-request inbound WHEN drafted THEN the draft proposes real open slots (INBOX-C10)
  and a sovereign visio link; IF a proposed slot is booked before send THEN the draft no longer
  offers it.
- GIVEN auto-draft is set to "off" for a lane WHEN matching mail arrives THEN no draft is staged.
- GIVEN a new inbound arrives on a thread that already has a staged draft WHEN re-evaluated THEN the
  stale draft is superseded (hidden) and a fresh one is staged for the new last-inbound.
- GIVEN zero-retention is enabled WHEN a trigger fires THEN no draft body is persisted; instead the
  thread is flagged "reply suggested" and generates on open.

## Edge cases & failure handling
- Thread with an active sequence enrollment → don't double-stage; defer to the sequence (link via
  the enrollment surfaced in `detail/route.ts:40-68`); offer to stop the sequence (existing action).
- Multiple inbound in quick succession → debounce; stage one draft for the latest.
- Generation failure → stage nothing, leave the thread to manual/INBOX-C02; never stage a partial.
- Collision: a teammate already replied (INBOX-G06) → suppress auto-draft, show the collision notice.
- Draft becomes stale (new inbound, calendar change) → mark superseded, never silently send.
- Multi-tenant: drafts are tenant-scoped `outbound_emails`; only the owning user sees/consumes them.

## Best-in-class bar
- The staged draft is **grounded + cited** (deal stage, last interaction, signals) and carries a
  visible **trigger reason** — Superhuman's Auto Drafts don't explain the deal logic or cite sources.
- Scheduling drafts are kept **calendar-fresh** against our own sovereign calendar, and the visio is
  sovereign (Jitsi), not a proprietary Meet/Teams room — a draft they can't produce.
- It reuses our **existing** draft-staging contract (`outbound_emails status='draft'` + consume), so
  there is no double-send risk and it inherits the personal-inbox scope.

## Design sketch
- **Data:** `outbound_emails` (`status='draft'`, `bodyText`, `contactId`, `tenantId`) — the existing
  staging table (`db/schema/outbound.ts:274`, `bodyText:288`, `status:293`). A `metadata.autoDraftReason`
  records the trigger. Triggers read `activities.intent`/priority + sequence/no-reply state.
- **API/jobs:** extend the sync/enrich pass (`inngest/sync-functions.ts`) and/or the reply-handler to,
  per trigger, call the C01 grounded-draft generator and INSERT a `status='draft'` row (idempotent on
  `contactId` + last-inbound timestamp). Reuse INBOX-C09 for the follow-up variant and INBOX-C10 for
  scheduling. Surfacing is already done by `detail/route.ts:73-100`; consume by
  `/api/inbox/drafts/[id]/consume`.
- **UI:** the thread row + pane show a "Draft ready · <reason>" pill (Badge in `--color-info-soft`,
  `FileText` lucide icon) in `_conversation-list.tsx`/`_conversation-pane.tsx`; opening pre-fills the
  composer (existing `preparedDraft` branch `_conversation-pane.tsx:135`). Autonomy control lives in
  the settings hub (INBOX-O06). Light+dark via tokens, no emoji, no provider name, cited.
- **AI:** reuse C01 (grounded, voice-matched, cited) via `tracedGenerateObject` /
  `claude-sonnet-4-6`; `_trace.agentId="auto-draft"`.
- **Security/perf:** generated in the background job under the LLM rate limit; staged rows are
  tenant-scoped and never sent; zero-retention → flag-only mode.

## Tasks (ordered, each with verify + test)
1. Trigger detection: a pure `lib/inbox/auto-draft-triggers.ts` classifying a thread into
   {needs_response | follow_up_due | scheduling | none} from intent/priority/no-reply/sequence state.
   (verify: unit over fixtures) (test: `auto-draft-triggers.test.ts`).
2. Background stager: on trigger, generate via C01 and INSERT one `status='draft'` row idempotently
   (skip if active sequence or collision). (verify: a needs-response inbound yields exactly one staged
   draft) (test: stager integration with idempotency + sequence/collision skips).
3. Surfacing/consume reuse: confirm `detail/route.ts` shows only post-last-inbound drafts and the pill
   renders with its reason; send consumes the draft. (verify: browser — draft pre-fills, sends,
   disappears) (test: detail-shape + consume test).
4. Calendar-fresh scheduling drafts: re-validate proposed slots at open/send; invalidate on conflict
   (wire INBOX-C10). (verify: book a proposed slot elsewhere → draft drops it) (test: slot-freshness unit).
5. Autonomy dial + zero-retention: honour off/suggest/auto per lane (INBOX-O06); flag-only under P03.
   (verify: off → nothing staged; P03 → no body persisted) (test: dial + retention test).

## Current-state notes (VERIFY before building — code moves)
- Staging contract EXISTS: reply-handler inserts `outbound_emails status='draft'`; surfaced by
  `app/api/inbox/conversations/detail/route.ts:73-100` (only post-last-inbound), preferred by
  `_conversation-pane.tsx:135`, consumed by `app/api/inbox/drafts/[id]/consume/route.ts` (→ `skipped`).
- The three TRIGGERS and the "stays calendar-fresh" behaviour do NOT exist yet — this spec adds the
  proactive driver + slot re-validation on top of the existing staging.
- Sequence enrollment for the thread is already loaded (`detail/route.ts:40-68`) → use it to avoid
  double-staging. Autonomy dial + zero-retention modes are specced in INBOX-O06 / INBOX-P03.
