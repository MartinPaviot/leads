# INBOX-G05 — Suggested next action tied to deal stage
> Theme: T7 · Autonomy rung: proactive · Priority: P1
> Pillar: P5 GTM moat

## User story
As a founder reading a prospect's email, I want one suggested next action that fits where the deal
actually is — book the demo at qualification, send the proposal at proposal stage, nudge for a
decision at negotiation — with the reason it's suggested, so the inbox moves the revenue motion
forward, not just my unread count.

## Why (audit anchor)
Superhuman optimizes *speed* — its actions are Done / Snooze / Reply, stage-blind (`findings.md`
§G). Our thesis is the opposite: every triage, draft and reminder is tied to the deal and the next
action (`findings.md` §H.5). We own the deal graph — `deals.stage` (`dealStageEnum`:
lead/qualification/demo/trial/proposal/negotiation/won/lost) plus the cited context from G01/G03/
G04 — so we can propose the *right* move for the stage, with a "why", which Gmail/Superhuman
structurally cannot.

## Requirements (EARS)
- WHEN a conversation resolves to a contact/company with an open deal, the system SHALL surface ONE
  primary suggested next action chosen by the deal's `stage`, plus an optional secondary.
- The system SHALL map stage → action deterministically (e.g. qualification → "Proposer un créneau
  de démo"; demo/trial → "Planifier le deep-dive"; proposal → "Relancer sur la proposition";
  negotiation → "Demander la décision"; lead → "Qualifier"), and SHALL show the mapping reason
  ("Étape : proposition").
- The system SHALL make each suggested action one-click and route it to the existing capability:
  book → INBOX-G10/meeting-book; reply/draft → INBOX-G08 grounded draft; advance → INBOX-G09;
  nudge → the no-reply/sequence engine.
- WHEN there is NO deal, the system SHALL suggest "Créer une opportunité" (INBOX-G09) rather than a
  stage action.
- The system SHALL never invent a stage or a next step not grounded in the deal record; if the stage
  is unknown it falls back to a neutral "Répondre".
- The system SHALL respect the autonomy dial (INBOX-T11): a suggestion is staged for one-click
  approval and SHALL NOT auto-execute (and never auto-send) unless the user set that rule to Auto.
- The system SHALL surface a collision caveat (INBOX-G06) on the suggestion when a teammate is
  already engaged ("Marc a appelé il y a 2 j — coordonner avant").
- The system SHALL hard-scope to the viewer's tenant; deal stage read only for the viewer's tenant.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread whose contact has a deal at `proposal` WHEN opened THEN the suggested action is
  "Relancer sur la proposition" with reason "Étape : proposition", one-click to a grounded draft.
- GIVEN a deal at `qualification` WHEN opened THEN the suggestion is "Proposer un créneau de démo",
  one-click to the meeting booker (G10).
- GIVEN a thread with no deal WHEN opened THEN the suggestion is "Créer une opportunité" (G09).
- GIVEN a deal at an unknown/blank stage WHEN opened THEN the suggestion falls back to "Répondre",
  no fabricated stage.
- GIVEN the suggestion's rule is on Suggest WHEN shown THEN it stages for approval and never executes
  on its own; GIVEN it is on Auto THEN it still never auto-sends an email.
- GIVEN a teammate touched the prospect in the last 48h WHEN the suggestion shows THEN a collision
  caveat is attached.
- GIVEN two tenants WHEN suggestions render THEN deal stage is read per-tenant only.

## Edge cases & failure handling
- Multiple open deals on the account → pick the most relevant (most-recently-updated open deal),
  list the rest, suggestion bound to the chosen one.
- Deal `won`/`lost` → suggest a post-sale / re-engage action (or nothing for lost), never a pipeline push.
- Stage changed after the suggestion rendered → re-derive on open; never act on a stale stage.
- `value` vs `projectAmount`/`platformArr` → display via `lib/deals/amount.ts#getDealAmountDisplay`
  (never blend bookings types); the suggestion text references the deal, not a blended number.
- Bookings ≠ ARR: a "deal at proposal" suggestion must not imply ARR; copy stays neutral.
- No grounded context available (G01 failed) → still suggest by stage, but the draft handoff degrades
  gracefully.

## Best-in-class bar
- **Stage-aware, cited, one-click into the real capability**: the suggestion is the correct revenue
  move for where the deal sits, with its reason, wired to booking/draft/advance — not a generic
  "Reply". Superhuman is stage-blind by construction (no deal graph).
- **Trust-gated**: it rides the same autonomy dial + collision awareness, so it advises by default
  and only acts when the user has granted it — and never sends on its own.

## Design sketch
- **Data:** `deals` (`db/schema/core.ts:194` — `stage` `dealStageEnum`, `companyId`, `contactId`,
  `updatedAt`); deal-amount display via `lib/deals/amount.ts`. Suggestion mapping is a pure
  `lib/inbox/next-action.ts#suggestForStage(stage, hasDeal)` returning `{ label, reason, action }`.
- **API:** extend `GET /api/inbox/context` (G01) to resolve the most-relevant open deal + its stage
  and return `nextAction` (+ `otherOpenDeals[]`). Actions deep-link to existing routes
  (`/api/meetings/book`, G08 draft, G09 advance, nudge).
- **UI:** a "Prochaine action" card at the top of the G01 sidebar in `_conversation-pane.tsx`: the
  primary action as a `--color-accent` Button (lucide per action: `CalendarPlus`, `FileText`,
  `ArrowRight`, `BellRing`), the reason as a `--color-text-tertiary` sub-line, the collision caveat
  inline (`--color-warning-soft`). Keyboard: a number shortcut to invoke the primary action. Light+
  dark via tokens, no emoji, no provider name, the suggestion's reason cited (the deal stage).
- **AI:** none for the mapping (deterministic stage→action); the *draft* it hands to is the grounded
  LLM in G08. Respects the autonomy dial (T11) — stage for approval by default.
- **Security/perf:** tenant scope; one extra deal query on the context call; mapping is pure + unit-tested.

## Tasks (ordered)
1. Pure `lib/inbox/next-action.ts#suggestForStage` covering every `dealStageEnum` value + the
   no-deal + unknown-stage cases. (verify: each stage maps to the documented action) (test:
   `next-action.test.ts` — all stages + no-deal + unknown)
2. Resolve most-relevant open deal in `GET /api/inbox/context` + return `nextAction`. (verify: API
   returns the right action for a proposal-stage deal) (test: route test)
3. "Prochaine action" sidebar card with one-click into booking/draft/advance/nudge + reason line.
   (verify: browser — qualification → demo booker; proposal → grounded draft) (test: render test)
4. Autonomy-dial gating (T11) + collision caveat (G06). (verify: Suggest rule stages, never sends;
   teammate caveat shows) (test: gating + collision-caveat cases)

## Current-state notes (VERIFY before building — code moves)
- `deals` schema + `dealStageEnum` (lead/qualification/demo/trial/proposal/negotiation/won/lost) at
  `db/schema/core.ts:194` (stage `:203`) and `db/schema/enums.ts`. The MCP server already lists
  these stages (`app/api/mcp/route.ts:112`).
- Deal amount MUST route through `lib/deals/amount.ts#getDealAmountDisplay` — never sum `value` with
  `projectAmount`/`platformArr` (`db/schema/core.ts:208`–`:217`, the deal-split rule).
- Booking route exists: `app/api/meetings/book/route.ts` (G10). Grounded draft = G08. Advance = G09.
- Autonomy dial is INBOX-T11 (`lib/inbox/autonomy.ts#applyOrSuggest`, proposed there). Collision =
  INBOX-G06 / `lib/collision/`.
- No next-action engine or inbox suggestion card exists yet (grep: none for `next-action` under
  `lib/inbox`).
