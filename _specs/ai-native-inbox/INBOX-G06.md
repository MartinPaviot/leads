# INBOX-G06 — Collision awareness (teammate already engaged)
> Theme: T7 · Autonomy rung: helper · Priority: P1
> Pillar: P5 GTM moat

## User story
As a founder about to reply to a prospect, I want to see if a teammate already called or emailed
them recently — who, which channel, how long ago — so two of us don't double-work the same prospect
or step on each other mid-deal.

## Why (audit anchor)
Superhuman has "Collision Avoidance" but it's the shallow kind — seeing that a teammate is *viewing
the same thread right now* (`findings.md` §B/§G, `feature-inventory.md`). Ours is deeper and
activity-driven: `lib/collision/recent-touch.ts` keys the warning on the REAL, already-stamped
interaction (who actually called/emailed and when), not on presence and not on the frequently-null
`ownerId` — so it's correct precisely on the shared prospects two reps both pick up. That engine
already powers pre-call, contact/opportunity timelines and the composer pre-send warning; the inbox
is the remaining surface.

## Requirements (EARS)
- WHEN a conversation resolves to a contact, the system SHALL compute the most-recent touch by a
  teammate OTHER than the viewer within the recency window (`RECENT_TOUCH_WINDOW_DAYS = 30`) via
  `computeLastTouchByOthers`, and SHALL surface a collision notice when one exists.
- The notice SHALL be nominative: teammate name (resolved via `member-names`), channel
  (call/email/other), outcome when present, and relative age ("Marc · appel · il y a 2 j").
- WHEN more than one other teammate touched the prospect in the window, the system SHALL show the
  most recent and the distinct-other-user count ("+1 autre").
- The system SHALL source touches from all three attributed channels — `calls.userId`,
  user-attributed `activities.actorId`, and outbound emails bridged mailbox→user (auth→app) — never
  the owner field.
- WHEN the only touches are the viewer's own, or all are stale/empty, the system SHALL show nothing
  (no false collision).
- The collision notice SHALL appear both in the GTM sidebar (G01) and inline on the composer before
  sending a reply (pre-send warning), and SHALL be advisory only (never block the send).
- The system SHALL resolve actor ids in app-space (`users.id`) and SHALL hard-scope to the viewer's
  tenant; it SHALL never reveal another tenant's teammates.
- WHEN a touching teammate's name cannot be resolved, the system SHALL use the non-empty fallback
  ("a teammate"), never an empty string or a raw id.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a prospect a teammate called 2 days ago WHEN the thread opens THEN the sidebar shows "Marc ·
  appel · il y a 2 j".
- GIVEN a prospect two teammates emailed in the window WHEN opened THEN it shows the most recent +
  "+1 autre".
- GIVEN the viewer is the only one who touched the prospect WHEN opened THEN no collision notice shows.
- GIVEN a teammate touch 40 days ago (outside the 30-day window) WHEN opened THEN no notice shows.
- GIVEN the user clicks "Reply" on a colliding prospect WHEN the composer opens THEN the pre-send
  warning shows the same nominative notice, and the send is still allowed.
- GIVEN a touch whose actor resolves to no member name WHEN shown THEN it reads "a teammate", not a raw id.
- GIVEN two tenants WHEN collisions compute THEN only same-tenant teammates appear.

## Edge cases & failure handling
- `ownerId` null (manual-only assignment) → irrelevant; the engine is activity-keyed, so it still warns.
- Outbound email with no `mailboxId`/unbridgeable user → that touch is `userId:null` and is ignored
  (not attributed to a phantom teammate).
- Ties on timestamp → deterministic tie-break (userId then channel) so the result is order-independent.
- High-volume prospect → `sinceDate` bounds every scan; indexes cover the predicates; cap contact ids.
- Self + others same second → others still surface (self is filtered first).
- Activity row classification ambiguous → `classifyChannel` maps email-ish > call-ish > other.

## Best-in-class bar
- **Activity-driven, not presence- or owner-driven**: we warn based on who *actually* engaged the
  prospect — correct on exactly the shared prospects that slip through owner-based or
  presence-based collision. Superhuman only knows who's looking at the thread now.
- **Nominative + cross-channel + cited**: name, channel, outcome, age — reusing the engine already
  trusted across pre-call and the composer, so the inbox warning is consistent with the rest of the product.

## Design sketch
- **Data:** `calls` (`userId`), `activities` (`actorId`, `actorType:'user'`), `outbound_emails`
  (`mailboxId` → `connected_mailboxes.user_id`); pure core `computeLastTouchByOthers`
  (`lib/collision/recent-touch.ts:76`), fetch `getContactTouchRows`
  (`lib/collision/contact-touches.ts:22`), names `lib/collision/member-names.ts`.
- **API:** extend `GET /api/inbox/context` (G01) to call `getContactTouchRows` (for the resolved
  contact, `now − RECENT_TOUCH_WINDOW_DAYS`) → `computeLastTouchByOthers` and return
  `collision: LastTouchByOthers | null`. The composer pre-send check reuses the same shape (mirror
  the existing `contact-collision-notice.tsx` component).
- **UI:** a collision strip in the G01 sidebar + the existing shared `contact-collision-notice.tsx`
  in the composer (`--color-warning-soft` bg, lucide `Users` glyph, `--color-text-secondary` copy).
  Advisory, dismissible, never blocks send. Shortcut: surfaced on reply (`r`). Light+dark via tokens,
  no emoji, no provider name, the touch cited (who/when/channel).
- **AI:** none — pure attribution, nothing generated.
- **Security/perf:** app-space ids only; `sinceDate`-bounded scans; tenant scope; auth→app bridge
  done once per distinct user (`authToAppUserId`).

## Tasks (ordered)
1. Add `collision` to `GET /api/inbox/context` via `getContactTouchRows` + `computeLastTouchByOthers`
   (window = 30 d). (verify: returns the most-recent other-teammate touch for a known contact) (test:
   route test — self-only → null, other → present)
2. Collision strip in the G01 sidebar. (verify: browser — "Marc · appel · il y a 2 j" renders) (test:
   render test).
3. Reuse `contact-collision-notice.tsx` in the reply composer pre-send (advisory). (verify: composer
   shows the notice, send still works) (test: composer render + "send allowed")
4. Fallback + multi-teammate + stale cases. (verify: unresolved name → "a teammate"; 40-day touch →
   no notice) (test: edge cases mirroring `recent-touch.test.ts`)

## Current-state notes (VERIFY before building — code moves)
- `lib/collision/recent-touch.ts`: `computeLastTouchByOthers` (`:76`), `RECENT_TOUCH_WINDOW_DAYS = 30`
  (`:45`), `UNKNOWN_TEAMMATE = "a teammate"` (`:48`), deterministic tie-break (`:103`). **Pure +
  unit-tested — reuse, don't fork.**
- `lib/collision/contact-touches.ts`: `getContactTouchRows` (`:22`) unions calls/activities/outbound,
  bridges mailbox→auth→app once per user (`:123`).
- Existing surfaces already shipped (collision-awareness chantier, MEMORY): pre-call brief, contact &
  opportunity timelines, composer pre-send (`contact-collision-notice.tsx`, shared en/fr). The inbox
  sidebar + inbox composer are the remaining surfaces.
- G01 (`INBOX-G01.md`) already lists collision as a sidebar requirement; G06 is the detailed spec it
  references.
- No inbox-specific collision wiring exists yet (grep: `contact-collision-notice` not imported in
  `_conversation-pane.tsx`).
