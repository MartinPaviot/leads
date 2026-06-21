# B8 -- inbox-collaboration - Design

## 0. Ground truth (files read on 2026-06-20, branch `feat/inbox-ai-draft`)

Helpers: `lib/inbox/mentions.ts`, `assignment.ts`, `assignment-store.ts`, `notes.ts`,
`note-store.ts`, `labels.ts`, `label-store.ts`, `presence.ts`, `presence-store.ts`,
`seen-store.ts`, `notification-prefs.ts`, `user-scope.ts`, `lib/collision/member-names.ts`,
`recent-touch.ts`, `actor-name.ts`.
Routes: `api/inbox/{assignment,labels,presence,notes,notifications,seen}/route.ts`.
Components: `_thread-assignment.tsx`, `_thread-labels.tsx`, `_thread-presence.tsx`,
`_thread-notes.tsx`; wired in `_conversation-pane.tsx:674-678,845`.
Schema: `db/schema/core.ts:292` (`notes`), `:316` (`inbox_presence`); `userPreferences`
in `db/schema/auth.ts`. Auth: `lib/auth/auth-utils.ts:10-12,68-70`
(`{ userId, tenantId, appUserId }`). ROADMAP: `_specs/inbox-overhaul/ROADMAP.md:35`.

## 1. Architecture diff

**Already there (reuse, do not touch):** the `notes`-table synthetic-entity pattern
(assignment `inbox_assignment`, labels `inbox_label`, private notes `inbox_thread`);
`getTenantMemberNames` (incl. deactivated members); `parseMentions`; the notification
pref model + `shouldNotify` / `isEventEnabled`; the per-thread fetch-on-open component
pattern; `userPreferences` JSONB k-v (resource "inbox").

**Added by B8:**

```
lib/inbox/
  comments.ts            [NEW] pure: normalize/shape a comment, format author line
  comment-store.ts       [NEW] DB: list/add/delete inbox_comment (tenant-scoped)
  mention-notify.ts      [NEW] pure: resolveMentionTargets(parsed, authorId, prefs[])
  mention-store.ts       [NEW] DB: createMentionNotifications / unreadCount / markRead
  assignment-trail.ts    [NEW] pure: formatAssignmentEvent, shape an event
  assignment-trail-store.ts [NEW] DB: appendAssignmentEvent / listAssignmentTrail
  assignee-filter.ts     [NEW] pure: isAssignedToMe / isUnassigned / isAssignedToOther
api/inbox/
  comments/route.ts      [NEW] GET/POST/DELETE  (calls comment-store + mention wiring)
  assignment-trail/route.ts [NEW] GET
  mentions/route.ts      [NEW] GET unread count, POST mark-read
app/(dashboard)/inbox/
  _thread-comments.tsx   [NEW] shared comment thread (sibling of _thread-notes.tsx)
  _mention-badge.tsx     [NEW] unread-mention pill in the inbox header
```

**Modified:** `assignment-store.ts.setAssignee/clearAssignee` -> also call
`appendAssignmentEvent` (R3.1). `api/inbox/conversations` read-model -> include the
batch-loaded assignee id per visible key (R4.4). `_conversation-pane.tsx` -> render
`<ThreadComments>` next to `<ThreadNotes>` and `<AssignmentTrail>` under the assignment
control. `lib/inbox/list-state.ts` (or the filter layer) -> add the three assignee lanes
using the pure predicates.

## 2. Data model diff

**No migration.** Everything rides the existing `notes` table (`core.ts:292`), keyed by
`entityType` + `entityId` = conversation key, exactly like assignment/labels/notes.

| Concern | entityType | authorId | content | Read scope |
|---|---|---|---|---|
| Team comment (R1) | `inbox_comment` | poster | comment text | tenant (all members) |
| Mention notification (R2) | `inbox_mention` | mentioned member | JSON `{by, convKey, commentId, readAt?}` | owner (mentioned member) |
| Assignment event (R3) | `inbox_assignment_event` | actor | JSON `{from, to}` | tenant |

Mentions reuse the `notes` row per mentioned member: `authorId` = the **recipient** (so
the unread query is `authorId = me AND content.readAt is null`), `title` carries the actor
id for display. `readAt` is stamped into `content` JSON on mark-read (no migration); the
soft-delete column stays free for a future purge.

**Migration FLAG (R5.3):** the unread-mention **count** query filters on a JSON field
inside `content`. On the reused `notes` table that is a full scan of the member rows -
fine at founder-team scale (tens of rows/user). IF this badge must scale to large teams,
FLAG a dedicated `inbox_mention` table with a `(user_id, read_at)` index to the founder;
do NOT add it silently. Default: ship on `notes`.

## 3. Orchestration (Inngest)

**None in B8.** No new Inngest function. Mention push/email delivery is the deferred N01
path (R2.6 / R6.5) and is explicitly out. Comments, trail, and the in-app mention badge
are request-time reads/writes only - same as assignment/labels today.

## 4. Pure-core contracts (the autonomously-verifiable slice)

```ts
// lib/inbox/comments.ts
export const INBOX_COMMENT_ENTITY_TYPE = "inbox_comment";
export interface TeamComment { id: string; authorId: string; authorName: string;
  content: string; createdAt: string; }
// reuse normalizeNoteContent from notes.ts for the body cap (R1.4)

// lib/inbox/mention-notify.ts  (PURE - no DB)
export interface MentionPref { userId: string; enabled: boolean } // from isEventEnabled
/** distinct mentioned ids, minus the author, minus members who disabled the event. */
export function resolveMentionTargets(
  parsed: { mentioned: { id: string }[] },
  authorId: string,
  prefs: ReadonlyMap<string, boolean>,   // userId -> mention-event enabled
): string[];                              // R2.2, R2.3, R2.4 (unknowns already excluded)

// lib/inbox/assignment-trail.ts  (PURE)
export const INBOX_ASSIGNMENT_EVENT_ENTITY_TYPE = "inbox_assignment_event";
export interface AssignmentEvent { actorId: string; from: string | null;
  to: string | null; at: string; }
export function formatAssignmentEvent(
  ev: AssignmentEvent, names: ReadonlyMap<string, string>, now?: Date,
): string;   // "Ada assigned to Bob - 2h ago" | "Bob unassigned - 1h ago"  (R3.3)

// lib/inbox/assignee-filter.ts  (PURE)
export function isAssignedToMe(assigneeId: string | null, me: string): boolean;       // R4.1
export function isUnassigned(assigneeId: string | null): boolean;                     // R4.2
export function isAssignedToOther(assigneeId: string | null, me: string): boolean;    // R4.2
export type AssigneeLane = "me" | "unassigned" | "others" | "all";
export function matchesAssigneeLane(                                                  // R4.3
  lane: AssigneeLane, assigneeId: string | null, me: string, memberCount: number,
): boolean;  // memberCount < 2 -> always true (inert)
```

These four pure modules + `resolveMentionTargets` are the **DoD-software** slice:
deterministic, DB-free, 100% unit-coverable, no live session needed.

## 5. Integrations - confirm vs the locked stack

- DB: Drizzle + `notes` / `userPreferences` only - **no new dependency**, no provider.
- Member directory: `getTenantMemberNames` (collision chantier) - confirmed reuse.
- Mention parse: `parseMentions` - confirmed reuse, zero change.
- Notification gate: `isEventEnabled` / `getNotificationPrefs` - confirmed reuse.
- No Anthropic/AI SDK, no Inngest, no Twilio/Resend, no websocket lib - B8 adds none.

## 6. UI wiring

- `_thread-comments.tsx`: clones `_thread-notes.tsx` structure (fetch-on-open, optimistic
  add/remove) against `/api/inbox/comments`; renders author name + "to everyone" affordance
  vs notes "only you"; an `@`-trigger suggests members from the GET payload. Mounted in
  `_conversation-pane.tsx` beside `<ThreadNotes>` (`:845`).
- `AssignmentTrail`: a collapsible list under `<ThreadAssignment>` (`:674`) calling
  `/api/inbox/assignment-trail`; each line from `formatAssignmentEvent`.
- `_mention-badge.tsx`: header pill polling `/api/inbox/mentions` unread count
  (poll cadence reuses presence-style interval); opening a referenced conversation POSTs
  mark-read (R2.5).
- Assignee lanes: three entries in the existing list filter UI using `matchesAssigneeLane`;
  hidden when `memberCount < 2` (R4.3) - same solo-inbox gate as assignment.

## 7. Guardrails (consolidated)

- Every route requires `getAuthContext`; 401 otherwise (R5.1).
- All store reads/writes are try/catch DEFENSIVE -> empty/no-op on failure (R5.2).
- Comments + mentions never enter outbound/capture/AI graph - no `ingestEpisode` call,
  mirroring `note-store.ts` (R1.6).
- Tenant scope on every comment/trail query; mention rows owner-scoped to the recipient.
- Comment delete authorizes author-or-admin via the existing role claim (R1.5); no new
  role model (R6.6).
- Assignment trail is append-only; `getAssigneeId` read path unchanged (R3.4).
- No new table; badge-scale migration is FLAGGED, not auto-added (R5.3 / section 2).
- Realtime is out; refresh on poll/open only (R0.4 / R6.1).

<!-- end design.md -->
