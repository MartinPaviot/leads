# INBOX-T09 — Bulk keyboard triage (multi-select actions)
> Theme: T2 · Autonomy rung: passive · Priority: P1
> Pillar: P4 triage / cross (speed)

## User story
As a user clearing my inbox, I want to multi-select conversations (keyboard or click) and apply
one action — done, snooze, label, archive, unsubscribe — to all of them, so inbox-zero is a few
keystrokes, not one row at a time.

## Why (audit anchor)
Superhuman ships **Bulk Actions** and a "Get Me To Zero" flow (`feature-inventory.md` Triage),
and the audit lists "bulk newsletter triage" + keyboard-first flow as core (`ai-native-mailbox-
audit.md` §2, §6). Today the inbox triages **one** selected conversation via `j/k/e/r`
(`page.tsx:181-222`) with no multi-select. T09 adds range/multi-select + a bulk action bar,
reusing the existing single-verb triage and the bundle bulk path (INBOX-T03).

## Requirements (EARS)
- The system SHALL let a user select multiple conversations via keyboard (`x` toggles selection on
  the focused row; `Shift+j/k` extends a range) and via click (checkbox / Shift-click range).
- WHEN one or more conversations are selected, the system SHALL show a bulk action bar with the
  count and the available actions (Done, Snooze, Label, Archive, Unsubscribe + block).
- The system SHALL apply the chosen action to every selected conversation in one request, with
  optimistic UI (remove from the current lane, advance focus), mirroring the single-verb optimistic
  path (`page.tsx:146`).
- WHEN a bulk action partially fails, the system SHALL report which conversations failed and
  reconcile (reload the lane), never claim full success.
- The system SHALL support "Select all in this lane" (cap + "Selected N of M"), consistent with the
  Accounts/Contacts "select-all = all matching" pattern.
- The system SHALL keep keyboard focus and selection coherent (Esc clears selection; the action bar
  is reachable by keyboard).
- The system SHALL keep all actions per-user/tenant-scoped and route through the existing
  triage/label/unsubscribe endpoints.
- Bulk Snooze SHALL use the unified snooze control (INBOX-T05), including "if no reply".

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the attention lane WHEN the user presses `x` on three rows THEN the action bar shows
  "3 selected".
- GIVEN 3 selected WHEN the user presses `e` (or clicks Done) THEN all three are marked done
  optimistically and the counts update once.
- GIVEN 3 selected WHEN the user chooses Snooze "2d" THEN all three snooze to the same time
  (INBOX-T05 parsing).
- GIVEN "Select all in this lane" on a 200-item lane WHEN chosen THEN it selects up to the cap and
  shows "Selected N of 200".
- GIVEN a bulk Done where one POST fails WHEN it returns THEN the failed row reappears and a toast
  names the failure.
- GIVEN a multi-select WHEN the user presses Esc THEN selection clears and focus is preserved.
- GIVEN two tenants WHEN a bulk action runs THEN it only affects the acting user's scoped
  conversations.

## Edge cases & failure handling
- Mixed-lane selection (shouldn't happen — selection is within the active lane) → guard: actions
  apply only to the active lane's selected rows.
- Action invalid for some selected (e.g. Reopen on attention rows) → disable/omit that action when
  the selection doesn't support it.
- Very large selection → batch server-side (reuse the bundle bulk-triage batching, INBOX-T03); cap
  the single request and chain.
- Optimistic removal then failure → reconcile by reloading the lane (existing `loadLane`).
- Selection survives a `Load more`? → keep selected keys across appends; clear on lane switch.
- Multi-tenant/per-user: every batched action authorizes the owner.

## Best-in-class bar
- Bulk actions are **keyboard-native** (`x` + `Shift+j/k`) layered on the existing `j/k/e/r`
  muscle memory, so power users clear a lane without the mouse — matching Superhuman's speed in our
  light DNA.
- "Select all in this lane" reuses our proven **all-matching** select pattern (cap + "N of M"), and
  bulk Snooze inherits the unified **if-no-reply** control — neither is a generic checkbox bar.

## Design sketch
- **Data:** none new — operates on the loaded `ConversationListItem[]` (`_types.ts:12`) + the
  existing triage/label/unsubscribe endpoints.
- **API:** a thin `POST /api/inbox/triage/bulk` `{conversationKeys[], action, snoozeUntil?,
  snoozeIfNoReply?, labelId?}` that fans out (batched, owner-scoped) over the single-verb logic in
  `app/api/inbox/triage/route.ts`; Label routes to INBOX-T02; Unsubscribe to INBOX-T07; Archive to
  INBOX-T10. Returns per-key success/failure.
- **UI:** add a selection layer to `_conversation-list.tsx` (checkbox per row in a `--color-bg-hover`
  state, Shift-click range) + a bulk action bar pinned at the list bottom/top (light card,
  `--shadow-panel`, `Button`s, count text `--color-text-secondary`). Keyboard handlers extend
  `page.tsx:181` (`x` toggle, `Shift+j/k` range, `Esc` clear). lucide `CheckSquare` (selection),
  reuse `CheckCircle2`/`AlarmClock`/`Tag`/`Archive`. Shortcut map documented in INBOX-K02.
  Light+dark via tokens, no emoji, no provider name, results reported plainly.
- **AI:** none (bulk Snooze suggestion still via INBOX-T05 if invoked).
- **Security/perf:** batched + capped; optimistic + reconcile-on-failure; owner-scoped.

## Tasks (ordered)
1. Selection state + keyboard (`x`, `Shift+j/k`, `Esc`) in `page.tsx`/`_conversation-list.tsx`.
   (verify: rows toggle) (test: selection reducer test)
2. Bulk action bar UI (count, action buttons, disabled-when-invalid). (verify: browser — "3
   selected" bar) (test: render)
3. `POST /api/inbox/triage/bulk` fan-out (batched, owner-scoped, per-key result). (verify: 3 done
   in one call) (test: route — partial failure reported)
4. Wire Label (T02) / Archive (T10) / Unsubscribe (T07) / Snooze (T05) into the bar. (verify: each
   action works on a selection) (test: integration)
5. "Select all in this lane" (cap + "N of M"). (verify: selects up to cap) (test: select-all test)
6. Optimistic + reconcile-on-failure; selection persistence across `Load more`. (verify: failure
   reappears) (test: reconcile)

## Current-state notes (VERIFY before building)
- Single-conversation keyboard triage exists: `page.tsx:181-222` (`j/k` nav, `e` done, `r` reply);
  optimistic remove+advance `page.tsx:146-179`.
- Single triage verb endpoint: `app/api/inbox/triage/route.ts` (extend with a `/bulk` sibling).
- List rows: `_conversation-list.tsx` (add selection layer); item shape `_types.ts:12`.
- "All-matching" select precedent: project_select-all-matching (header checkbox → ?idsOnly=true,
  caps inventoried). Reuse the cap + "N of M" idiom.
- No multi-select / bulk endpoint exists yet.
