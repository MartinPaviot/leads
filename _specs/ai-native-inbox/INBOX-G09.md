# INBOX-G09 — Create / advance a deal from a reply
> Theme: T7 · Autonomy rung: proactive · Priority: P1
> Pillar: P5 GTM moat

## User story
As a founder reading a prospect's reply, I want one click to create an opportunity (if none exists)
or advance the existing deal's stage — pre-filled from the thread and the reply classification, with
the proposed change shown before it's written — so the pipeline reflects reality without me leaving
the inbox or opening the CRM.

## Why (audit anchor)
Superhuman-for-Sales can "update records" only inside an *external* CRM (Salesforce/HubSpot) via its
sidebar (`ai-feature-deep-dive.md` §"Superhuman for Sales"). We **are** the CRM: creating/advancing
a deal is a native write to `deals` (`db/schema/core.ts:194`), grounded in the reply we already
classified (INBOX-G07) and the stage logic we already own (INBOX-G05). No external sync, no
round-trip — the inbox is the front of our pipeline.

## Requirements (EARS)
- WHEN a conversation resolves to a contact/company with NO open deal, the system SHALL offer "Créer
  une opportunité", pre-filling name (from company), `companyId`/`contactId` (from the thread), and a
  suggested stage from the reply classification (e.g. meeting_request → `qualification`).
- WHEN an open deal EXISTS, the system SHALL offer to advance it to the next stage suggested by the
  reply classification + current stage, and SHALL show the from→to transition before writing.
- The system SHALL show the proposed deal (name, stage, links) for confirmation and SHALL NOT write
  until the user confirms (Suggest by default per the autonomy dial, INBOX-T11); it SHALL NEVER
  auto-advance silently unless the user set that rule to Auto.
- WHEN a deal is created or advanced, the system SHALL log an `activities` row (deal create / stage
  change) with the source ("depuis la boîte de réception"), and SHALL keep it on the account timeline.
- The system SHALL never blend bookings types: amount entry routes through `lib/deals/amount.ts`
  (`projectAmount`/`platformArr`, not `value`), and the UI SHALL NOT imply ARR from a stage change
  (bookings ≠ ARR).
- The system SHALL respect role/collision context: it SHALL surface a collision caveat (INBOX-G06)
  before creating a competing deal a teammate may already own.
- The system SHALL hard-scope all writes to the viewer's tenant; a deal SHALL never be created/edited
  outside the viewer's tenant.
- The system SHALL be idempotent on intent: confirming twice (double-click / retry) SHALL NOT create
  two deals or double-advance a stage.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a classified meeting_request reply on a contact with no deal WHEN "Créer une opportunité" is
  confirmed THEN a deal is created (`stage:'qualification'`, linked to the company+contact) and an
  activity is logged.
- GIVEN an existing deal at `demo` and an interested reply WHEN "Faire avancer" is shown THEN it
  proposes `demo → proposal` (or the documented next step) and writes only on confirm.
- GIVEN the proposed change WHEN the user dismisses it THEN no deal is created/advanced.
- GIVEN amount entry on deal creation WHEN the user enters a recurring figure THEN it is stored as
  `platformArr` (not `value`) and the UI never sums it with a project amount.
- GIVEN a teammate already owns a deal on the account WHEN creating THEN a collision caveat shows
  before the write.
- GIVEN the user confirms twice rapidly WHEN processed THEN exactly one deal exists / one stage advance occurs.
- GIVEN two tenants WHEN deals are created from replies THEN no write crosses tenants.

## Edge cases & failure handling
- Multiple open deals → advancing targets the most-relevant (most-recently-updated open); the rest listed.
- Classification absent/ambiguous → suggest a conservative stage (or just "create at lead"), never a
  speculative jump to `negotiation`.
- Deal already `won`/`lost` → offer "re-open" explicitly, never silently resurrect.
- Stage enum drift → validate against `dealStageEnum`; reject an unknown stage.
- Contact has no company → create the deal on the contact, prompt to attach a company (or create one).
- Write failure → surface a non-blocking error; nothing partially written (single insert/update).
- Concurrent edit by a teammate (stage moved meanwhile) → re-read current stage before the transition;
  show a "stage changed" notice rather than overwriting blindly.

## Best-in-class bar
- **Native deal write from the inbox, grounded in the classified reply**: create/advance is a direct,
  cited write to our own pipeline — Superhuman can only update an external CRM via a sidebar. The
  suggested stage is *correct* because it's derived from the reply we sent + the reply we classified.
- **Shown-before-written + trust-gated**: the transition is previewed, gated by the autonomy dial,
  collision-aware, and bookings-honest — the inbox advances the pipeline without ever surprising the founder.

## Design sketch
- **Data:** `deals` (`db/schema/core.ts:194` — `stage`, `companyId`, `contactId`, `projectAmount`,
  `platformArr`); `activities` (deal create / `stage_changed` log). Stage-transition logic is a pure
  `lib/inbox/deal-advance.ts#nextStageFor(currentStage, classification)`.
- **API:** `POST /api/inbox/deal` `{ conversationKey, action:'create'|'advance', stage?, amount? }` →
  resolves scope + counterparty, validates against `dealStageEnum`, writes once, logs the activity.
  Reuse the existing deal-create path (mirror MCP `create_deal`, `app/api/mcp/route.ts:731`) +
  amount via `lib/deals/amount.ts`. Suggested stage from G07 classification + G05 mapping.
- **UI:** a "Pipeline" action in the G01 sidebar + on the reply badge: "Créer une opportunité" /
  "Faire avancer (demo → proposition)" as a `--color-accent` Button (lucide `Plus` / `ArrowRight`),
  a confirm popover showing the proposed deal/transition (`--color-bg-card`, `--shadow-floating`),
  collision caveat inline (`--color-warning-soft`). Shortcut: a number key invokes the primary.
  Light+dark via tokens, no emoji, no provider name, the suggested stage cited (reply classification).
- **AI:** none for the write (deterministic stage mapping); the classification comes from G07's
  existing classifier. Autonomy via T11 (Suggest by default, never auto-send, never silent advance).
- **Security/perf:** tenant scope; single atomic write; idempotency guard on confirm; re-read stage
  before transition.

## Tasks (ordered)
1. Pure `lib/inbox/deal-advance.ts#nextStageFor` over `dealStageEnum` × classification (+ create-stage
   mapping). (verify: meeting_request+no-deal → qualification; interested+demo → proposal) (test:
   `deal-advance.test.ts` — transition matrix + won/lost guards)
2. `POST /api/inbox/deal` (create | advance), scoped, validated, single write + activity log, reusing
   the deal-create path + `lib/deals/amount.ts`. (verify: create writes one deal+activity; advance
   moves one stage) (test: route test — create/advance/idempotency/cross-tenant)
3. Sidebar "Pipeline" action + confirm popover showing the transition + collision caveat. (verify:
   browser — interested reply advances demo→proposal on confirm; dismiss writes nothing) (test: render)
4. Bookings-honesty + concurrent-edit guards. (verify: recurring amount → `platformArr`, no ARR
   implied; stage moved meanwhile → "stage changed" notice) (test: amount-routing + concurrency cases)

## Current-state notes (VERIFY before building — code moves)
- `deals` + `dealStageEnum` at `db/schema/core.ts:194` (stage `:203`). The MCP server already
  implements a native `create_deal` write (`app/api/mcp/route.ts:731`) — mirror its insert shape.
- Deal-split rule: store `projectAmount`/`platformArr`, NEVER sum into `value`; display via
  `lib/deals/amount.ts#getDealAmountDisplay` (`db/schema/core.ts:208`–`:217`). Bookings ≠ ARR
  (code-review convention).
- Reply classification source = INBOX-G07 (`processReply` taxonomy); stage→action framing = INBOX-G05.
- Autonomy dial = INBOX-T11 (`applyOrSuggest`); collision = INBOX-G06 (`lib/collision/`).
- No inbox deal-create/advance endpoint exists yet (grep: none under `app/api/inbox/deal`).
