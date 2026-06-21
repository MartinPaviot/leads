# B6 `inbox-command-palette` — Requirements (EARS)

> Track B (Triage/UX), ROADMAP row B6. Priority P2. Deps: F1 (design-system).
> Gate G-design applies (F1 section 8); G-eval N/A (no LLM in this feature).

## Ground truth (verified 2026-06-20 against the worktree)

A command palette ALREADY EXISTS in the inbox — this spec EXTENDS it, it does
not build one from scratch. Two distinct palettes are live:

- Inbox palette — `inbox/_command-palette.tsx` (the `CommandPalette` /
  `PaletteCommand` used by the inbox). Already ships: Cmd/Ctrl+K toggle
  (`page.tsx:678-687`), fuzzy filter via `fuzzyRank` (`_command-palette.tsx:33`,
  `lib/inbox/fuzzy.ts`), ArrowUp/Down + Enter + Esc nav, mouse hover, a per-row
  `hint` field (`_command-palette.tsx:12-18,116-120`), and a command set built in
  `paletteCommands` (`page.tsx:711-779`): go-to lane (built-in + custom), mailbox
  switch, mark-done, snooze-1-day, open-conversation-by-fuzzy-name.
- Global CRM palette — `components/ui/command-palette.tsx`, mounted in the
  dashboard layout (INBOX-K01). Out of scope here; do NOT fork it into the inbox.

Existing single-key handlers in `page.tsx:589-671` (ignored while typing — guard
at `:593-601`): `j`/`k` navigate, `e` done (single or bulk), `x`/`X` select
(Shift = range), `Esc` clear selection, `r` reply (`setReplySignal`), and the
`m`-then-digit mailbox quick-switch (`:606-626`). The shared-handler bridge already
exists: `ConversationPaneApi` (`_conversation-pane.tsx:98-105`) exposes
`openReply` / `bookMeeting` / `stopSequence`, read via `paneApiRef`
(`page.tsx:414`). Triage runs through `handleTriage` (`page.tsx:318-351`) which is
serialized by the `pendingTriage` guard.

The brief lists shortcuts E/S/L/B/! and the existing r/j/k/x. Mapped to ground
truth: `e`/`r`/`j`/`k`/`x` already exist; `s` (snooze), `l` (label), `b` (book
meeting) are NEW single keys; `!` (mark important) has NO existing mutation route —
see R5 and the non-goals.

## Status legend
[DONE] shipped · [NEW] real gap · [CFG] config-only · [LOCKED] stack decision · [HORS SCOPE] track separately

---

## R1 — Command palette surface (already present; reuse)

- R1.1 [DONE] WHEN the user presses Cmd+K or Ctrl+K on the inbox, THE SYSTEM SHALL toggle the inbox command palette open/closed, even while focus is in a text field. (page.tsx:678-687)
- R1.2 [DONE] WHEN the palette is open, THE SYSTEM SHALL focus the search input and support ArrowUp/ArrowDown to move the active row, Enter to run it, and Escape to close. (_command-palette.tsx:36-94)
- R1.3 [DONE] WHILE the palette is open, THE SYSTEM SHALL fuzzy-filter the command list against the query using `fuzzyRank`, ranking contiguous/early matches first, and SHALL show "No matches" when nothing ranks. (_command-palette.tsx:33,99-104; lib/inbox/fuzzy.ts)
- R1.4 [DONE] WHERE a command carries a `hint`, THE SYSTEM SHALL render it right-aligned on the row. (_command-palette.tsx:116-120)
- R1.5 [NEW] WHEN a command has a single-key shortcut, THE SYSTEM SHALL display that key as a discoverable hint on its palette row (a `kbd` glyph), so the palette doubles as the shortcuts cheat-sheet.

## R2 — Context-aware command set (extend `paletteCommands`)

- R2.1 [DONE] WHEN the palette is built, THE SYSTEM SHALL include "Go to <lane>" commands for every built-in lane and every custom lane, and "Go to Bundles" when a bundle exists. (page.tsx:712-737)
- R2.2 [DONE] WHERE 2+ mailboxes are connected, THE SYSTEM SHALL include "Switch to All inboxes" and one "Switch to <mailbox>" command per box. (page.tsx:740-755)
- R2.3 [DONE] WHERE a conversation is selected on the attention or snoozed lane, THE SYSTEM SHALL include "Mark current conversation done" and "Snooze current conversation for 1 day". (page.tsx:756-769)
- R2.4 [DONE] WHEN the palette is built, THE SYSTEM SHALL include one "Open <name> — <subject>" command per loaded conversation, runnable by fuzzy match. (page.tsx:770-777)
- R2.5 [NEW] WHERE a conversation is selected, THE SYSTEM SHALL include a "Reply to current conversation" command that runs the SAME flow as the pane Reply button (open the composer; never send).
- R2.6 [NEW] WHERE a conversation is selected, THE SYSTEM SHALL include a "Book meeting" command that opens the meeting scheduler via the pane handler (`paneApiRef.bookMeeting`).
- R2.7 [NEW] WHERE a conversation is selected AND has an active sequence enrollment, THE SYSTEM SHALL include a "Stop sequence" command that runs the pane handler; IF there is no active sequence, THEN it SHALL report so without erroring.
- R2.8 [NEW] WHERE a conversation is selected, THE SYSTEM SHALL include a "Label current conversation" command that opens the thread add-label input.
- R2.9 [NEW] WHERE the attention lane is active AND intention splits exist, THE SYSTEM SHALL include one "Go to <split>" command per split (including custom per-sender splits).
- R2.10 [NEW] WHERE the user has no connected mailbox of their own, THE SYSTEM SHALL include a "Connect a mailbox" command that routes to `/settings/mail-calendar`.
- R2.11 [DONE] WHEN a command runs, THE SYSTEM SHALL invoke the SAME handler the corresponding button/key invokes and SHALL close the palette — no duplicated triage/reply/book/stop/label logic. (_command-palette.tsx:52-56; run() closures call page handlers / paneApiRef)

## R3 — Single-key shortcuts (extend the keydown listener)

- R3.1 [DONE] WHILE focus is in an INPUT, TEXTAREA, SELECT, or contentEditable element, THE SYSTEM SHALL NOT fire any single-key shortcut. (page.tsx:593-601)
- R3.2 [DONE] WHEN the user presses `j` or `k` outside a text field, THE SYSTEM SHALL move the selection to the next/previous conversation and scroll it into view. (page.tsx:630-640)
- R3.3 [DONE] WHEN the user presses `e` outside a text field on the attention/snoozed lane, THE SYSTEM SHALL mark the selection (whole multi-select set if any, else the focused thread) done. (page.tsx:641-651)
- R3.4 [DONE] WHEN the user presses `x` (Shift for range) outside a text field, THE SYSTEM SHALL toggle the focused conversation in the multi-select set. (page.tsx:652-656)
- R3.5 [DONE] WHEN the user presses `r` outside a text field with a thread selected, THE SYSTEM SHALL open the reply composer for it. (page.tsx:662-666 -> replySignal -> _conversation-pane.tsx:374-377)
- R3.6 [NEW] WHEN the user presses `s` outside a text field with a thread selected on the attention/snoozed lane, THE SYSTEM SHALL snooze it (default tomorrow 09:00) via `handleTriage`, mirroring the pane first snooze option.
- R3.7 [NEW] WHEN the user presses `b` outside a text field with a thread selected, THE SYSTEM SHALL open the meeting scheduler via `paneApiRef.bookMeeting()`.
- R3.8 [NEW] WHEN the user presses `l` outside a text field with a thread selected, THE SYSTEM SHALL open the thread add-label input, focused.
- R3.9 [NEW] IF a single-key shortcut target handle is unavailable (no thread selected, or the pane is unmounted), THEN THE SYSTEM SHALL no-op silently rather than throw.
- R3.10 [NEW] WHEN the `s`/`b`/`l` shortcuts are added, THE SYSTEM SHALL keep `INBOX_SHORTCUTS` (`lib/inbox/inbox-shortcuts.ts`) in lockstep so the global `?` cheatsheet lists them.

## R4 — Discoverability & consistency

- R4.1 [NEW] THE SYSTEM SHALL show each single-key shortcut as the `hint`/`kbd` on its matching palette command (Done=`e`, Snooze=`s`, Reply=`r`, Book=`b`, Label=`l`), so the same surface teaches both the palette and the keys.
- R4.2 [DONE] THE SYSTEM SHALL render the palette in the light Elevay design tokens already used (`--color-bg-card`, `--color-border-default`, `--shadow-panel`, `--color-accent-soft`), with no emoji and no provider name. (_command-palette.tsx:58-127) — G-design gate (F1 section 8).
- R4.3 [NEW] THE SYSTEM SHALL satisfy a design-review acceptance criterion vs the F1 tokens for any new palette row chrome (the `kbd` hint glyph), per gate G-design.

## R5 — Priority shortcut `!` (gap analysis)

- R5.1 [HORS SCOPE] THE SYSTEM SHALL NOT introduce a user-settable "important/priority" flag in B6: `lib/inbox/importance.ts` is a pure derived scorer (INBOX-T04) and there is NO `/api/inbox/importance` mutation route or store. A `!` mark-important shortcut needs a new endpoint + store + schema column — track it separately (e.g. an `inbox-priority-flag` spec), not in this reuse-first palette spec.
- R5.2 [NEW] WHERE a `!`-style affordance is wanted within B6 reuse budget, THE SYSTEM SHALL bind `!` to a non-mutating "Go to high-priority view" by selecting the existing "Needs Reply" intention split (no new storage), OR omit `!` entirely — the design picks one; the default is to OMIT and defer to R5.1.

## Non-goals

- NG1 THE SYSTEM SHALL NOT fork or duplicate the global CRM palette (`components/ui/command-palette.tsx`) into the inbox.
- NG2 THE SYSTEM SHALL NOT add any new npm dependency — the palette, fuzzy ranker, and hotkey registry already exist in-repo.
- NG3 THE SYSTEM SHALL NOT send email, send a sequence step, or mutate priority/importance from any palette command or shortcut (book/reply only open UI; stop is reversible).
- NG4 THE SYSTEM SHALL NOT introduce a second Cmd/Ctrl+K capture path on the inbox (the existing `page.tsx:678-687` listener stands).
- NG5 THE SYSTEM SHALL NOT add a keybinding-customizer UI (that is INBOX-K07, separate).
