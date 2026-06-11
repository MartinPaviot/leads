# Collision Awareness — Design (Slice 1)

Adds attribution display + soft collision warnings on top of data that is
already attributed. No new provider, no LLM. Pure helper + thin DB reads in
existing routes. UI English, lucide icons, no emoji.

## 1. Architecture diff vs existing

Already there (reused, not rebuilt):
- Attributed activities: `activities.actorType`/`actorId`
  (core.ts:240-241); writers stamp the rep (api/activities/route.ts:75;
  inngest/calls-post-process.ts:130-136).
- `calls.userId` (voice.ts:44) — the calling rep.
- Outbound→user mapping (outbound.ts:282; lib/inbox/user-scope.ts).
- Member-name pattern + active filter (api/settings/members/route.ts:28-33).
- Id-space bridge (lib/auth/user-id.ts) — the ONLY place to cross app↔auth.
- Existing call gates as the pattern for non-blocking codes vs hard 409
  (api/calls/start/route.ts:96-137: DNC=hard 409, quiet-hours=overridable).

Added (new, small):
- `lib/collision/recent-touch.ts` — PURE helper (no DB). Computes
  `LastTouchByOthers` from passed rows. Unit-tested without a DB, mirroring
  lib/inbox/user-scope.ts.
- `lib/collision/member-names.ts` — thin DB helper: tenant member id→display
  name map (ALL members, active+inactive, for display; one query). Reused by
  timelines + warnings.
- `lib/collision/contact-touches.ts` — thin DB helper: fetch the recency-
  windowed, user-attributed touch rows for one or many contacts (calls +
  activities + outbound), then delegate to the pure helper.
- New endpoint `GET /api/collision/contact?contactId=…` (and a batch variant
  `POST /api/collision/contacts` with `{contactIds}`) returning
  `LastTouchByOthers` per contact. Backs R3 client render, R4 pre-enroll, R5
  composer.
- Actor-name enrichment added to: deal timeline route, opportunity timeline
  route, and the Call Mode brief (via getContactBrain directActivities select
  + brain route name map). Contact detail timeline gets the name client-side
  from `/api/activities` extended to return `actorType`/`actorId` + a resolved
  name (or the page resolves via a members fetch it already can make).

Nothing is removed; nothing changes visibility.

## 2. Data model diff

NO MIGRATION. Every field needed already exists:
- `activities.actorType` / `activities.actorId` (app-space user id) —
  core.ts:240-241.
- `calls.userId` — voice.ts:44.
- `outbound_emails.mailbox_id` + `connected_mailboxes.user_id` (auth-space) —
  outbound.ts:282, schema connectedMailboxes.userId.
- `users.firstName/lastName/email`, `users.deactivatedAt` — core.ts:35-42.

Confirmed: the `sequence_enrolled` activity type EXISTS (enums.ts) but the
enroll route does not currently write one (enroll/route.ts:125-132). Slice 1
does NOT add an `enrolledBy` column and does NOT start writing that activity —
it surfaces existing call/email/activity attribution. (Future seam: a later
slice may stamp `sequence_enrolled` with `actorId` on enroll and/or add
`sequenceEnrollments.enrolledBy`; the helper already accepts activity rows, so
that data would flow in for free.)

## 3. Shared pure helper — signature + return

File: `lib/collision/recent-touch.ts`

```ts
export type TouchChannel = "call" | "email" | "other";

export interface TouchRow {
  /** App-space user id of the actor (users.id), or null if unattributed. */
  userId: string | null;
  channel: TouchChannel;
  /** call outcome / activity type label, for the warning copy. May be null. */
  outcome: string | null;
  occurredAt: Date;
}

export interface LastTouchByOthers {
  userId: string;
  /** Resolved display name, or a non-empty fallback (R2.7). */
  userName: string;
  channel: TouchChannel;
  outcome: string | null;
  occurredAt: Date;
  daysAgo: number;
  /** Count of DISTINCT other users who touched within the window. */
  otherUserCount: number;
}

export const RECENT_TOUCH_WINDOW_DAYS = 30;

export function computeLastTouchByOthers(
  rows: TouchRow[],
  currentUserId: string,
  memberNames: ReadonlyMap<string, string>,
  now: Date = new Date(),
  windowDays: number = RECENT_TOUCH_WINDOW_DAYS,
): LastTouchByOthers | null;
```

Rules implemented (map to R2): drop rows with null userId or userId ===
currentUserId (R2.3); drop rows older than `windowDays` (R2.5); over the
survivors pick max `occurredAt` (R2.4, ties broken deterministically by
userId then channel for order-independence, R2.6); `otherUserCount` = distinct
surviving userIds; `userName` from `memberNames.get(userId)` else a fallback
like "a teammate" (R2.7); `daysAgo` = floor((now-occurredAt)/86_400_000).
Empty/self-only ⇒ null (R2.8/R2.9).

## 4. Thin DB helpers

`lib/collision/member-names.ts`
- `getTenantMemberNames(tenantId): Promise<Map<string,string>>` — selects
  `id, firstName, lastName, email` from `users` where `tenantId` matches,
  NO `deactivatedAt` filter (display must name removed reps, R1.9), maps to the
  members-route name pattern. One query. Cacheable per request.

`lib/collision/contact-touches.ts`
- `getContactTouchRows(tenantId, contactIds[], sinceDate): Promise<Map<contactId, TouchRow[]>>`:
  - calls: select `contactId, userId, outcome, startedAt` from `calls` where
    tenant + contactId in set + `startedAt >= sinceDate`. Map `userId → TouchRow`
    (channel "call"). (calls.userId is app-space — matches the helper.)
  - activities: select `entityId, actorType, actorId, activityType, channel,
    occurredAt` from `activities` where tenant + entityType "contact" + entityId
    in set + `actorType = "user"` + `actorId not null` + `occurredAt >= sinceDate`
    + `deletedAt is null`. channel "email" if activityType/channel is email-ish,
    else "other". (actorId is app-space.)
  - outbound emails: select `contactId, mailboxId, sentAt` from `outbound_emails`
    where tenant + contactId in set + `sentAt >= sinceDate`, then resolve
    `mailboxId → connected_mailboxes.userId` (AUTH-space) → bridge to APP id via
    `authToAppUserId` (lib/auth/user-id.ts). Channel "email". Batch the mailbox→user
    resolution once (one `connected_mailboxes` query for the distinct mailboxIds),
    then one bulk `users.clerkId in (...)` map — never per-row re-inline (the
    user-id.ts rule). Rows whose user can't be bridged keep `userId:null` (R2.7
    counts them only if attributable; null-user rows are dropped by R2.3).
  - Returns rows grouped by contactId for the pure helper.
- `sinceDate` = now − RECENT_TOUCH_WINDOW_DAYS, bounding the scan (R2.10).

The window-filter + the `*_contact_idx` / `*_started_idx` indexes
(voice.ts:115-116, outbound_contact_idx, activities_entity_idx) keep these
reads cheap even for high-volume contacts.

## 5. Endpoints

`GET /api/collision/contact?contactId=…` (withAuthRLS)
- single contact → `{ collision: LastTouchByOthers | null }`.
`POST /api/collision/contacts` (withAuthRLS) `{ contactIds: string[] }`
- batch (cap 200) → `{ collisions: Record<contactId, LastTouchByOthers|null> }`.
Both: build member-name map once, fetch touch rows once, run the pure helper
per contact with `currentUserId = authCtx.appUserId`. Tenant-scoped via RLS +
where clauses. Errors → the CLIENT treats a non-2xx as "no warning"
(fail-closed; R3.3/R4.5/R5.4 live on the consumer side too).

`POST /api/calls/start` (extend, api/calls/start/route.ts)
- After the call row is inserted and the token issued (lines 174-210), compute
  the collision for `contact.id` (reuse contact-touches + helper) inside a
  `try/catch` that defaults to `null`, and add `collision` to the success JSON.
  Placed AFTER all gates so it changes no existing outcome (R3.2). The lookup
  failing never fails the call (R3.3).

## 6. Render integration points

- Contact detail (contacts/[id]/page.tsx:286-327): extend the `Activity`
  interface with `actorType`/`actorId`/`actorName`; `/api/activities` GET
  returns `actorType`,`actorId`, and a resolved `actorName` (route builds the
  member-name map once, R1.8). Render `actorName` in the line header
  (R1.2/R1.5/R1.6/R1.7).
- Deal timeline (api/deals/[id]/timeline/route.ts:18-34) and opportunity
  timeline: add `actorType`,`actorId` to the select and an `actorName` resolved
  from the member-name map; consumer renders it (R1.3).
- Call Mode brief: getContactBrain directActivities select
  (get-contact-brain.ts:119-140) adds `actorType`,`actorId`; the brain route
  (api/brain/contact/[contactId]/route.ts) resolves names via the member-name
  map and includes `actorName` on each `directActivities` item; `_panels.tsx`
  `BrainActivity` gains `actorName` and the "Historique" list (lines 695-712)
  renders it (R1.4). `relTime` already exists for the timestamp.
- Pre-call warning UI: `_panels.tsx` PreCallBrief receives the `collision` from
  the start response (cockpit page passes it down) and renders a soft line with
  `AlertTriangle` (already imported, _panels.tsx:37). Call action untouched
  (R3.4).
- Pre-enroll warning UI: the enroll surface calls `POST /api/collision/contacts`
  for the selected ids before enrolling and renders the "N of M already
  contacted by a teammate" summary; proceed enrolls all (R4.2/R4.3).
- Composer warning UI: EmailComposerPanel, on open with `contactId`, calls
  `GET /api/collision/contact` and shows the warning line; Send untouched
  (R5.1/R5.5). No contactId ⇒ no call (R5.3).

## 7. Failure handling (consolidated)

- Every collision lookup is wrapped so a throw ⇒ `collision: null` (server) and
  a non-2xx ⇒ no warning (client). The underlying action (call/enroll/send/
  render) always proceeds (R3.3/R4.5/R5.4, R1.7). Fail-closed = additive only.
- Name resolution miss ⇒ anonymous line (timelines) or fallback label
  (warnings), never an empty string or crash (R1.7/R2.7).

## 8. Two id-spaces correctness

- `calls.userId` and `activities.actorId` are APP-space (users.id) — directly
  comparable to `authCtx.appUserId` (the helper's `currentUserId`) and directly
  keyable into the member-name map (keyed by users.id). No bridge needed.
- `connected_mailboxes.user_id` is AUTH-space — the ONLY cross-space hop. It is
  bridged to APP space via `authToAppUserId` (lib/auth/user-id.ts) in ONE bulk
  resolution in contact-touches.ts, never re-inlined (the exact mistake that
  module warns against). After bridging, outbound touches live in the same
  app-space as the rest.
- The member-name map is keyed by `users.id` (app-space) throughout.

## 9. Where a future ownership layer plugs in (no rework)

- A later "owned by" / assignment slice adds `ownerId` writes + UI; the
  collision helper stays activity-driven and is unaffected. If a future policy
  wants "warn if owned by someone else AND recently touched", it composes the
  existing `LastTouchByOthers` with the owner field at the call site — no helper
  change.
- A future `enrolledBy` stamp (or writing `sequence_enrolled` with `actorId` on
  enroll) flows into `getContactTouchRows` activities automatically (it already
  reads user-attributed activities), strengthening R4 with zero helper churn.
- A future warnings on/off toggle reads a tenant setting and short-circuits the
  client render; the server endpoints stay pure. (R0.6 — not built now.)

## 10. Guardrails (one line each)

- Never block: warnings are additive; the action always proceeds. [R0.1]
- Never hide: visibility stays SHARED/tenant-wide. [R0.2]
- Activity-driven, never owner-driven (owner is NULL too often). [R0.3]
- No LLM anywhere in this path. [R0.4]
- Fail-closed: any lookup error ⇒ no warning, action proceeds. [R3.3/R4.5/R5.4]
- Self-collision never warns (single source: the pure helper). [R5.6]
- Cross id-space only via lib/auth/user-id.ts, bridged once in bulk. [§8]
- UI English, lucide icons, no emoji, no provider names. [conventions]
- One member-name query + one touch query per request — no N+1. [R1.8]
- Recency-windowed reads bound the scan for high-volume contacts. [R2.10]
- Pure logic lives in lib/collision/recent-touch.ts and is unit-tested without
  a DB (the inbox/user-scope.ts pattern).
