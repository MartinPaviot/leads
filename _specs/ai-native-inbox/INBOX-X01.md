# INBOX-X01 — Shared inbox + per-message assignment
> Theme: T8 · Autonomy rung: helper · Priority: P1
> Pillar: cross (P4 triage + P5 GTM moat)

## User story
As a founding team sharing a sales address, I want to opt a mailbox into "shared"
and assign individual conversations to a specific teammate, so we triage as a team
without two people answering the same prospect — and without exposing anyone's
personal mailbox.

## Why (audit anchor)
Superhuman's team tier ships **email assignment** as the spine of its shared inbox
("assign a conversation to a teammate"); Shortwave/Missive do the same. We have the
opposite default: the inbox is **personal** today — `getInboxScope` filters every
conversation to the viewer's own `connected_mailboxes.user_id`
(`lib/inbox/user-scope.ts:30`), and the empty-state copy promises "Other members
can't see it" (`inbox/page.tsx:261`). So collaboration must be **opt-in per mailbox**
and tenant-scoped, never a silent widening of who sees whose mail. We beat them by
keeping assignment **owner-aware and collision-aware** off our real attribution graph,
not a separate assignee field that drifts.

## Requirements (EARS)
- A mailbox SHALL be personal by default; it becomes shared only WHEN its owner (or a
  tenant admin) explicitly sets `connected_mailboxes.shared = true`.
- WHEN a mailbox is shared, the system SHALL include its conversations in the inbox of
  every **member**/**admin** in the tenant (not viewers, who stay read-only), scoped to
  that tenant only.
- The system SHALL let a member assign any conversation in a shared mailbox to exactly
  one tenant member (the assignee), reusing the `OwnerSelect` member picker.
- WHEN a conversation is assigned, the system SHALL record `assignee_user_id` keyed on
  the existing `conversation_key`, and surface the assignee chip in the list row and pane.
- The system SHALL offer an "Assigned to me" lane (filter) that shows only conversations
  whose `assignee_user_id` is the viewer, across all shared mailboxes they can see.
- WHEN a conversation has no assignee, the system SHALL show it as "Unassigned" and let
  any member claim it in one click ("Assign to me").
- The system SHALL keep personal mailboxes fully private — a personal mailbox's
  conversations SHALL never appear in another member's inbox regardless of assignment.
- A **viewer** SHALL be able to read shared conversations but SHALL NOT assign, claim, or
  share a mailbox (the middleware viewer write-gate, `viewer-guard.ts:37`, already blocks
  the POST).
- WHEN the assignee is later deactivated, the system SHALL show the conversation as
  "Unassigned" (the deactivated user no longer resolves to an active member) without losing
  the audit record of who held it.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a personal mailbox WHEN any other member opens their inbox THEN none of its
  conversations appear (unchanged from today's `scopeConversationRows`).
- GIVEN the owner flips a mailbox to shared WHEN a teammate (member) reloads THEN that
  mailbox's conversations now appear in their inbox with a "shared" rail badge.
- GIVEN a shared conversation WHEN a member picks a teammate in the assignee picker THEN
  the row shows that teammate's name chip and the assignment persists across reloads.
- GIVEN an unassigned shared conversation WHEN the viewer is a **viewer** role THEN the
  assignee control is absent and a claim attempt is impossible (no POST surface).
- GIVEN a conversation assigned to me WHEN I open the "Assigned to me" lane THEN it is
  listed and conversations assigned to others are not.
- GIVEN a conversation I assigned to Alice WHEN Alice is deactivated THEN the chip reverts
  to "Unassigned" and the row stays claimable; the audit log still shows Alice once held it.
- GIVEN a teammate already emailed this prospect 2 days ago WHEN I open the conversation
  THEN the existing collision notice fires (INBOX-G06 / `ContactCollisionNotice`), so
  assignment and collision reinforce each other.

## Edge cases & failure handling
- Mailbox toggled shared→personal again → previously-shared conversations immediately drop
  out of other members' inboxes; assignment rows are kept (harmless) but no longer visible.
- Two members claim the same unassigned conversation within seconds → last write wins on the
  unique `(tenant_id, conversation_key)` row; the optimistic chip reconciles on the response.
- Assignee not in the tenant (stale id, cross-tenant guess) → assignment rejected; the picker
  only offers `/api/settings/members` results, all tenant-scoped.
- Shared mailbox with zero connected owner (orphaned `user_id IS NULL`) → still shareable by an
  admin; conversations attribute to the mailbox, not a person.
- Conversation spans a personal + a shared mailbox (same thread, two boxes) → scope per row by
  mailbox; only the shared-mailbox messages are exposed to teammates.
- Offline / members fetch fails → assignee control degrades to "Unassigned" and stays usable
  (fail-soft, exactly like `OwnerSelect`'s catch path).
- Multi-tenant: `assignee_user_id` and the shared flag are read only within `authCtx.tenantId`;
  never resolve an assignee or mailbox outside it.

## Best-in-class bar
- Assignment is **opt-in per mailbox**, so a founder's private mailbox never leaks the way a
  blanket "team inbox" would — sovereignty-friendly and the opposite of Superhuman's all-or-nothing
  team mailbox.
- The assignee picker is the **same `OwnerSelect`** used for deal/account ownership, so "who owns
  this prospect" and "who answers this email" are the *same* member graph — no second source of truth.
- Assignment is **collision-aware**: it sits next to the real activity-attribution notice
  (`ContactCollisionNotice`), so even an unassigned thread warns "Alice emailed them yesterday" —
  Superhuman's assignment can't, because it has no cross-channel attribution graph.

## Design sketch
- **Data:** add `connected_mailboxes.shared boolean default false` (`db/schema/outbound.ts:218`).
  New `inbox_assignment(tenant_id, conversation_key, assignee_user_id (users.id), assigned_by,
  assigned_at)` with `unique(tenant_id, conversation_key)` — mirrors `inbox_triage`
  (`outbound.ts:370`) exactly; reopen/done stay where they are. `assignee_user_id` is app-space
  `users.id` (same space as `OwnerSelect` ids and collision actor ids).
- **API:** extend `getInboxScope` (`lib/inbox/user-scope.ts`) so the scoped set =
  `(mailboxes WHERE user_id = me) ∪ (mailboxes WHERE shared = true AND tenant = mine)` for
  members/admins; viewers get the shared set read-only. `GET /api/inbox/conversations`
  (`api/inbox/conversations/route.ts`) joins `inbox_assignment` and accepts `?lane=mine`
  (assignee = me). New `POST /api/inbox/assign { conversationKey, assigneeUserId|null }` —
  member+ only (blocked for viewers by `viewer-guard.ts`), tenant-scoped upsert, audit-logged
  via `logAudit` like the members route does for role changes.
- **UI:** assignee chip + `OwnerSelect` in `_conversation-list.tsx` row and
  `_conversation-pane.tsx` header (next to the `reason` badge ~`:277`); a "shared" tag on the
  `MailboxRail` entry; a new "Assigned to me" tab in `inbox/page.tsx` `TABS` (`:36`). Surface =
  list row + pane header; tokens `--color-bg-selected` for the active chip, `--color-text-secondary`
  for "Unassigned", `--color-border-default`; lucide `UserPlus` (assign) / `Users` (shared rail);
  shortcut `a` = open assignee picker on the selected row (added to the keyboard handler at
  `inbox/page.tsx:182`, ignored while typing). Light + dark via tokens, no emoji, no provider name,
  cited (chip tooltip names the assigner + time).
- **AI:** none in v1. (A later rung could *suggest* an assignee from who owns the deal — out of scope here.)
- **Security/perf:** the shared-set widening is the ONLY place personal scope changes — gate it
  behind the explicit `shared` flag and the role check so a bug can't silently expose a personal
  mailbox; one indexed join on `inbox_assignment` per lane load; viewer writes blocked centrally.

## Tasks (ordered)
1. Migration: `connected_mailboxes.shared` + `inbox_assignment` table. (verify: drizzle generate +
   apply clean) (test: schema-shape test asserting the unique index)
2. Extend `getInboxScope` to union shared mailboxes for member+; keep personal-only for the owner's
   own boxes; viewers read-only. (verify: a shared box appears for a teammate, a personal one does
   not) (test: `user-scope.test.ts` — personal stays private, shared widens for member, viewer read-only)
3. `POST /api/inbox/assign` (upsert, tenant-scoped, audit-logged, viewer-blocked) + join assignment in
   the conversations route + `?lane=mine`. (verify: assign persists; viewer POST → 403) (test: route test)
4. Assignee chip + `OwnerSelect` in list row + pane header; "shared" rail tag; "Assigned to me" tab;
   `a` shortcut. (verify: browser — assign a thread, reload, chip persists; viewer sees no control)
   (test: dom test for chip + viewer-hidden control)
5. Deactivated-assignee → "Unassigned" fallback (resolve against active members only). (verify:
   deactivate the assignee, chip reverts) (test: unit on the resolver)

## Current-state notes (VERIFY before building — code moves)
- Inbox is PERSONAL today: `getInboxScope` filters to `connected_mailboxes.user_id = authUserId`
  (`lib/inbox/user-scope.ts:30`); empty-state copy literally promises privacy (`inbox/page.tsx:261`).
  This spec adds the FIRST opt-in widening — keep it gated and explicit.
- `inbox_triage` (`db/schema/outbound.ts:370`) is tenant-scoped, keyed on `conversation_key`, no
  `user_id` — the new `inbox_assignment` table copies its shape and unique index.
- `OwnerSelect` (`components/owner-select.tsx`) already fetches `/api/settings/members`
  (tenant-scoped, `isSelf`, fail-soft) — reuse verbatim; do NOT build a second member picker.
- `requireAdmin` exists (`lib/auth/auth-utils.ts:109`); there is no `requireMember` helper — the
  viewer write-gate (`middleware.ts:152` → `viewer-guard.ts:37`) already blocks viewer POSTs, so the
  assign route needs only the tenant scope + the (non-viewer) default.
- Collision notice + route exist (`components/collision/contact-collision-notice.tsx`,
  `api/collision/contact/route.ts`) — assignment reuses, does not duplicate, that signal.
