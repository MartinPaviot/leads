# B8 -- inbox-collaboration - Tasks

**Total estimate: ~6.5 dev-days (13 half-days).**
Autonomously-verifiable core (B1-B4, B6, B8): ~2.5 days, pure helpers + unit tests, no
live session. Live/multi-user surfaces (B5, B7, B9-B11): ~4 days, FLAGGED for the founder
where a second authed session or the badge is the only proof.

Ordering: pure cores first (mechanically testable), then stores, then routes, then UI.
Each task: code -> test -> verify -> commit. Branch `feat/inbox-collaboration`.

Legend: [NEW] new code - [FLAG] needs founder / live multi-user verify.

---

## Core (autonomously verifiable - pure helpers + unit tests)

### B1 [NEW] Comment shape + body normalization  - 0.5d  (R1.1, R1.4)
- Action: add `lib/inbox/comments.ts` - `INBOX_COMMENT_ENTITY_TYPE`, `TeamComment`
  interface, and reuse `normalizeNoteContent` for the body cap; export a `shapeComment`
  that maps a row + name map -> `TeamComment`.
- Verify: `pnpm test comments` green; empty/whitespace -> null, >50000 -> truncated.
- Test: `__tests__/inbox-comments.test.ts` - normalize edge cases, shapeComment resolves
  author name and falls back for an unknown id.
- Refs: R1.1, R1.4, R1.3 (name fallback).

### B2 [NEW] Mention-target resolver (pure)  - 0.5d  (R2.1-R2.4)
- Action: add `lib/inbox/mention-notify.ts.resolveMentionTargets(parsed, authorId, prefs)`
  - distinct mentioned ids, minus author, minus members whose `mention` event is off;
  unknowns already excluded by `parseMentions`.
- Verify: `pnpm test mention-notify` green.
- Test: `__tests__/inbox-mention-notify.test.ts` - self-mention dropped; duplicate handles
  collapse to one; a member with the event disabled is excluded; unknown ignored; empty -> [].
- Refs: R2.1, R2.2, R2.3, R2.4.

### B3 [NEW] Assignment-event formatter (pure)  - 0.5d  (R3.3)
- Action: add `lib/inbox/assignment-trail.ts` - `AssignmentEvent`, `INBOX_ASSIGNMENT_EVENT_
  ENTITY_TYPE`, `formatAssignmentEvent(ev, names, now)` producing assigned/reassigned/
  unassigned lines + relative time.
- Verify: `pnpm test assignment-trail` green.
- Test: `__tests__/inbox-assignment-trail.test.ts` - assign (null->X), reassign (X->Y),
  unassign (X->null); unknown actor/assignee falls back to a non-empty name; time phrasing.
- Refs: R3.1 (shape), R3.3.

### B4 [NEW] Assignee-lane predicates (pure)  - 0.5d  (R4.1-R4.3)
- Action: add `lib/inbox/assignee-filter.ts` - `isAssignedToMe`, `isUnassigned`,
  `isAssignedToOther`, `matchesAssigneeLane(lane, assigneeId, me, memberCount)` (inert when
  memberCount < 2).
- Verify: `pnpm test assignee-filter` green.
- Test: `__tests__/inbox-assignee-filter.test.ts` - me/unassigned/others partition is
  exhaustive + mutually exclusive for memberCount >= 2; memberCount < 2 -> all lanes true.
- Refs: R4.1, R4.2, R4.3.

---

## Stores (DB - verify via unit on pure callers + a smoke read)

### B5 [NEW] Comment store  - 0.5d  (R1.1, R1.2, R1.3, R1.5, R1.6)
- Action: add `lib/inbox/comment-store.ts` - `listThreadComments` (tenant-scoped, NOT
  author-filtered), `addThreadComment`, `deleteThreadComment(byAuthorOrAdmin)`. Mirror
  `label-store.ts`; do NOT call `ingestEpisode` (R1.6). Resolve names via
  `getTenantMemberNames`.
- Verify: `pnpm tsc` clean; add a defensive try/catch so an error -> `[]` (R5.2).
- Test: unit the author-or-admin guard in isolation (extract `canDeleteComment(requester,
  comment, isAdmin)` pure helper -> `__tests__/inbox-comment-store.test.ts`).
- Refs: R1.1, R1.2, R1.3, R1.5, R1.6, R5.2.

### B6 [NEW] Mention store + unread count  - 0.5d  (R2.2, R2.5)
- Action: add `lib/inbox/mention-store.ts` - `createMentionNotifications(tenant, convKey,
  commentId, byUserId, targetIds[])`, `unreadMentionCount(userId)`, `markMentionsRead(
  userId, convKey)`. Recipient-as-`authorId` row; `content` JSON `{by, convKey, commentId,
  readAt?}`.
- Verify: `pnpm tsc` clean; defensive.
- Test: unit a pure `buildMentionRow` / `isUnread(content)` helper.
- Refs: R2.2, R2.5; **migration FLAG** per design section 2 noted in code comment.

### B7 [NEW] Assignment-trail store + wire into setAssignee  - 0.5d  (R3.1, R3.2, R3.4)
- Action: add `lib/inbox/assignment-trail-store.ts` - `appendAssignmentEvent`,
  `listAssignmentTrail`. Modify `assignment-store.ts.setAssignee` + `clearAssignee` to read
  the prior assignee (already fetched) and append an event; append-only (R3.4).
- Verify: existing assignment route still returns the current assignee unchanged; trail
  read returns the appended rows newest-first.
- Test: regression - `getAssigneeId` unchanged after N reassignments; trail length == N.
- Refs: R3.1, R3.2, R3.4.

---

## Routes (thin glue - verify with an unauth + a happy fetch)

### B8 [NEW] /api/inbox/comments + /api/inbox/assignment-trail  - 0.5d  (R1.*, R3.2, R5.1)
- Action: add both route files mirroring `api/inbox/labels/route.ts`; comments GET/POST/
  DELETE (POST also runs B2 + B6 wiring), trail GET. 401 without `getAuthContext`.
- Verify: curl GET unauth -> 401; authed POST then GET round-trips the comment.
- Test: route boundary - the no-auth path returns 401 (pattern from existing inbox route
  tests); a static check that comments POST imports the mention wiring.
- Refs: R1.1-R1.5, R2.1, R3.2, R5.1.

### B9 [NEW] [FLAG] /api/inbox/mentions (unread count + mark-read)  - 0.5d  (R2.5)
- Action: add `api/inbox/mentions/route.ts` - GET unread count, POST `{key}` mark-read.
- Verify (auto): unauth -> 401; mark-read is idempotent.
- Verify (FLAG founder): the badge count actually decrementing on open needs a real
  second authed session - capture once with the founder.
- Refs: R2.5, R2.2.

---

## UI + list integration (verify in-app; multi-user feel FLAGGED)

### B10 [NEW] [FLAG] ThreadComments component + mount  - 0.5d  (R1.7, R6.* not)
- Action: add `_thread-comments.tsx` (clone `_thread-notes.tsx`: fetch-on-open, optimistic
  add/remove, `@`-suggest from the GET member payload); mount in `_conversation-pane.tsx`
  beside `<ThreadNotes>` (`:845`). Hide composer when memberCount < 2 (R1.7).
- Verify (auto): vitest render - composer hidden for a 1-member workspace, shown for 2+.
- Verify (FLAG founder): "second teammate sees my comment" is a live two-session check.
- Test: `__tests__/thread-comments.test.tsx` - solo gate; optimistic add appends a row.
- Refs: R1.2, R1.7.

### B11 [NEW] [FLAG] Assignment trail UI + mention badge  - 0.5d  (R3.3, R2.5)
- Action: add a collapsible `<AssignmentTrail>` under `<ThreadAssignment>` (`:674`) and
  `_mention-badge.tsx` in the inbox header polling `/api/inbox/mentions`.
- Verify (auto): vitest render - trail lines come from `formatAssignmentEvent`; badge hidden
  at count 0.
- Verify (FLAG founder): live badge decrement on open = two-session check.
- Test: `__tests__/assignment-trail-ui.test.tsx` render of N events.
- Refs: R3.3, R2.5.

### B12 [NEW] Assignee lanes in the list  - 0.5d  (R4.4)
- Action: add the assignee id to the conversations read-model (batch-load assignees for
  visible keys, one query) and three lane entries using `matchesAssigneeLane`; hide lanes
  when memberCount < 2.
- Verify (auto): unit the read-model assembler with `matchesAssigneeLane`; lanes inert for
  a solo workspace.
- Test: `__tests__/inbox-assignee-lanes.test.ts` - lane partition over a fixture list.
- Refs: R4.3, R4.4.

### B13 [NEW] Wire mention parse into comment POST end-to-end  - 0.5d  (R2.1-R2.4)
- Action: in comments POST, after persist, run `parseMentions` -> `resolveMentionTargets`
  (load each target `mention` pref via `getNotificationPrefs`) -> `createMentionNotifications`.
- Verify (auto): a comment with `@[Name]` creates exactly the expected notification rows
  (excluding author + disabled), asserted on the store call args via a spy.
- Test: `__tests__/inbox-comment-mention-flow.test.ts` - mock store, assert target set.
- Refs: R2.1, R2.2, R2.3, R2.4.

---

## Sequencing + DoD

1. **Pure core** B1-B4 (parallel-safe) -> all green = the autonomously-verifiable DoD slice.
2. Stores B5-B7 (B7 touches assignment-store - regression-gate `getAssigneeId`).
3. Routes B8-B9.
4. UI B10-B12 + flow B13.

**Software DoD (auto):** B1-B8, B12, B13 unit/route tests green; `pnpm tsc` + `pnpm lint`
clean; no new dependency; no migration (badge migration FLAGGED not applied).
**Founder DoD (live):** B9/B10/B11 multi-user behaviour captured in one two-session pass -
"teammate sees comment", "@mention badge lights then clears on open", "trail shows the
reassignment". These are the only steps that need a human/second session (R0.4 realtime
stays out regardless).

**Ship gate (P3):** per ROADMAP section 5, B8 ships "only if team-inbox is a positioning
pillar". The pure-core slice (B1-B4) is safe to land regardless - it is inert until the
UI mounts and adds zero risk to the solo inbox.

<!-- end tasks.md -->
