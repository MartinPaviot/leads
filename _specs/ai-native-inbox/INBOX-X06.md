# INBOX-X06 — Handoff + internal notes
> Theme: T8 · Autonomy rung: helper · Priority: P1
> Pillar: cross (collaboration)

## User story
As a rep passing a conversation to a teammate, I want to reassign it with a private
internal note that the prospect never sees, so the handoff carries the full why (deal
context, what was promised, the next step) and nothing falls through the cracks.

## Why (audit anchor)
Superhuman's team tier has **email assignment** + **private team comments**
(`_research/teardown-superhuman/findings.md` §E/§G). We add the GTM-native version: a
handoff is a reassign **plus** a durable internal note attached to the contact/deal, so the
cited context (last interaction, signals, deal stage) travels with the thread — Superhuman's
comment is just text; ours is grounded. Composes with INBOX-X01 (assignment) + X02 (comments).

## Requirements (EARS)
- WHEN a user reassigns a conversation, the system SHALL let them attach an internal note in
  the same action; the note SHALL be optional.
- The system SHALL store the note as an internal-only activity on the conversation's
  contact/deal — NEVER on an outbound email, and SHALL never include it in any sent message.
- WHEN a conversation is handed off, the system SHALL notify the new owner (INBOX-N01) with the
  note + a deep link.
- The system SHALL record handoffs (from → to, at, by) as an auditable activity.
- The system SHALL scope all of this to the tenant and respect workspace roles (viewers cannot
  reassign; `lib/inbox/user-scope.ts` + the role middleware).
- The internal note SHALL render visually distinct from the reply composer (a "note" surface),
  so it can never be confused with a draft to the prospect.
- WHEN the new owner opens the handed-off thread, the system SHALL surface the note + who
  handed it off + when, above the reply area.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread I own WHEN I reassign it to a teammate with a note THEN ownership changes, the
  note is saved internally, and the teammate is notified with the note + a link.
- GIVEN a handed-off thread WHEN the prospect later replies THEN the note is NOT quoted or sent;
  it stays internal.
- GIVEN I am a viewer WHEN I try to reassign THEN the action is blocked with a clear reason.
- GIVEN a teammate is already engaged with this prospect (collision) WHEN I reassign THEN the
  collision notice shows so I don't hand off into a conflict.
- GIVEN a note references a deal WHEN the deal is later opened THEN the note appears on its timeline.

## Edge cases & failure handling
- Reassign to self → no-op (no spurious handoff record).
- Note with no reassignment → just an internal note (allowed; X02 covers @mention comments).
- New owner deactivated/removed → handoff blocked with a reason; never dangles.
- Contact/deal deleted after the note → note stays on the surviving entity (contact→company), never orphaned.
- Cross-tenant: hard scope; a note can never attach to an entity outside the viewer's tenant.

## Best-in-class bar
- The handoff carries **cited GTM context** (the INBOX-G01 sidebar bundle), not just a text
  comment — the new owner inherits the deal state, last interaction, and signals, all sourced.
- **Collision-aware** handoff (reuses `lib/collision/`): we warn before you hand off into a
  conflict — Superhuman's assignment is blind to who's already talking to the prospect.

## Design sketch
- **Data:** reuse the existing `ownerId` columns (contacts/companies/deals — see
  `project_ownership-assignment`) + `components/owner-select.tsx`. Internal note = an `activities`
  row (`activity_type:"note"`, `direction:null`, internal flag in `metadata`), attached to the
  contact/deal. Handoff = an `activities` row (`activity_type:"handoff"`, `metadata:{from,to}`).
- **API:** `POST /api/inbox/handoff` `{ conversationKey, toUserId, note? }` → reassign + write
  note activity + emit `inbox/handoff` for the notification. Reuse the inbox scope on read.
- **UI:** in `_conversation-pane.tsx` header, an "Assign" control (reuse `owner-select`) opens a
  small popover (`--color-bg-card`, `--shadow-floating`) with an owner picker + a note field on a
  tinted **note surface** (`--color-warning-soft` background, lucide `StickyNote` icon) that is
  visually NOT the reply composer. Handed-off threads show a note banner above the reply area
  ("Handed off by <name> · <when>", lucide `UserPlus`). Light+dark via tokens; no emoji; no
  provider name; the note's GTM context is cited ("via Elevay").
- **AI:** none required (an optional INBOX-S01 thread summary can pre-fill the note).
- **Security:** role-gated (viewer cannot reassign); tenant + per-user scope; the note is
  internal-only and excluded from every send path.

## Tasks (ordered)
1. `activities` writers for `note`/`handoff` types + an internal-only guard in the send path.
   (verify: a sent email never contains an internal note) (test: send-path exclusion test)
2. `POST /api/inbox/handoff` (reassign + note + notify), role-gated, scoped. (verify: viewer 403)
   (test: route test for owner change + note + scope)
3. Assign-with-note popover in the pane (reuse `owner-select`, tinted note surface). (verify:
   browser — note surface ≠ reply composer) (test: dom render)
4. Handed-off banner + collision check on reassign. (verify: collision notice shows) (test: unit)

## Current-state notes (VERIFY before building — line numbers approximate)
- Ownership exists: `ownerId` columns + `components/owner-select.tsx` (fetches members,
  defaultToSelf, fail-soft) shipped (see `project_ownership-assignment`). Reuse, don't rebuild.
- `lib/collision/` pure helpers + `/api/collision/*` exist — wire the pre-handoff warning.
- `activities` schema (`db/schema/core.ts`) supports a `note` type via `activity_type`/`metadata`;
  VERIFY the enum + that the send paths (`lib/capture/*`, outbound senders) never read it.
- Roles: viewer write-gate lives in the workspace-roles middleware — reuse it.
- Sibling: INBOX-X01 (assignment), X02 (@mention comments), N01 (notification), G01 (cited context).
