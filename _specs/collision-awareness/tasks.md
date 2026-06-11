# Collision Awareness — Tasks (Slice 1)

Total estimate: ~5.5 dev-days (11 half-days). Ordered; each task has a verify
step + the test to write. Run vitest/tsc from `app/apps/web` (dual-vitest
gotcha). No migration. UI English, lucide icons, no emoji.

Tags: [NEW] code · [DONE] verify-only · [CFG] config · [LOCKED] do-not-reopen.

---

## B1 — Pure recent-touch helper [NEW] (1 half-day)
Create `lib/collision/recent-touch.ts` with `TouchRow`, `TouchChannel`,
`LastTouchByOthers`, `RECENT_TOUCH_WINDOW_DAYS=30`, and
`computeLastTouchByOthers(rows, currentUserId, memberNames, now?, windowDays?)`
per design §3.
- Verify: `tsc` clean from app/apps/web; function is pure (no imports of db/net).
- Test: `lib/collision/__tests__/recent-touch.test.ts` — empty→null (R2.8);
  self-only→null (R2.9/R5.6); picks most-recent OTHER user (R2.4); distinct
  `otherUserCount` (R2.4); excludes > window (R2.5); order-independent
  (shuffle rows, same result, R2.6); unknown user id → fallback label, still
  counted (R2.7); null userId rows dropped (R2.3).
- Refs: R2.1–R2.10, R5.6.

## B2 — Member-name map helper [NEW] (0.5 half-day)
Create `lib/collision/member-names.ts#getTenantMemberNames(tenantId)` →
`Map<users.id, displayName>` over ALL members (active+inactive), using the
members-route name pattern (firstName+lastName || email).
- Verify: returns a deactivated member's name (no `deactivatedAt` filter).
- Test: `lib/collision/__tests__/member-names.test.ts` (db chain mocked) —
  name composition; email fallback when names null; deactivated member included
  (R1.9).
- Refs: R1.1, R1.9.

## B3 — Contact-touch fetch helper [NEW] (1.5 half-day)
Create `lib/collision/contact-touches.ts#getContactTouchRows(tenantId,
contactIds, sinceDate)` → `Map<contactId, TouchRow[]>` unioning calls
(userId/outcome/startedAt), user-attributed activities (actorId/activityType/
channel/occurredAt, deletedAt null), and outbound_emails (mailbox→user bridged
ONCE via `authToAppUserId`, bulk). Channel classification email-ish vs other.
- Verify: mailbox→user resolved in a single bulk hop (no per-row bridge); rows
  windowed by `sinceDate`.
- Test: `lib/collision/__tests__/contact-touches.test.ts` (db + user-id bridge
  mocked) — call row → "call" TouchRow with app-space userId; email activity →
  "email"; outbound row → user bridged auth→app; unbridgeable mailbox → userId
  null; window filter applied; rows grouped by contactId.
- Refs: R2.10, R4.4, design §4/§8.

## B4 — Collision endpoints [NEW] (1 half-day)
Add `GET /api/collision/contact?contactId=…` and `POST /api/collision/contacts`
({contactIds}, cap 200), both `withAuthRLS`: build name map once (B2), fetch
touches once (B3), run B1 per contact with `currentUserId=authCtx.appUserId`.
Return `LastTouchByOthers|null` (single) / `Record<contactId, …>` (batch).
- Verify: signed-in-as-current-user, a contact touched by another user returns
  non-null; touched only by self returns null; unknown contact returns null.
- Test: `app/api/collision/__tests__/contact.test.ts` — single + batch happy
  path; self-only→null (R5.6); throw in fetch → 500 but documented client
  fail-closed (assert route returns error, consumer ignores).
- Refs: R2.*, R3.1, R4.1, R5.2.

## B5 — Pre-call collision in /api/calls/start [NEW] (0.5 half-day)
Extend `api/calls/start/route.ts`: after token issue (lines ~196-210), compute
collision for `contact.id` in a try/catch defaulting to null; add `collision`
to the success JSON. AFTER all existing gates (R3.2), never fails the call (R3.3).
- Verify: start response includes `collision`; with the lookup forced to throw,
  call still returns started + `collision:null`.
- Test: `app/api/calls/__tests__/start-collision.test.ts` — success payload
  carries collision; lookup throw → call still 200 with collision null (R3.3);
  DNC/quiet-hours paths unchanged (regression).
- Refs: R3.1–R3.3.

## B6 — Nominative line: contact detail timeline [NEW] (0.5 half-day)
Extend `/api/activities` GET to return `actorType`,`actorId`, resolved
`actorName` (member-name map built once per request, R1.8). Update
contacts/[id]/page.tsx `Activity` interface + the Activity card (lines 286-327)
to render `actorName` (system→"System" R1.5; contact→prospect R1.6; miss→
anonymous R1.7).
- Verify: on the seeded contact, lines read "<name> · <type> · <time>"; a
  system row reads "System"; a NULL-actor row stays anonymous.
- Test: extend the activities route test — response includes actorType/actorId/
  actorName; name resolves via map; unknown actor → null name (R1.7); single
  members query for many rows (R1.8).
- Refs: R1.1–R1.2, R1.5–R1.8, R1.10.

## B7 — Nominative line: deal + opportunity timelines [NEW] (0.5 half-day)
Add `actorType`,`actorId` to the selects in api/deals/[id]/timeline/route.ts
(lines 18-34) and api/opportunities/[id]/timeline/route.ts; resolve `actorName`
via the map; render in the consuming timeline component.
- Verify: deal/opportunity timeline rows show the acting member's name.
- Test: `app/api/deals/__tests__/timeline-actor.test.ts` — response carries
  actorName; system/miss handled (R1.5/R1.7).
- Refs: R1.3, R1.5, R1.7.

## B8 — Nominative line: Call Mode brief [NEW] (0.5 half-day)
Add `actorType`,`actorId` to getContactBrain directActivities select
(get-contact-brain.ts:119-140); resolve `actorName` in the brain route
(api/brain/contact/[contactId]/route.ts) via the name map; add `actorName` to
`BrainActivity` in _panels.tsx and render it in "Historique" (lines 695-712).
- Verify: Call Mode pre-call brief "Historique" lines are nominative.
- Test: extend `lib/company-brain/__tests__/get-contact-brain.test.ts` —
  directActivities carry actorType/actorId; brain-route test asserts actorName
  resolution.
- Refs: R1.4, R1.5, R1.7.

## B9 — Pre-call warning UI in cockpit [NEW] (0.5 half-day)
Thread `collision` from the start response through the Call Mode page into
PreCallBrief (_panels.tsx); render a soft warning line with `AlertTriangle`
(already imported) — "Already contacted by <user> <N>d ago — <channel/outcome>"
— Call action stays enabled. No emoji.
- Verify: with a non-null collision the warning renders and Call is still
  clickable; self-only → no warning.
- Test: component test (or Playwright) — warning present iff collision non-null;
  Call button enabled regardless (R3.4); self-only suppressed (R5.6).
- Refs: R3.4, R3.5, R5.6.

## B10 — Pre-enroll warning UI [NEW] (1 half-day)
On the enroll surface, call `POST /api/collision/contacts` for the selected ids
before enrolling; render "N of M already contacted by a teammate"; proceed
enrolls ALL (no auto-skip). Enroll route skip logic untouched (R4.3).
- Verify: a set mixing self-touched + other-touched contacts flags only the
  other-touched ones; proceeding enrolls all; lookup throw → no warning, enroll
  proceeds.
- Test: `app/.../__tests__/enroll-collision.test.ts` (or component) — summary
  count correct; self-only contact not flagged (R4.6); enroll still enrolls all
  (R4.3); fetch throw → fail-closed (R4.5).
- Refs: R4.1–R4.6, R5.6.

## B11 — Composer-open warning UI [NEW] (0.5 half-day)
In EmailComposerPanel, on open with `contactId`, call `GET /api/collision/
contact`; show the soft warning line; Send untouched. No contactId → no fetch.
Lookup fail → open normally.
- Verify: composer on a recently-other-touched contact shows the warning, Send
  enabled; free-form-recipient composer makes no collision call.
- Test: component test — warning shown iff non-null collision + contactId
  present (R5.1); no fetch without contactId (R5.3); fail-closed (R5.4); Send
  always enabled (R5.5).
- Refs: R5.1–R5.6.

## B12 — Regression + conventions sweep [NEW] (0.5 half-day)
Run regression.sh + `tsc` + vitest from app/apps/web. Grep new UI for emoji
(icon===""/no-emoji test), provider names, French in chrome. Confirm no
migration was added and no `ownerId`-based collision logic crept in.
- Verify: full suite green; no emoji/provider-name regressions; visibility
  unchanged (no record hidden).
- Test: rely on existing no-emoji + regression suites; add none.
- Refs: R0.1–R0.6, conventions.
