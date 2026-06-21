# B6 `inbox-command-palette` — Tasks

> Total estimate: ~2.0 dev-days (4.0 half-days). 8 tasks. All extend existing
> files; no new dependency, table, route, or Inngest fn.
> Branch: `feat/inbox-command-palette`. Run tests from `app/apps/web` (`pnpm test`).
>
> Status mix: 6 [NEW], 2 [DONE-verify]. The palette, fuzzy ranker, Cmd/Ctrl+K
> toggle, and the e/r/j/k/x keys already exist — those tasks only verify + cover.

---

## B6.1 [DONE-verify] Confirm the existing palette + keys as the baseline — 0.5 half-day
- Action: Write a baseline test locking the SHIPPED behaviour so the extension
  cannot regress it: palette opens on Cmd/Ctrl+K, fuzzy-filters, ArrowDown+Enter
  runs a command, Esc closes; e/r/j/k/x are ignored while a text input is focused.
- Verify: `pnpm test` green; the test fails if the typing-guard (page.tsx:593-601)
  or the toggle (page.tsx:678-687) is removed.
- Test: `_command-palette.test.tsx` (render `CommandPalette` with stub commands) +
  reuse/extend the keydown coverage; assert guard skips on INPUT focus.
- Refs: R1.1, R1.2, R1.3, R3.1, R3.2, R3.3, R3.4, R3.5

## B6.2 [NEW] Add `shortcut` to `PaletteCommand` + render the kbd glyph — 0.5 half-day
- Action: Add optional `shortcut?: string` to `PaletteCommand`
  (`_command-palette.tsx:12-18`); render it as a `kbd` glyph left of `hint`
  (`:105-122`) using `--color-bg-hover` / `--color-text-tertiary`.
- Verify: a command passed `shortcut:"e"` shows an `e` glyph; ranking unchanged
  (still matches on `label` only).
- Test: `_command-palette.test.tsx` — row renders the kbd when `shortcut` set,
  omits it otherwise; `fuzzyRank` order unaffected by the glyph.
- Refs: R1.5, R4.1, R4.3

## B6.3 [NEW] Label-open bridge: `labelSignal` -> ThreadLabels add-input — 0.5 half-day
- Action: Add `labelSignal` state to the page (mirror `replySignal`, page.tsx:105),
  pass to `ConversationPane` (`:1004-1010`); add `labelSignal?` + an effect to
  `ConversationPane` mirroring the reply effect (`_conversation-pane.tsx:373-377`);
  add `openSignal?` to `ThreadLabels` (`_thread-labels.tsx:13`) that flips
  `adding` true + focuses the input.
- Verify: bumping `labelSignal` opens the focused label input on the open thread;
  no thread open -> no-op.
- Test: `thread-labels.test.tsx` — `openSignal` increment shows the input focused;
  label POST logic untouched.
- Refs: R2.8, R3.8, R3.9

## B6.4 [NEW] Single keys s / b / l in the keydown listener — 0.5 half-day
- Action: In `page.tsx:589-671`, behind the existing typing-guard and the
  outbound/bundles early-return, add: `s` -> snooze selected (tomorrow 09:00 via
  `handleTriage`) on attention/snoozed; `b` -> `paneApiRef.current?.bookMeeting()`;
  `l` -> `setLabelSignal(n=>n+1)`. `preventDefault` only when it acts.
- Verify: with a thread selected, `s` snoozes it, `b` opens the scheduler, `l`
  opens the label input; each is inert while typing and inert with no selection.
- Test: keydown unit test — dispatch `s`/`b`/`l` with a fake selection asserts the
  right handler is called; dispatch with focus in an INPUT asserts none fire.
- Refs: R3.6, R3.7, R3.8, R3.9, R3.1

## B6.5 [NEW] New palette commands: reply / book / stop / label — 0.5 half-day
- Action: Append to `paletteCommands` (`page.tsx:756-779`): `act:reply`
  (shortcut r, run = select + `setReplySignal`), `act:book` (shortcut b, run =
  `paneApiRef.current?.bookMeeting()`), `act:stop` (run = `stopSequence()`),
  `act:label` (shortcut l, run = `setLabelSignal`). Backfill `shortcut:"e"` /
  `"s"` on existing act:done / act:snooze.
- Verify: with a thread selected the four commands appear and run the SAME flow as
  the keys/buttons; absent with no selection.
- Test: build `paletteCommands` with a stub selection; assert ids present/absent by
  selection and that `run()` calls the stubbed handler (no second code path).
- Refs: R2.5, R2.6, R2.7, R2.8, R2.11, R4.1

## B6.6 [NEW] Palette commands: per-split jump + connect-mailbox — 0.25 half-day
- Action: Append `split:<id>` commands from `splitCounts` when `tab==="attention"`
  (run = `setActiveSplit(id)`, hint "Split"); append `connect:mailbox`
  (run = `router.push("/settings/mail-calendar")`, hint "Setup") only when
  `!mailboxConnected`.
- Verify: split commands appear on the attention lane with splits present and
  switch the `?split=` view; the connect command appears only when no mailbox is
  connected and routes to settings.
- Test: `paletteCommands` builder test — split commands gated to attention + splits;
  connect command gated to `!mailboxConnected`.
- Refs: R2.9, R2.10

## B6.7 [NEW] Cheatsheet parity: add s / b / l to INBOX_SHORTCUTS — 0.25 half-day
- Action: Add three rows to `INBOX_SHORTCUTS` (`lib/inbox/inbox-shortcuts.ts`):
  s = "Snooze selected", b = "Book a meeting", l = "Label conversation", in the
  Inbox group.
- Verify: the global `?` cheatsheet lists s/b/l under Inbox while the inbox is
  mounted.
- Test: the existing INBOX_SHORTCUTS lockstep test — extend its expected set so the
  listed keys match the keys the page handler implements (now incl. s/b/l).
- Refs: R3.10

## B6.8 [NEW] G-design review of the kbd glyph + full keyboard pass — 0.5 half-day
- Action: Run `/design-review` on the palette with the new kbd hints against F1
  tokens (light + the design-system bar); manually drive the full keyboard loop
  (Cmd/Ctrl+K -> type -> Arrow -> Enter for each new verb; then s/b/l/r/e on a
  thread) and screenshot before/after per the harness evidence rule.
- Verify: glyph uses only F1 tokens, no emoji, no provider name; every new verb
  runs its existing handler; no Cmd/Ctrl+K double-trigger; recorded with a
  before/after screenshot pair.
- Test: snapshot of the palette row chrome tokens (kbd background/colour) +
  manual design-review note appended to the spec dir.
- Refs: R4.2, R4.3 (gate G-design, F1 section 8)

---

## Out of this spec (tracked elsewhere)
- `!` mark-important / priority flag — needs a new endpoint + store + schema column
  (R5.1). File as `inbox-priority-flag`; do NOT smuggle it into B6.
- Keybinding customizer UI — INBOX-K07 (NG5).
- Global CRM palette inbox-awareness — INBOX-K01 (already shipped; NG1).
