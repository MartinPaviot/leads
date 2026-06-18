# INBOX-T01 — Smart lanes / Split Inbox (saved-query + auto-label lanes)
> Theme: T2 · Autonomy rung: passive · Priority: P1
> Pillar: P4 triage

## User story
As a user with a noisy inbox, I want to split it into a few self-defined lanes (VIP, my
team, tools, a custom saved search), each created in one move from a thread, so I see what
matters first instead of one undifferentiated stream.

## Why (audit anchor)
Superhuman's **Split Inbox** is the spine of its triage: a split's *Definition = search
criteria* (`From:`/`To:`/`Subject:`/`Cc:`/`Bcc:` combined with AND/OR) **+ optional Auto
Labels**, created via Cmd+K → New Split Inbox from any email, with a "Hide empty Split
Inboxes" toggle (`findings.md` §B; `feature-inventory.md` "Split Inbox Library"). We already
have four computed lanes (`attention | handled | snoozed | done`, `conversations.ts:54`) —
T01 **extends** that with user-defined, query-backed lanes rather than replacing the system.

## Requirements (EARS)
- The system SHALL let a user define a lane as a saved query over conversation fields
  (`from`, `to`, `cc`, `subject`, mailbox), combinable with AND/OR groups.
- WHEN a lane has an attached AI-label criterion (INBOX-T02), the system SHALL include
  conversations carrying that label in the lane.
- WHEN a user is reading a thread, the system SHALL offer "New lane from this sender/domain"
  that pre-fills the query from the open conversation.
- The system SHALL render lanes as tabs alongside the existing computed lanes, never hiding
  the built-in `attention` lane.
- WHEN "Hide empty lanes" is enabled, the system SHALL omit lanes whose current count is 0
  (except `attention`).
- The system SHALL compute each lane's count and show it in the tab (mirroring `laneCounts`).
- The system SHALL evaluate lane membership at read time over the already-scoped conversation
  set (per-user/tenant), never widening visibility beyond `scopeConversationRows`.
- The system SHALL let a user reorder, rename, and delete their own lanes; defaults SHALL be
  restorable.
- A conversation MAY appear in multiple matching lanes; the built-in lane logic
  (`attention/handled/snoozed/done`) SHALL still govern its triage state.
- The system SHALL store lane definitions per-user (lanes are personal, like the inbox).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a lane defined `From: *@pilae.ch` WHEN a Pilae sender writes THEN that conversation
  appears in the lane tab and the tab count increments.
- GIVEN a thread open from `zeno@resend.com` WHEN the user clicks "New lane from this domain"
  THEN a lane pre-filled `From: *@resend.com` is created and selected.
- GIVEN "Hide empty lanes" on AND a lane with 0 matches WHEN the inbox renders THEN that tab
  is hidden but `attention` is still shown.
- GIVEN a lane with an AI-label criterion "scheduling requests" (INBOX-T02) WHEN a scheduling
  email arrives THEN it shows in that lane.
- GIVEN two users in the same tenant WHEN user A creates a lane THEN user B does not see it.
- GIVEN a lane query matching a conversation already marked `done` WHEN the user opens the
  lane THEN the conversation reflects its computed lane state, not a duplicate in `attention`.
- GIVEN a user deletes a custom lane WHEN the inbox reloads THEN only the built-in lanes remain
  and no conversation is lost.

## Edge cases & failure handling
- Query matches everything (no criteria) → reject on save; require at least one clause.
- Query references a mailbox the user no longer has connected → lane evaluates empty, not error.
- Very large match set → lane shares the existing pagination/`Load more` path.
- Conflicting lanes (same query twice) → allowed but de-duped in the tab list by definition hash.
- Malformed AND/OR tree → server validates the tree; reject with a field-level message.
- Multi-tenant: lane definitions and evaluation are hard-scoped to the owner's user + tenant.
- Migration: existing users keep the four computed tabs with zero custom lanes (no flash).

## Best-in-class bar
- A lane can mix a **saved query AND a CRM-grounded AI label** (INBOX-T02 / INBOX-G11) — e.g.
  "VIP = open deal in stage ≥ proposal" — which Superhuman can't express because it has no
  deal graph. Ours is correct because it reads our own pipeline, not guessed headers.
- Lanes compose with the existing computed triage (`attention/handled/snoozed/done`) instead
  of fragmenting it, so a split never hides a genuinely hot reply.

## Design sketch
- **Data:** new `inbox_lanes` table (per-user): `id, tenant_id, user_id, name, position,
  definition jsonb {clauses, join: "and"|"or", aiLabelIds[]}, hide_when_empty bool`. Mirror the
  `inbox_triage` per-user/tenant scoping pattern (`db/schema/outbound.ts:370`).
- **API:** `GET/POST/PATCH/DELETE /api/inbox/lanes` (CRUD, owner-scoped). The conversations
  endpoint (`/api/inbox/conversations/route.ts`) accepts `?lane=<id>` and a pure matcher
  `lib/inbox/lane-match.ts` filters the assembled `Conversation[]` (reuse the field shapes in
  `conversations.ts` `Conversation`).
- **UI:** extend the lane tabs in `page.tsx:36` (`TABS`) + `TAB_LABELS` to append the user's
  custom lanes after the four built-ins; "New lane from this sender/domain" lives in the
  reading-pane header (`_conversation-pane.tsx:291` action row) and in the command palette
  (INBOX-K01). Surface: light `FilterBar` tabs, tokens `--color-accent-soft`/`--color-accent`
  for the active tab (matching `page.tsx:245-248`), lucide `Layers` icon for "manage lanes",
  shortcut `g` then a digit to jump lanes (aligns with INBOX-K06); works light+dark via tokens,
  no emoji, no provider name, cited (lane definition is shown verbatim).
- **AI:** none for query-only lanes; AI-label lanes delegate to INBOX-T02 (no new model here).
- **Security/perf:** matcher runs over the already-scoped set; lane CRUD authorizes
  `user_id === authCtx.userId`; counts computed in the same pass as `laneCounts`.

## Tasks (ordered)
1. `inbox_lanes` schema + migration (per-user/tenant). (verify: drizzle generate) (test:
   schema scope test)
2. `lib/inbox/lane-match.ts` pure matcher over `Conversation[]` (clauses + AND/OR + aiLabelIds).
   (verify: unit) (test: `lane-match.test.ts` — from/to/subject/AND/OR/empty-query reject)
3. `/api/inbox/lanes` CRUD owner-scoped. (verify: cross-user 403) (test: route test)
4. Thread `?lane=<id>` through `/api/inbox/conversations` + count in `laneCounts`. (verify: API
   returns filtered set + count) (test: conversations route test)
5. Tabs UI append custom lanes + "Hide empty lanes" toggle. (verify: browser — a Pilae lane
   shows only Pilae senders) (test: tab render test)
6. "New lane from this sender/domain" in pane + palette. (verify: creates pre-filled lane)
   (test: pre-fill unit)

## Current-state notes (VERIFY before building — code moves)
- Lanes today are computed, not user-defined: `conversations.ts:54` `Lane`, `:383` `laneCounts`;
  tabs hardcoded `page.tsx:36` `TABS` + `:28` `TAB_LABELS`.
- No `inbox_lanes`/split/saved-search table exists (grep: none).
- Reading-pane action row to host "New lane": `_conversation-pane.tsx:291`.
- Per-user scoping precedent: `inbox_triage` (`outbound.ts:370`) + `lib/inbox/user-scope.ts`.
