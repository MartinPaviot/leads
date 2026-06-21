# B6 `inbox-command-palette` — Design

> Reuse-first. Every anchor below is a real file:line in the worktree
> `app/apps/web` (verified 2026-06-20). No new dependency, no new table, no
> Inngest function, no LLM. This is a UI-extension spec.

## 1. Architecture diff (what is added vs already there)

ALREADY THERE (do not rebuild):
- Inbox command palette component — `inbox/_command-palette.tsx`. Fuzzy filter,
  ArrowUp/Down + Enter + Esc, mouse hover, `hint` column, `fuzzyRank` ranking,
  light tokens. The only surface this spec touches.
- Palette open/close — `page.tsx:107` (`paletteOpen` state) + `page.tsx:678-687`
  (Cmd/Ctrl+K listener) + `page.tsx:1015` (mount).
- Command registry — `paletteCommands` useMemo at `page.tsx:711-779`. Lane jumps,
  custom lanes, mailbox switch, mark-done, snooze-1-day, open-by-name. This is the
  one place new commands get appended.
- Shared handlers (no logic to duplicate): `handleTriage` (`page.tsx:318-351`),
  `ConversationPaneApi.openReply/bookMeeting/stopSequence`
  (`_conversation-pane.tsx:98-105,450-458`) via `paneApiRef` (`page.tsx:414`),
  `setSelectedMailbox`, `setTab`, `setCustomLaneId`, `setActiveSplit`.
- Single-key keydown listener with the typing-guard — `page.tsx:589-671`
  (guard `:593-601`). The one place new single keys get added.
- Cheatsheet feed — `INBOX_SHORTCUTS` (`lib/inbox/inbox-shortcuts.ts`) +
  `registerShortcut` effect (`page.tsx:692-695`).

ADDED by B6 (small, all in existing files):
- 3 new single keys in the keydown listener: `s` snooze, `b` book, `l` label.
- ~6 new palette commands appended to `paletteCommands`: Reply, Book, Stop,
  Label, per-split "Go to <split>", and "Connect a mailbox" (gated).
- Per-command `shortcut?` key on `PaletteCommand`, rendered as a `kbd` glyph next
  to the existing `hint`.
- One new prop bridge for the `l`/Label flow: a `labelSignal` counter prop on
  `ConversationPane` (mirrors the existing `replySignal` pattern at
  `page.tsx:105,1007` and `_conversation-pane.tsx:116-117,373-377`) that opens
  `ThreadLabels` add-input. `ThreadLabels` (`_thread-labels.tsx`) grows an
  optional `openSignal` prop that flips its internal `adding` state + focuses.
- 3 new rows in `INBOX_SHORTCUTS` (s, b, l).

## 2. Data model diff

NONE. No Drizzle CREATE/ALTER. Labels/triage/snooze persistence already exist
(`/api/inbox/labels`, `/api/inbox/triage`). Mark-important (`!`) is deliberately
out of scope (R5.1) precisely because it WOULD need a schema column — that is the
boundary that keeps B6 a UI spec.

## 3. Orchestration (Inngest)

NONE. No background jobs. All actions are synchronous client handlers already in
the page, serialized for triage by the existing `pendingTriage` ref
(`page.tsx:123,340`).

## 4. Integrations

NONE new. Confirmed against the locked stack (CLAUDE.md): no SDK, no provider, no
package.json change. Reuses in-repo `lib/inbox/fuzzy.ts` and `lib/hotkey-registry`.

## 5. Component-level design

### 5.1 `PaletteCommand` type (`_command-palette.tsx:12-18`)
Add one optional field:
```ts
export interface PaletteCommand {
  id: string;
  label: string;
  hint?: string;       // existing: "Lane" / "Action" / "Open"
  shortcut?: string;   // NEW: "e" | "s" | "r" | "b" | "l" — rendered as a kbd glyph
  run: () => void;
}
```
Render the glyph in the row (`_command-palette.tsx:105-122`), to the left of the
existing `hint` span, using `--color-bg-hover` / `--color-text-tertiary` (matches
the global palette `kbd` chrome at `components/ui/command-palette.tsx:314-322`).
Fuzzy ranking is unchanged — it ranks on `label` only (`fuzzy.ts:33`), so the
glyph never pollutes the match.

### 5.2 New commands in `paletteCommands` (`page.tsx:711-779`)
Append after the existing act:done / act:snooze block (`:756-769`), each closing
over live refs/handlers (no new code path):
- `act:reply` — `shortcut:"r"`, guard `selectedKey`, run:
  `setSelectedKey(selectedKey); setReplySignal(n=>n+1)` (same as the `r` key,
  page.tsx:662-666). Present when a thread is selected on any readable lane.
- `act:book` — `shortcut:"b"`, run: `paneApiRef.current?.bookMeeting()`.
- `act:stop` — run: `void paneApiRef.current?.stopSequence()` (reversible; the
  handler already returns ok:false when there is no sequence, surfaced via toast
  in the pane). Listed only when a thread is selected.
- `act:label` — `shortcut:"l"`, run: `setLabelSignal(n=>n+1)`.
- per-split `split:<id>` — from `splitCounts` when `tab==="attention"`:
  `run: () => setActiveSplit(s.id)`, hint "Split".
- `connect:mailbox` — only when `!mailboxConnected`:
  `run: () => router.push("/settings/mail-calendar")`, hint "Setup".
- Backfill `shortcut` on the existing act:done (`"e"`) and act:snooze (`"s"`)
  commands so the palette teaches the keys (R4.1).

### 5.3 New single keys (`page.tsx:589-671`)
Inside the same listener, after the existing branches and behind the same typing
guard (`:593-601`) and the same `(tab==="outbound"||"bundles") && !customLaneId`
early-return (`:628`):
- `s` -> if `selectedKey` and `tab` in {attention,snoozed}:
  `handleTriage(selectedKey,"snooze", tomorrow0900ISO)` (reuse the pane SNOOZE
  option computation, `_conversation-pane.tsx:60-70`).
- `b` -> if `selectedKey`: `paneApiRef.current?.bookMeeting()`.
- `l` -> if `selectedKey`: `setLabelSignal(n=>n+1)`.
Each `e.preventDefault()` only when it acts; otherwise falls through (R3.9 no-op).
Note: `b` must NOT collide with anything; `m` is the only other reserved letter
and it is handled first (`:606-626`).

### 5.4 Label-open bridge (`labelSignal`)
- Page: `const [labelSignal,setLabelSignal]=useState(0)` (mirror `replySignal`,
  page.tsx:105). Pass to `<ConversationPane labelSignal={labelSignal} ... />`
  (page.tsx:1004-1010).
- `ConversationPane`: accept `labelSignal?:number`; an effect
  `useEffect(()=>{ if(labelSignal>0) labelOpenRef.current?.() },[labelSignal])`
  mirroring the reply effect (`_conversation-pane.tsx:373-377`). It calls into
  `ThreadLabels` via a passed `openSignal` prop OR a ref.
- `ThreadLabels` (`_thread-labels.tsx:13`): accept optional `openSignal?:number`;
  effect flips `setAdding(true)` and focuses the input (the input already
  `autoFocus`es when `adding`, `:88-108`). Keeps all label POST logic in place.

## 6. Guardrails (consolidated)

- G1 Single keys never fire while typing — reuse the existing INPUT/TEXTAREA/
  SELECT/contentEditable guard (page.tsx:593-601). New keys sit inside it.
- G2 No logic duplication — every command/key calls an EXISTING handler
  (`handleTriage`, `paneApiRef.*`, `setReplySignal`, `setLabelSignal`, `setTab`,
  `setActiveSplit`, `router.push`). The palette `run()` is a one-liner.
- G3 Graceful degradation — `paneApiRef.current` is null when no thread/pane is
  mounted; every call is `?.`-guarded and no-ops (R3.9).
- G4 No new send path — book/reply only open UI; stop is reversible; no `!`
  mutation (R5.1). NG3 enforced.
- G5 Triage stays serialized — `s`/done go through `handleTriage` and its
  `pendingTriage` ref (page.tsx:123,340); no race with a following lane switch.
- G6 Cheatsheet parity — adding a key REQUIRES adding the matching
  `INBOX_SHORTCUTS` row (lib/inbox/inbox-shortcuts.ts); the existing test asserts
  the listed set matches the handled set.
- G7 Tokens only / no emoji / no provider name on the new `kbd` glyph (G-design,
  F1 section 8); reuse `--color-bg-hover` + `--color-text-tertiary`.
- G8 Single Cmd/Ctrl+K path — do not add a second listener (NG4); the global CRM
  palette stays separate (NG1).

## 7. Decisions

- D1 EXTEND the inbox palette (`_command-palette.tsx` + `paletteCommands`), do NOT
  route inbox verbs through the global CRM palette. Consistent with INBOX-K01,
  which scoped the global palette to CRM records; the inbox palette is the
  thread-aware surface. Completeness 9/10 (full verb set, discoverable, reused).
- D2 `!` defaults to OMITTED (R5.2). Picking the non-mutating "go to Needs Reply
  split" alias is allowed but adds a magic key with low discoverability; the
  honest move is to omit and file `inbox-priority-flag` separately (R5.1). This
  keeps B6 free of any schema/endpoint work.
- D3 Label-open via a `labelSignal` counter (not a new context) — mirrors the
  proven `replySignal` pattern already in the file, lowest-surface-area choice.
