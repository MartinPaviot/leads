# Collision Awareness — Requirements (Slice 1)

Stop teammates from unknowingly double-working a prospect. Two parts:
(A) nominative activity timelines, (B) soft collision warnings at the three
risky moments. SHARED visibility is preserved — this ADDS attribution +
warnings, it hides nothing. WARN + ALLOW OVERRIDE; never block. Deterministic,
no LLM.

Tags: [NEW] real gap, code required · [DONE] already shipped · [CFG] tenant
config · [LOCKED] stack decision, do not reopen · [HORS SCOPE] later slice.

## Ground-truth anchors (verified 2026-06-11)

- [DONE] Activities are attributed: `activities.actorType`/`actorId`
  (core.ts:240-241); `POST /api/activities` sets `actorId=authCtx.appUserId`
  (api/activities/route.ts:75); call activity written with
  `actorId=callRow.userId` (inngest/calls-post-process.ts:130-136).
- [DONE] `calls.userId` = the calling rep, NOT NULL (voice.ts:44).
- [DONE] `outbound_emails.mailbox_id → connected_mailboxes.user_id`
  (outbound.ts:282; user-scope.ts maps mailbox→user).
- [DONE] Member name resolution pattern + ACTIVE-only filter
  (api/settings/members/route.ts:28,33).
- [LOCKED] Assignment manual-only ⇒ `ownerId` frequently NULL
  (core.ts:66,175). Collision MUST be activity-driven, not owner-driven.
- [LOCKED] Two id-spaces; bridge only via lib/auth/user-id.ts.
- [LOCKED] No LLM; UI English; no emojis; no provider names; non-blocking.

## Non-goals (THE SYSTEM SHALL NOT)

- R0.1 THE SYSTEM SHALL NOT block, hard-stop, or auto-skip any call, enrollment,
  or send because of a collision; it SHALL only warn and allow the user to
  proceed. [LOCKED]
- R0.2 THE SYSTEM SHALL NOT hide, filter, or restrict any record from any
  workspace user on the basis of attribution; visibility stays tenant-wide and
  SHARED. [LOCKED]
- R0.3 THE SYSTEM SHALL NOT derive collisions from the `ownerId`/`assigneeId`
  fields; it SHALL derive them from real activity attribution
  (calls.userId, activities.actorId, outbound mailbox→user). [LOCKED]
- R0.4 THE SYSTEM SHALL NOT call any LLM in the attribution or warning path.
  [LOCKED]
- R0.5 THE SYSTEM SHALL NOT introduce an ownership/assignment UI, per-user
  dashboard, teams model, round-robin, or a field-level audit log in this
  slice. [HORS SCOPE]
- R0.6 THE SYSTEM SHALL NOT add a settings control to toggle warnings in this
  slice; the warning is automatic with a strong default-on. (Future toggle is a
  documented seam only.) [CFG-future]

---

## R1 — Nominative activity timeline (Part A) [NEW]

User story: As a rep looking at a prospect's history, I want each action
labelled with the teammate who did it, so I can tell at a glance whether a
colleague has already worked this person.

- R1.1 THE SYSTEM SHALL resolve, for any activity whose `actorType = "user"`,
  the acting member's display name as `[firstName, lastName].filter(Boolean).join(" ")`,
  falling back to the member email, using the same pattern as
  api/settings/members/route.ts:33. [NEW]
- R1.2 WHERE an activity row is rendered on the contact detail timeline
  (contacts/[id]/page.tsx Activity section, lines 276-330), THE SYSTEM SHALL
  display the actor name inline with the channel/type and relative time
  (e.g. "Marie · call · callback requested · 2d ago"). [NEW]
- R1.3 WHERE an activity row is rendered on the deal timeline
  (api/deals/[id]/timeline/route.ts) or the opportunity timeline
  (api/opportunities/[id]/timeline/route.ts), THE SYSTEM SHALL include the
  actor name in the response and the consuming component SHALL render it. [NEW]
- R1.4 WHERE the Call Mode pre-call brief renders direct activities
  (PreCallBrief "Historique", _panels.tsx:687-715, fed by getContactBrain
  directActivities), THE SYSTEM SHALL show the actor name on each line. [NEW]
- R1.5 WHEN `actorType = "system"`, THE SYSTEM SHALL label the line "System"
  (or the existing system summary) and SHALL NOT attempt user-name resolution.
  [NEW]
- R1.6 WHEN `actorType = "contact"` (inbound), THE SYSTEM SHALL attribute the
  line to the prospect, not a workspace user (e.g. keep the inbound styling /
  the prospect's name), preserving today's inbound/outbound dot semantics. [NEW]
- R1.7 IF actor-name resolution fails or the actor id matches no member row,
  THEN THE SYSTEM SHALL render the existing anonymous line (type + time) and
  SHALL NOT error or blank the timeline. [NEW]
- R1.8 THE SYSTEM SHALL resolve names for a set of activities in a single
  members lookup per request (no N+1 per row). [NEW]

### Edge cases (Part A)

- R1.9 IF the acting user has since been deactivated (users.deactivatedAt set,
  api/settings/members/route.ts:14-28 excludes them), THEN THE SYSTEM SHALL
  still show a name by resolving against ALL tenant members (active + inactive)
  for display purposes, appending no removal marker in slice 1; IF no row
  exists at all, it SHALL fall back to the anonymous line (R1.7). [NEW]
- R1.10 WHERE an activity has `actorType="user"` but a NULL `actorId` (legacy
  rows), THE SYSTEM SHALL render the anonymous line. [NEW]

---

## R2 — Recent-touch attribution helper (shared core) [NEW]

User story: As the three warning surfaces, I want one deterministic answer to
"who else touched this contact recently, doing what, when" so I render a
consistent warning without re-implementing the logic.

- R2.1 THE SYSTEM SHALL provide a pure function (no DB, no network) that, given
  (a) the current user's app id, (b) call rows {userId, outcome, startedAt},
  (c) user-attributed activity rows {actorType, actorId, activityType, channel,
  occurredAt}, (d) outbound-email touches already resolved to a user id +
  timestamp, and (e) a member-name map, returns a `LastTouchByOthers` result.
  [NEW]
- R2.2 THE SYSTEM SHALL define `LastTouchByOthers` as either `null` (no
  qualifying touch by another user) or `{ userId, userName, channel:
  "call"|"email"|"other", outcome: string|null, occurredAt: Date, daysAgo:
  number, otherUserCount: number }` describing the single most-recent touch by
  a user OTHER than the current user. [NEW]
- R2.3 WHEN computing the result, THE SYSTEM SHALL exclude every touch whose
  acting user equals the current user (self-collision is never a warning). [NEW]
- R2.4 WHEN multiple other users touched the contact, THE SYSTEM SHALL report
  the most recent touch and set `otherUserCount` to the number of DISTINCT
  other users. [NEW]
- R2.5 THE SYSTEM SHALL ignore touches older than a configurable recency window
  (default 30 days) so an ancient call is not surfaced as a live collision; the
  window default SHALL be a named constant, not a setting in slice 1. [NEW]
- R2.6 THE SYSTEM SHALL be deterministic and order-independent: given the same
  rows in any order, it returns the same result. [NEW]
- R2.7 WHERE a touch's acting user id resolves to no member name, THE SYSTEM
  SHALL still count it (R2.4) and present a non-empty fallback label rather than
  an empty string. [NEW]

### Edge cases (helper)

- R2.8 WHEN no rows are passed, THE SYSTEM SHALL return `null`. [NEW]
- R2.9 WHEN only the current user has touched the contact, THE SYSTEM SHALL
  return `null` (R2.3). [NEW]
- R2.10 WHEN the contact is high-volume (hundreds of activities), THE SYSTEM
  SHALL still run in a single pass over the passed rows and the caller SHALL
  bound the rows it fetches (cap, recency-filtered query). [NEW]

---

## R3 — Pre-call collision warning (Part B, surface 1) [NEW]

User story: As a rep about to dial in Call Mode, I want to see if a colleague
already called or emailed this person recently, so I can decide to proceed,
hand off, or skip — without being blocked.

- R3.1 WHEN `POST /api/calls/start` succeeds for a contact, THE SYSTEM SHALL
  include a `collision` field in the success response carrying the
  `LastTouchByOthers` result (or null) for that contact. [NEW]
- R3.2 THE SYSTEM SHALL compute R3.1 AFTER all existing gates (voice config,
  contact/phone, DNC, quiet hours, usage cap — api/calls/start/route.ts:72-137)
  and SHALL NOT change any of those outcomes. [NEW]
- R3.3 IF the collision lookup throws, THEN THE SYSTEM SHALL return the call as
  started with `collision: null` and SHALL NOT fail the call (fail-closed). [NEW]
- R3.4 WHERE the Call Mode cockpit renders the pre-call brief and a non-null
  `collision` is present, THE SYSTEM SHALL show a soft, dismissible warning line
  ("Already contacted by <user> <N>d ago — <channel/outcome>") using a
  lucide-react icon and no emoji, while leaving the Call action fully enabled.
  [NEW]
- R3.5 WHERE the contact was last touched only by the current user, THE SYSTEM
  SHALL show no warning (R2.3/R2.9). [NEW]

---

## R4 — Pre-enroll collision warning (Part B, surface 2) [NEW]

User story: As a rep enrolling contacts into a sequence, I want to be warned
about contacts a colleague is already working, so I can deselect or proceed
knowingly — without enrollment being blocked.

- R4.1 THE SYSTEM SHALL expose a pre-enroll check that, given a set of
  `contactIds`, returns for each the `LastTouchByOthers` result (or null),
  computed by R2. [NEW]
- R4.2 WHEN the enroll surface is about to enroll contacts (the path that calls
  `POST /api/sequences/[id]/enroll`), THE SYSTEM SHALL surface a soft summary of
  which contacts were recently touched by another user (e.g. "3 of 12 already
  contacted by a teammate") and SHALL allow the user to proceed with all of them.
  [NEW]
- R4.3 THE SYSTEM SHALL NOT change the enroll route's existing skip logic
  (anti-ICP, deleted, already-enrolled — enroll/route.ts:65-135); the collision
  result is additive metadata, never an automatic skip. [NEW]
- R4.4 THE SYSTEM SHALL compute enrollment-touch attribution from `calls.userId`
  + user-attributed `activities` + outbound mailbox→user, NOT from any
  `enrolledBy` field (none exists). The weak enrollment attribution is a known
  limitation; a future `enrolledBy` stamp is a documented seam. [NEW][HORS SCOPE-future]
- R4.5 IF the pre-enroll check throws, THEN THE SYSTEM SHALL allow enrollment to
  proceed with no warning (fail-closed). [NEW]
- R4.6 WHERE a contact in the set was touched only by the current user, THE
  SYSTEM SHALL not flag it (R2.3). [NEW]

---

## R5 — Composer-open collision warning (Part B, surface 3, if cheap) [NEW]

User story: As a rep opening the email composer on a contact, I want a heads-up
that a teammate recently emailed or called them, so I don't send a redundant
first-touch — without the composer being blocked.

- R5.1 WHEN the email composer opens with a `contactId`
  (EmailComposerPanel, opened from contacts/[id]/page.tsx), THE SYSTEM SHALL
  fetch the contact's `LastTouchByOthers` and, if non-null, show a soft warning
  line inside the composer while keeping Send fully enabled. [NEW]
- R5.2 THE SYSTEM SHALL reuse the same contact-collision endpoint as R3/R4
  rather than introduce a fourth code path. [NEW]
- R5.3 WHERE the composer opens WITHOUT a `contactId` (free-form recipient),
  THE SYSTEM SHALL show no warning and incur no lookup. [NEW]
- R5.4 IF the lookup fails, THEN THE SYSTEM SHALL open the composer normally
  with no warning (fail-closed). [NEW]
- R5.5 THE SYSTEM SHALL NOT alter `POST /api/emails/send` behaviour; the
  warning is read-only context shown before sending. [NEW]

### Self-collision guard (applies to R3–R5)

- R5.6 THE SYSTEM SHALL suppress every warning whose only qualifying toucher is
  the signed-in user, on all three surfaces (single source: R2.3). [NEW]

---

## Evaluation steps

1. Seed a contact with: a `call_completed` activity by user A (actorId=A app
   id), an `email_sent` activity by user B, and a manual note by the current
   user. Sign in as the current user.
2. Open the contact detail page → each line shows the actor name (A, B, "you"
   / your name); the note shows your name (R1.2). Deactivate B → line still
   shows B's name (R1.9).
3. Open the deal/opportunity timeline for a deal on that contact → actor names
   present (R1.3). Open Call Mode brief on the contact → "Historique" lines are
   nominative (R1.4).
4. `POST /api/calls/start` for the contact → response `collision` names the
   most recent OTHER user with daysAgo + channel (R3.1); cockpit shows the soft
   warning and Call stays enabled (R3.4).
5. Pre-enroll check on a set including this contact → it is flagged "already
   contacted by <A/B>"; a contact touched only by you is NOT flagged (R4.2,
   R4.6); enrollment still enrolls all (R4.3).
6. Open the composer on the contact → warning shown, Send enabled (R5.1);
   open composer with a free-form address → no warning, no fetch (R5.3).
7. Force the collision lookup to throw (inject error) → call starts, enroll
   proceeds, composer opens, all with no warning (R3.3/R4.5/R5.4).
8. Contact touched only by the current user → zero warnings on all three
   surfaces (R5.6).
