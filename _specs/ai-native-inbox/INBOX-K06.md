# INBOX-K06 — Keyboard triage flow (j/k/e/#/r; mirror E/H/C/ / + G-then-X go-to)
> Theme: T6 · Autonomy rung: passive · Priority: P0
> Pillar: cross (speed/keyboard-first) + P4 triage

## User story
As a user clearing my inbox, I want to triage entirely from the keyboard — move with j/k, mark done,
snooze/remind, reply, compose, and jump between lanes with G-then-X — so I can get to zero without
ever touching the mouse.

## Why (audit anchor)
This is the heart of Superhuman's speed: a persistent command bar "E Done · H Remind · C Compose ·
/ Search · Ctrl+K Command" plus "G then X" go-to chords down the rail (G·i Inbox, G·S, G·D, G·E,
G·H…) — everything keyboard-reachable, Mark Done auto-advances (findings §B, §G). We already have a
**seed**: the inbox binds `j`/`k` (navigate), `e` (done), `r` (reply) with typing-safe guards
(`page.tsx:182-222`). K06 completes the flow to Superhuman parity in Elevay DNA: add `h` (remind /
snooze, with the "if no reply" idea from findings §H folded into the snooze picker), `c` (compose),
`#` (done as an alias reachable even where `e` collides), and lane go-to chords, all registered in the
cheatsheet (K02) and running the same optimistic handlers (K03).

## Requirements (EARS)
- The system SHALL bind, on the inbox, typing-safe single keys: `j` next, `k` previous, `e` mark done,
  `#` mark done (alias), `h` remind/snooze (opens the snooze picker), `r` reply, `c` compose new,
  Enter open/expand the selected thread.
- WHEN the user presses `e`/`#` on an attention/snoozed thread, the system SHALL mark it done
  optimistically and auto-advance selection to the next row (existing behavior for `e`; extend to `#`).
- WHEN the user presses `h`, the system SHALL open the snooze/remind picker for the selected thread
  (Tomorrow / In 3 days / Next Monday, plus a natural-language entry per the steal-list), with an
  "only if no reply" option that maps to our no-reply-nudge engine (INBOX-T05/T06).
- WHEN the user presses `r`, the system SHALL open the reply composer for the selected thread (today
  via the `replySignal` bump — `page.tsx:213-217`).
- WHEN the user presses `c`, the system SHALL open a blank compose composer (new message), not a reply.
- The system SHALL support lane go-to chords: `g` then `i` Inbox (attention), `g` then `s` Snoozed,
  `g` then `e` Done, `g` then `h` Handled, `g` then `o` Outbound — switching the active tab.
- WHEN focus is in an input/textarea/select/contenteditable, the system SHALL suppress ALL these keys
  (the inbox handler already guards this — `page.tsx:186-194`).
- The system SHALL keep selection and scroll continuity: the selected row stays scrolled into view on
  j/k and after auto-advance (existing `scrollIntoView` — `page.tsx:205-207`).
- The system SHALL register every binding in the shortcut registry with descriptions/group "Inbox"
  (K02), and honor custom remaps (K07).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the inbox with rows WHEN the user presses `j`/`k` THEN selection moves down/up and the row
  scrolls into view; at the ends it clamps.
- GIVEN an attention thread selected WHEN the user presses `e` or `#` THEN it is marked done
  optimistically and selection advances to the next row.
- GIVEN a selected thread WHEN the user presses `h` THEN the snooze picker opens; choosing "Next
  Monday" snoozes it; ticking "only if no reply" arms a no-reply nudge instead of an unconditional
  resurface.
- GIVEN a selected thread WHEN the user presses `r` THEN the reply composer opens (prepared draft if
  one exists, else an AI-suggested or blank reply, per the pane's `openReply`).
- GIVEN the inbox WHEN the user presses `c` THEN a blank compose composer opens (To empty, no quoted
  thread).
- GIVEN the user presses `g` then `e` THEN the Done tab becomes active and loads; `g i` returns to
  attention.
- GIVEN focus in the composer WHEN the user types any of j/k/e/#/h/r/c THEN nothing triages (the text
  is typed normally).
- GIVEN a user who remapped `e`→`x` (K07) WHEN they press `x` on a thread THEN it marks done.

## Edge cases & failure handling
- `e`/`#` on a Done/Handled lane (not triageable) → no-op (mirrors the current guard that only
  attention/snoozed are done-able — `page.tsx:209`).
- Snooze picker open + `h` again → toggles/refocuses, doesn't stack pickers.
- `c` compose while a reply composer is already open → either focus the open composer or replace it
  intentionally; never two composers.
- Empty lane → j/k/e/#/h/r/c are inert; `c` (compose) still works (no selection needed).
- Lane chord `g e` while a triage POST is in flight → the lane GET awaits `pendingTriage`
  (`page.tsx:82`) so it never reads pre-commit state.
- Key conflicts: `h` is "remind" here but must not collide with any global `h`; scope inbox keys to the
  inbox handler and `preventDefault` only when handled.
- Reduced-motion: scroll-into-view uses `block: "nearest"`, no smooth-scroll requirement.

## Best-in-class bar
- Full parity with Superhuman's bar (E/H/C/ / + G-then-X) but each verb runs our **optimistic,
  CRM-aware handlers**: `r` can open a **prepared draft grounded in the prospect's real context**
  (`_conversation-pane.tsx:135-143`), and `h`'s "only if no reply" maps to our **owned sequence /
  no-reply engine** — Superhuman guesses, we know.
- The whole flow is **registered and discoverable** (K02 cheatsheet) and **remappable** (K07), where
  Superhuman's bindings are fixed.
- It reuses the exact handlers behind the on-screen buttons and the command palette (K01), so keyboard,
  mouse, and Cmd+K can never diverge.

## Design sketch
- **Data:** none new; inbox client state (`conversations`, `selectedKey`, `tab`) in `page.tsx`. Snooze
  "if no reply" persists via the triage/snooze path (INBOX-T05/T06 own the nudge semantics).
- **API:** reuse `POST /api/inbox/triage` (done/snooze/reopen), the reply path
  (`/api/emails/suggest-reply` + the composer), and the compose composer. No new endpoints in K06
  (the "if no reply" flag rides the existing snooze payload; its engine is T05/T06).
- **UI:** extend the inbox keyboard effect in `app/(dashboard)/inbox/page.tsx:182-222`: add `#`, `h`,
  `c`, Enter, and the lane `g`-chords (mirror the chord timer pattern from
  `hooks/use-keyboard-shortcuts.ts:60-85`). `h` opens the existing snooze popover in
  `_conversation-pane.tsx:314-341` (lift its open-state or trigger via a signal like `replySignal`).
  `c` opens `EmailComposerPanel` (`components/email-composer-panel.tsx`) in compose mode. Surface
  tokens unchanged (selected row `--color-accent-soft` + `inset 2px 0 0 var(--color-accent)`,
  `_conversation-list.tsx:80-82`). Icons already present: CheckCircle2/AlarmClock/Mail/CalendarPlus.
  Shortcuts: **j k e # h r c**, **g then i/s/e/h/o**. Light + dark via tokens, no emoji, no provider
  name, cited (prepared-draft path is grounded/cited per INBOX-G08).
- **AI:** only indirectly — `r` may surface an AI-suggested or prepared reply (existing); no new AI.
- **Security:** all actions scoped to the user's own conversations (`lib/inbox/user-scope.ts`).
- **Failure/perf:** optimistic via K03; chord timer 1 s; typing-safe guard already present.

## Tasks (ordered, each with verify + test)
1. Add `#` as a done alias and `Enter` to open/expand in the inbox keydown handler. (verify: `#` marks
   done, Enter focuses the thread) (test: `inbox-keyboard.test.ts` — `#`→done, Enter→open)
2. Add `h` to open the snooze/remind picker (lift the popover open-state from the pane or drive it via
   a signal), including the "only if no reply" option wired to T05/T06. (verify: `h` opens the picker;
   "if no reply" arms a nudge) (test: `h` opens picker; flag passes through)
3. Add `c` to open a blank compose composer. (verify: `c` opens an empty composer) (test: `c`→compose
   mode, no quoted thread)
4. Add lane go-to chords `g i/s/e/h/o` (mirror the existing `g`-chord timer). (verify: `g e`→Done tab)
   (test: chord switches `tab`)
5. Register all inbox bindings in the shortcut registry with group "Inbox" (K02) and route remaps
   through K07. (verify: cheatsheet lists the Inbox group; remap respected) (test: registry has Inbox
   group; custom combo fires)
6. Confirm every verb runs the optimistic handlers from K03. (verify: `e`/`#`/`h` feel instant; failure
   rolls back) (test: optimistic + rollback for keyboard-initiated done/snooze)

## Current-state notes (VERIFY before building — code moves)
- Inbox keyboard handler EXISTS: `app/(dashboard)/inbox/page.tsx:182-222` binds `j`/`k` (navigate with
  `scrollIntoView`), `e` (done, attention/snoozed only), `r` (reply via `replySignal` bump), all
  typing-safe (`:186-194`) and modifier-guarded (`:184`). **Missing: `#`, `h`, `c`, Enter, lane
  chords.**
- Snooze picker UI ALREADY exists in the pane (`_conversation-pane.tsx:314-341`) with Tomorrow/In 3
  days/Next Monday (`SNOOZE_OPTIONS` `:32-60`) — `h` should drive it; natural-language entry + "if no
  reply" are the additions (T05/T06 own those).
- Reply flow `openReply` (prepared draft → AI-suggested → blank) at `_conversation-pane.tsx:132-178`;
  triggered by `r` through `replySignal` (`page.tsx:57,213-217` → pane `:181-184`). Compose composer is
  `components/email-composer-panel.tsx`.
- Global `g`-chord pattern to mirror for lanes: `hooks/use-keyboard-shortcuts.ts:60-85` (note: those
  global chords navigate ROUTES; the inbox lane chords switch the inbox `tab`, a different target —
  keep them scoped to the inbox so `g e` means "Done lane" only on /inbox).
- Optimistic handler `handleTriage` (`page.tsx:146-179`) is shared by mouse + keyboard; K03 generalizes
  it. None of the inbox keys are in the shortcut registry yet (K02 task).
