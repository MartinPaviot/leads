# INBOX-G03 — Last-interaction + relationship timeline (cited)
> Theme: T7 · Autonomy rung: helper · Priority: P0
> Pillar: P5 GTM moat

## User story
As a founder opening a prospect's email, I want a cited relationship timeline — when we last
interacted, every real exchange (emails, calls, meetings) across the whole account, in order — so
I reply knowing exactly where the relationship stands, without opening the CRM.

## Why (audit anchor)
Superhuman's sidebar shows "recent emails with you" — only the messages *in this mailbox*, a
single-channel social view (`findings.md` §D "Social Insights"). We own the full interaction graph:
`lib/accounts/last-interaction.ts` already unions emails + calls + meetings across the account's
contacts, the company itself, and its deals — and it deliberately excludes CRM bookkeeping rows
(`system_event` "deleted contact", merges) that an unfiltered query would surface as "last
interaction". That account-wide, cross-channel, citation-backed timeline is the Lightfield recall
bar; Gmail/Superhuman can't assemble it.

## Requirements (EARS)
- WHEN a conversation is open, the system SHALL show a "last interaction" line for the account
  (relative time + a one-line summary) sourced from `lib/accounts/last-interaction.ts`, with a
  citation to the source activity.
- The system SHALL render a relationship timeline of REAL interactions only — the
  `INTERACTION_ACTIVITY_TYPES` set (email_sent/received/replied, call_completed, meeting_scheduled/
  completed) — NEVER `system_event` / audit rows.
- The system SHALL union the three sources: activities on the account's live contacts, on the
  company, and on the account's live deals (each `deleted_at IS NULL`).
- Each timeline entry SHALL carry: channel, direction, occurredAt, a one-line summary, the actor
  (teammate name when ours, contact when theirs), and a deep link to the underlying record.
- The system SHALL order entries newest-first and SHALL render relative time ("il y a 3 j") plus an
  absolute timestamp on hover.
- The system SHALL hard-scope to the viewer's tenant; the timeline SHALL never include another
  tenant's activity.
- WHEN there is no interaction history (a never-contacted account, or a mailbox with only infra
  mail), the system SHALL say so honestly ("Aucune interaction") rather than inventing one.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN an account with an email last week and a call yesterday WHEN opened THEN "last interaction"
  reads "Appel · il y a 1 j" and the timeline lists the call above the email, each clickable.
- GIVEN a meeting logged on the opportunity (deal) but not on the contact WHEN opened THEN it still
  appears in the timeline (deal source of the union).
- GIVEN the account also has a `system_event` "User deleted contact" row WHEN the timeline renders
  THEN that row is absent (only `INTERACTION_ACTIVITY_TYPES` shown).
- GIVEN an inbound captured against the company (contact not auto-created) WHEN opened THEN it
  appears via the company source of the union.
- GIVEN a never-contacted prospect WHEN opened THEN the panel shows "Aucune interaction", no fabrication.
- GIVEN two tenants WHEN one opens a thread THEN no other-tenant activity is unioned in.

## Edge cases & failure handling
- Activity with null `occurredAt` → sorts last (`NULLS LAST`), never crashes the order.
- Soft-deleted contact/deal/company → excluded by the `deleted_at` guards already in the SQL.
- Very long history → virtualize/paginate (load latest N, "show all" expands).
- Same interaction attributed to both contact and deal → de-duplicate by activity id in the reader.
- Slow union query → render the sidebar skeleton; never block the email body (INBOX-G01 pattern).
- Mixed-timezone display → store UTC, render in the user's locale.

## Best-in-class bar
- **Account-wide + cross-channel + cited**: not just "emails in this mailbox" but every real
  exchange across contacts, company and deals — the Lightfield recall bar, with provenance on each
  line. Superhuman's timeline is single-mailbox, single-channel, uncited.
- **Honest by construction**: the SSOT already strips CRM bookkeeping, so "last interaction" is
  always a genuine exchange — never "you deleted this contact" masquerading as engagement.

## Design sketch
- **Data:** `activities` (`db/schema/core.ts:235`); the union shape is `lastInteractionUnionSql`
  (`lib/accounts/last-interaction.ts:36`) with `INTERACTION_ACTIVITY_TYPES` (`:18`). A new
  per-account *timeline* query mirrors the union but returns rows (not just the latest) with
  channel/direction/actorId.
- **API:** extend the G01 endpoint `GET /api/inbox/context?conversationKey=…` to include
  `lastInteraction` + `timeline[]` for the resolved account (one query, reusing the union body);
  actor names resolved via `lib/collision/member-names.ts` (ours) + `contactNameMap` (theirs).
- **UI:** a "Relationship" section in the G01 right sidebar in `_conversation-pane.tsx`: a "last
  interaction" pill at top, then a vertical timeline (lucide `Mail`/`Phone`/`CalendarCheck` per
  channel, arrow glyph for direction, `--color-border-default` rail, `--color-text-secondary`
  summaries, relative time `--color-text-tertiary`). Each row links to the record. Shortcut: part of
  the sidebar (`]` toggles sidebar). Light+dark via tokens, no emoji, no provider name, each line cited.
- **AI:** none — the summaries are the stored activity `summary`; no generation, so nothing to hallucinate.
- **Security/perf:** tenant scope in every union arm; indexes `activities_entity_idx` +
  `activities_occurred_at_idx` cover it; cap rows + paginate.

## Tasks (ordered)
1. Per-account timeline query (rows, not just latest) reusing the union body +
   `INTERACTION_ACTIVITY_TYPES`. (verify: returns calls+emails+meetings across all three sources)
   (test: union-shape test — asserts type filter + 3 sources + deleted_at guards + system_event excluded)
2. Thread `lastInteraction` + `timeline[]` into `GET /api/inbox/context`. (verify: API returns cited
   entries for a known account) (test: route test)
3. "Relationship" sidebar section (last-interaction pill + timeline) in `_conversation-pane.tsx`.
   (verify: browser — real account shows ordered, clickable, cited entries) (test: render test)
4. Empty + de-dup + skeleton states. (verify: never-contacted shows "Aucune interaction"; dup deal/
   contact entry shown once) (test: empty + de-dup cases)

## Current-state notes (VERIFY before building — code moves)
- `lib/accounts/last-interaction.ts` is the SSOT: `lastInteractionUnionSql` (`:36`),
  `INTERACTION_ACTIVITY_TYPES` (`:18`), three-source union (contacts/company/deals), `deleted_at`
  guards, `NULLS LAST` ordering, and the explicit comment that it excludes `system_event`
  bookkeeping (`:5`). **Reuse the union body; do not re-derive interaction types.**
- It currently returns only the *latest* per company; the inbox needs the *rows* — same predicates,
  different projection.
- G01 (`INBOX-G01.md`) already proposes `GET /api/inbox/context`; G03 extends it, not a new endpoint.
- Member-name resolution: `lib/collision/member-names.ts`; contact names: `contactNameMap`
  (`lib/inbox/load.ts`).
- No inbox timeline UI exists yet (grep: none in `_conversation-pane.tsx` for a relationship section).
