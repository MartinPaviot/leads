# INBOX-K03 — Zero-latency optimistic UI
> Theme: T6 · Autonomy rung: passive · Priority: P0
> Pillar: cross (speed/keyboard-first)

## User story
As a user triaging fast, I want every action — done, snooze, reopen, reply-sent, stop-sequence — to
take effect on screen the instant I press the key, with the server reconciled in the background, so
the inbox never makes me wait.

## Why (audit anchor)
Superhuman's defining quality is the **zero-latency feel**: Mark Done (E) "instantly archives from
inbox, auto-advances selection, count ticks down" before any network round-trip (findings §B, §G).
The whole "fastest inbox" thesis is optimistic UI. We already do this for triage in the inbox
(`handleTriage` removes the row, advances selection, and decrements the count optimistically, then
POSTs — `page.tsx:146-179`), but it is **not uniform**: stop-sequence and prepared-draft consume run
behind spinners, and there is no shared, tested optimistic+rollback pattern. K03 makes optimism the
rule across all inbox mutations, with correct rollback.

## Requirements (EARS)
- WHEN the user triggers a mutating action (done/snooze/reopen), the system SHALL update local state
  immediately (remove/move the row, advance selection, adjust lane counts) BEFORE awaiting the server.
- WHEN the server confirms, the system SHALL keep the optimistic state (no flicker, no refetch).
- WHEN the server rejects or the request fails, the system SHALL roll back to the precise prior state
  (restore the row at its index, restore counts, restore selection) and show one error toast.
- The system SHALL serialize dependent reads behind in-flight writes so a follow-on lane fetch never
  observes pre-commit state (the existing `pendingTriage` await — `page.tsx:82,168`).
- The system SHALL apply the same optimistic+rollback contract to stop-sequence and prepared-draft
  consume (today both block on the network with a spinner).
- The system SHALL keep actions idempotent on the client: a double-press SHALL NOT double-decrement a
  count or double-remove a row.
- The system SHALL never leave the UI in a "ghost" state on navigation away mid-request (in-flight
  promises are tolerant of unmount).
- The system SHALL preserve keyboard focus/selection continuity across an optimistic mutation (the
  next row is selected, the list stays scrolled to it).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a thread selected in Needs-attention WHEN the user presses `e` THEN the row disappears, the
  next row is selected, and the attention count drops by 1 with no perceptible delay; the POST
  resolves afterward with no visual change.
- GIVEN the same action WHEN the POST returns 500 THEN the row reappears at its original index, the
  count is restored, the prior selection returns, and a single "Couldn't update — reloading" toast
  shows.
- GIVEN a snooze WHEN applied THEN the row leaves attention and the snoozed count rises immediately;
  on failure both revert.
- GIVEN the user presses `e` then immediately switches to the Done tab WHEN the lane loads THEN it
  reflects the just-archived thread (the GET awaited the in-flight POST), never an empty/stale lane.
- GIVEN a prepared-draft reply sent WHEN it succeeds THEN the draft banner vanishes optimistically and
  the consume call runs in the background; on failure the banner returns.
- GIVEN the user double-presses `e` on the same row WHEN handled THEN the count decrements exactly once.

## Edge cases & failure handling
- Network flap mid-action (the machine drops external net in waves) → rollback + toast; the user can
  retry; no duplicate writes (idempotent client + server dedup).
- Optimistic remove of the last row in a lane → selection becomes null, pane shows the empty/"select a
  conversation" state cleanly.
- Rollback target index out of range (list changed underneath) → clamp insertion to a valid index,
  never throw.
- Slow server (>2 s) → UI already moved on; a late failure still rolls back correctly (state captured
  at action time, not read at resolve time).
- Two tabs open → optimistic state is per-tab; server is source of truth on next load; no cross-tab
  promise sharing.

## Best-in-class bar
- We match Superhuman's instant feel **and** make rollback first-class and tested — a 500 leaves the
  inbox exactly as it was, which a naive optimistic UI gets wrong. The contract is one shared helper,
  covered by race + failure tests, not ad-hoc per action.
- Because triage verbs are shared with the command palette (K01) and keyboard flow (K06), optimism is
  consistent no matter how the action was invoked — mouse, `e`, or Cmd+K all feel identical.

## Design sketch
- **Data:** none new; pure client state in `app/(dashboard)/inbox/page.tsx`
  (`conversations`, `counts`, `selectedKey`).
- **API:** unchanged endpoints (`POST /api/inbox/triage`, `POST /api/inbox/drafts/:id/consume`,
  `PUT /api/sequences/:id/enroll`); they remain the reconciliation authority.
- **UI:** generalize the existing optimistic block in `handleTriage` (`page.tsx:146-179`) into a small
  `applyOptimistic({ mutate, rollback, commit })` utility (e.g. `lib/inbox/optimistic.ts` or a local
  hook) and route stop-sequence + draft-consume through it. No new visible chrome; the win is felt,
  not seen. Tokens unchanged. Light + dark, no emoji, no provider name (no UI surface added).
- **AI:** none.
- **Security:** unchanged; mutations stay tenant/user-scoped server-side.
- **Failure/perf:** capture prior state by value at action start; restore on reject. Keep the
  `pendingTriage` serialization so reads can't race writes.

## Tasks (ordered, each with verify + test)
1. Extract `applyOptimistic` (snapshot → mutate → POST → keep|rollback) from `handleTriage`. (verify:
   triage behaves identically) (test: `optimistic.test.ts` — commit keeps state, reject restores
   exact snapshot incl. index + counts + selection)
2. Add rollback-by-index to the triage path (today failure refetches the whole lane — `page.tsx:173`;
   keep refetch as a fallback but restore the row first for zero-flicker). (verify: forced 500
   restores the row in place) (test: failure restores index)
3. Route stop-sequence consume through the optimistic helper (banner/enrollment vanish immediately,
   revert on failure). (verify: stop with a forced failure reverts the chip) (test: enrollment
   rollback)
4. Route prepared-draft consume optimistically (`_conversation-pane.tsx:186-193`). (verify: send →
   banner gone instantly; failed consume restores it) (test: draft banner rollback)
5. Add a double-press idempotency guard keyed by conversationKey. (verify: count decrements once on
   double `e`) (test: idempotency)

## Current-state notes (VERIFY before building — code moves)
- Optimistic triage ALREADY exists: `app/(dashboard)/inbox/page.tsx:146-179` removes the row, advances
  selection, adjusts `counts`, then POSTs; on failure it toasts and **refetches the whole lane**
  (`:171-173`) rather than restoring the row in place — a flicker K03 removes.
- `pendingTriage` ref (`page.tsx:62,82,168`) serializes lane GETs behind the in-flight triage POST —
  keep this; it's the race fix that prevents empty-lane reads.
- Stop-sequence (`_conversation-pane.tsx:195-216`) and prepared-draft consume (`:186-193`) are NOT
  optimistic today — they await behind `stopping`/spinner state. These are the non-uniform spots.
- No shared optimistic helper exists yet; this spec introduces one and is a prerequisite consistency
  layer for K01 (palette verbs) and K06 (keyboard flow).
