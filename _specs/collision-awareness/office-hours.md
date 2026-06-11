# Collision Awareness — Office Hours

Slice 1 of the multi-user-attribution chantier. Scope is deliberately two
parts: nominative timelines + soft collision warnings. Everything else
(ownership/assignment UX, per-user dashboards, teams, field audit log) is a
later slice and is explicitly out.

## Problem statement (one sentence)

Teammates double-work the same prospect because every history surface shows
*what* happened but never *who* did it, and nothing warns a rep that a
colleague already called or emailed this person.

## Premise challenge: why activity-driven, not owner-driven

The obvious design is "warn if `ownerId` differs from the current user." We
reject it on a verified fact: assignment is MANUAL ONLY, so `companies.ownerId`
/ `contacts.ownerId` are frequently NULL (db/schema/core.ts:66,175 — nullable,
no backfill). An owner-field collision check would therefore be silent on
exactly the records where collisions happen: unassigned shared prospects that
two reps both pick from the same queue.

The real signal already exists and is already attributed:
- `calls.userId` is the rep who placed each call (db/schema/voice.ts:44,
  NOT NULL), and the post-call worker writes a `call_completed` activity with
  `actorType:"user"`, `actorId:callRow.userId` (inngest/calls-post-process.ts:130-136).
- `POST /api/activities` stamps `actorId = authCtx.appUserId` (app-space)
  for every manual/system activity (api/activities/route.ts:75).
- `outbound_emails.mailbox_id → connected_mailboxes.user_id` identifies the
  sending user; lib/inbox/user-scope.ts already maps mailbox→user.

So collision detection reads "who actually touched this prospect, and when"
from real activity/call rows — correct even when `ownerId` is NULL. This is
the central design constraint and the reason the feature is activity-driven.

## Alternatives considered

### A1. Owner-field vs activity-based attribution
- Owner-field: 1 join, trivial. REJECTED — NULL on most rows ⇒ misses the
  collisions it exists to catch; also wrong (owner ≠ who-actually-called).
- Activity-based: union of `calls` (userId) + attributed `activities`
  (actorId) + outbound emails (mailbox→user). CHOSEN. Slightly more reads but
  factually correct. Matches the locked decision in the brief.

### A2. Hard block vs soft warn
- Block enroll/call if recently touched by another rep. REJECTED — too rigid
  for founder-led teams, contradicts the locked "WARN + ALLOW OVERRIDE"
  policy, and would fight the SHARED-visibility model. A legitimate reason to
  call a colleague's prospect exists (handoff, escalation).
- Soft warn + proceed-anyway. CHOSEN. Additive, fail-closed (lookup error ⇒
  action proceeds), never a gate. Mirrors how quiet-hours already returns a
  code the client surfaces vs the DNC hard 409 (api/calls/start/route.ts:96-123).

### A3. Per-surface logic vs one shared pure helper
- Re-implement "recent touches by others" in each route. REJECTED — three
  copies drift; the id-space bridging (app vs auth) gets re-inlined and breaks
  (the exact failure lib/auth/user-id.ts warns against).
- ONE pure, unit-tested helper (no DB) that takes already-fetched rows + the
  current user and returns a structured `lastTouchByOthers`. CHOSEN. Same
  shape as lib/inbox/user-scope.ts (thin DB in the route, pure logic tested
  without a DB). The three surfaces each fetch thin rows and call the helper.

### A4. New `touches` table vs derive from existing rows
- Add a denormalised touch ledger. REJECTED for slice 1 — `activities`
  already carries `actorId` + `occurredAt` + `entityId`, and `calls` carries
  `userId`. No migration needed. A ledger is a future optimisation, not a gap.

## Completeness target

9/10 for slice 1. Covered: nominative line on every history surface that
renders prospect activity (contact detail, deal/opportunity timeline, Call
Mode brief), and soft warnings at the three risky moments (pre-call,
pre-enroll, composer-open). All edge cases enumerated in requirements
(no prior activity, self-only, removed user, NULL owner, high-volume contact,
self-collision suppressed). Not covered (intentionally, later slices): the
weakly-attributed enrollment path gets no new `enrolledBy` column (we surface
what exists and leave a seam); no settings toggle to disable warnings (strong
default on; toggle is a noted future seam); no ownership/assignment UX.
