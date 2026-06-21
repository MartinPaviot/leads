# B8 -- inbox-collaboration - Requirements (EARS)

ROADMAP row **B8** (`inbox-collaboration`), priority **P3**, dep **F1**. Scope per
`_specs/inbox-overhaul/ROADMAP.md:35`: "Reactions + comments sidebar + channels +
thread rename (only if team-first)".

**Ground-truth verified against live code on 2026-06-20** (branch `feat/inbox-ai-draft`,
worktree `agent-a64e5014ce08a19ab`). Files checked are listed in `design.md` section 0.

## Ground-truth inventory (what already ships -- do NOT rebuild)

Collaboration is ~70% built. The X-track (X01-X06) landed assignment, shared labels,
presence, and private notes; B8 is the **team-comment layer on top**, the one piece the
X-track explicitly deferred.

| Capability | Status | Evidence |
|---|---|---|
| Per-thread **assignment** (assign/reassign/unassign, tenant-shared) | [DONE] | `lib/inbox/assignment.ts`, `assignment-store.ts`, `api/inbox/assignment/route.ts`, `_thread-assignment.tsx`, wired `_conversation-pane.tsx:674` |
| **Shared tenant-wide labels** (apply/remove/suggest, B6 `openSignal`) | [DONE] | `lib/inbox/labels.ts`, `label-store.ts`, `api/inbox/labels/route.ts`, `_thread-labels.tsx`, wired `:676` |
| **Live presence** ("Ada is here / drafting") | [DONE] | `lib/inbox/presence.ts`, `presence-store.ts` (`inbox_presence` `core.ts:316`), `api/inbox/presence/route.ts`, `_thread-presence.tsx`, wired `:678` |
| **Private notes** (owner-scoped, never sent/ingested) | [DONE] | `lib/inbox/notes.ts`, `note-store.ts`, `api/inbox/notes/route.ts`, `_thread-notes.tsx`, wired `:845` |
| **@mention parser** (`@[Full Name]`+`@firstname` -> members+unknowns) | [DONE-orphan] | `lib/inbox/mentions.ts` + `__tests__/inbox-mentions.test.ts`; **no consumer** |
| **Notification prefs** incl. a `mention` event + `shouldNotify` gate | [DONE-orphan] | `lib/inbox/notification-prefs.ts:31,80`; `shouldNotify` never called for mentions; no delivery |
| **Collision attribution** (member-name map, actor names) | [DONE] | `lib/collision/*` (`_specs/collision-awareness`) -- reuse `getTenantMemberNames` |
| Per-user **seen** marker (catch-me-up) | [DONE] | `lib/inbox/seen-store.ts`, `api/inbox/seen/route.ts` |
| Shared **team comment** thread | [NEW] | none -- `note-store.ts` is owner-scoped by `authorId`; nothing tenant-wide for discussion |
| **@mention -> notify** the teammate | [NEW] | parser + pref exist; nothing connects them; no in-app notification surface |
| Assignment **activity trail / audit** | [NEW] | `assignment-store.ts` overwrites (soft-deletes prior) -- no append-only history |
| "**Assigned to me**" filter / lane | [NEW] | `lib/inbox/filter-match.ts` / `lane-match.ts` have no assignee predicate |
| **Reactions / channels / thread rename** | [HORS SCOPE] | low-signal for a founder-led tool; see Non-goals |

## Locked decisions (do NOT reopen)

- **R0.1 [LOCKED]** Storage for collaboration metadata SHALL be the existing `notes` table
  via a synthetic `entityType` (the pattern already used by assignment/labels/notes), with
  NO new table unless a requirement below explicitly flags a migration.
- **R0.2 [LOCKED]** Pure decision/parse helpers SHALL live in `src/lib/inbox/` and be
  unit-testable with no DB/network, mirroring `user-scope.ts` / `mentions.ts`.
- **R0.3 [LOCKED]** Member identity SHALL be resolved via
  `lib/collision/member-names.getTenantMemberNames` (app-space `users.id`); B8 SHALL NOT
  introduce a second member directory.
- **R0.4 [LOCKED]** Realtime fan-out (websockets/SSE) is an OCEAN and is OUT of B8 --
  comments + mention badges refresh on the existing poll/open cadence, like presence.

---

## R1 -- Team comments (shared discussion on a conversation) [NEW]

A tenant-shared comment thread distinct from the existing **private** notes: every member
sees and can add comments; comments are internal-only (never sent, never ingested, exactly
like notes).

- **R1.1** THE SYSTEM SHALL persist a team comment under the `notes` table with a dedicated
  `entityType` (`inbox_comment`), `entityId` = the conversation key, tenant-scoped (NOT
  filtered by author), so every workspace member reads the same thread.
- **R1.2** WHEN a member posts a comment, THE SYSTEM SHALL record the author id and creation
  time and SHALL return the stored comment with the author resolved display name.
- **R1.3** THE SYSTEM SHALL return a conversation comment list in a deterministic order with
  each author resolved display name (via `getTenantMemberNames`, including deactivated
  members -- a removed teammate stays named on their comments).
- **R1.4** WHERE a comment body is empty after trim, THE SYSTEM SHALL reject it and SHALL NOT
  create a row; WHERE it exceeds the note length cap, THE SYSTEM SHALL truncate to the cap
  (reuse `normalizeNoteContent`, 50000 chars).
- **R1.5** WHEN a member deletes a comment, THE SYSTEM SHALL soft-delete it; IF the requester
  is not the comment author AND not a workspace admin, THEN THE SYSTEM SHALL reject with 403.
- **R1.6** THE SYSTEM SHALL NOT send, quote, or ingest a team comment into any outbound,
  capture, or AI-context path (same internal-only guarantee as `note-store.ts`).
- **R1.7** WHERE the workspace has fewer than 2 members, THE SYSTEM MAY hide the comment
  composer (a solo inbox has nobody to discuss with) -- same gate as `_thread-assignment.tsx:60`.

## R2 -- @mentions in comments + notify the teammate [NEW]

Wire the orphaned parser (`mentions.ts`) and the orphaned `mention` pref
(`notification-prefs.ts:31`) into the comment path.

- **R2.1** WHEN a comment is posted, THE SYSTEM SHALL parse `@[Full Name]` and `@handle`
  mentions against the tenant member list (reuse `parseMentions`) and resolve them to ids.
- **R2.2** WHEN a comment mentions teammates, THE SYSTEM SHALL create one pending in-app
  notification per **distinct** mentioned member **other than the author**.
- **R2.3** WHERE a mentioned member `mention` event is disabled (`getNotificationPrefs` /
  `isEventEnabled`), THE SYSTEM SHALL NOT create a notification for that member; the DND
  quiet-window SHALL gate only timed push/email delivery, not the silent in-app badge.
- **R2.4** IF a mention resolves to no member (an unknown handle), THEN THE SYSTEM SHALL
  ignore it for notification purposes and SHALL NOT error (parser returns it under `unknown`).
- **R2.5** THE SYSTEM SHALL expose the count of a member unread mention notifications for a
  badge, and SHALL mark them read when the member opens the referenced conversation.
- **R2.6 [HORS SCOPE]** THE SYSTEM SHALL NOT deliver real-time push/email in B8 (the Inngest
  delivery path is deferred with N01); B8 delivers the **in-app** notification only.

## R3 -- Assignment activity trail / audit [NEW]

Today `setAssignee` overwrites (soft-deletes the prior row), losing history. Keep an
append-only trail so a team can answer "who reassigned this and when".

- **R3.1** WHEN a thread is assigned, reassigned, or unassigned, THE SYSTEM SHALL append an
  immutable record (actor, from-assignee, to-assignee, timestamp) under a dedicated
  `entityType` (`inbox_assignment_event`) in `notes`.
- **R3.2** THE SYSTEM SHALL return a conversation assignment trail in reverse-chronological
  order with actor and assignee display names resolved via `getTenantMemberNames`.
- **R3.3** THE SYSTEM SHALL render each trail entry as a human line (e.g. "Ada assigned to
  Bob - 2h ago", "Bob unassigned - 1h ago") from a PURE formatter.
- **R3.4** THE SYSTEM SHALL NOT mutate or delete existing trail rows on a later change
  (append-only); the current-assignee read path (`getAssigneeId`) SHALL be unaffected.

## R4 -- "Assigned to me" filter predicate [NEW]

- **R4.1** THE SYSTEM SHALL provide a PURE predicate that, given a conversation assignee id
  and the current user id, decides whether it belongs in the "Assigned to me" view.
- **R4.2** THE SYSTEM SHALL provide companion "Unassigned" (assignee null) and "Assigned to
  anyone-but-me" predicates, so the list can offer the three team lanes.
- **R4.3** WHERE the workspace has fewer than 2 members, THE SYSTEM SHALL treat the assignee
  filters as inert (a solo inbox has no assignment), returning all conversations.
- **R4.4** THE SYSTEM SHALL expose the assignee id on the list read-model so the predicate
  runs client-side without a per-row fetch (batch-load assignees for visible keys).

## R5 -- Guardrails / non-functional

- **R5.1** THE SYSTEM SHALL scope every comment, mention, and trail read/write by `tenantId`
  from `getAuthContext`; a request without an auth context SHALL be rejected 401.
- **R5.2** THE SYSTEM SHALL keep every new collaboration read/write DEFENSIVE: a failure SHALL
  degrade to empty/no-op so the inbox renders identically (the `presence-store.ts` pattern).
- **R5.3** THE SYSTEM SHALL add NO new database table (R0.1); IF a badge query cannot be
  served from the reused tables in one round-trip, THEN the task SHALL FLAG a migration to
  the founder rather than silently adding one.

## Non-goals (explicit)

- **R6.1** THE SYSTEM SHALL NOT implement real-time websocket/SSE fan-out in B8 (OCEAN --
  flag for the founder; [HORS SCOPE]).
- **R6.2** THE SYSTEM SHALL NOT add emoji **reactions** in B8 -- low signal for a founder-led
  tool; revisit only if team-inbox becomes a positioning pillar.
- **R6.3** THE SYSTEM SHALL NOT add **channels** (Slack-style rooms).
- **R6.4** THE SYSTEM SHALL NOT add **thread rename** in B8 (a separate cosmetic change).
- **R6.5** THE SYSTEM SHALL NOT build push/email **delivery** of mentions in B8 (rides N01).
- **R6.6** THE SYSTEM SHALL NOT introduce a workspace **admin/role model** beyond what
  `getAuthContext` already exposes; R1.5 admin check uses the existing role claim.

## Requirement tally

By tag: **[NEW] 20** (R1.1-R1.7, R2.1-R2.5, R3.1-R3.4, R4.1-R4.4) - **[DONE] inventory** 12 -
**[LOCKED] 4** (R0.1-R0.4) - **[HORS SCOPE] 7** (R2.6 + R6.1-R6.6).

<!-- end requirements.md -->
