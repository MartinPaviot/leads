# INBOX-K02 — Full keyboard shortcut map + cheatsheet
> Theme: T6 · Autonomy rung: passive · Priority: P0
> Pillar: cross (speed/keyboard-first)

## User story
As a keyboard-first user, I want every common inbox and app action bound to a discoverable shortcut,
plus a `?` cheatsheet that lists exactly what is live on this screen, so I never have to hunt or
guess.

## Why (audit anchor)
Superhuman teaches and exposes shortcuts as a core feature — a persistent command bar
("E Done · H Remind · C Compose · / Search · Ctrl+K Command"), "G then X" go-to chords down the rail
(G·i Inbox, G·S, G·D…), and a Shortcuts page under Learn (findings §G, feature-inventory "Learn →
Shortcuts"). Everything is keyboard-reachable. We already have the **machinery** — a hotkey hook with
a self-describing registry (`use-hotkey.ts`) and a `<ShortcutHelp />` overlay bound to `?`
(`shortcut-help.tsx`) — but the overlay **is not mounted** in the dashboard layout, and most actions
aren't registered, so today `?` shows nothing. K02 completes the map and ships the cheatsheet.

## Requirements (EARS)
- The system SHALL mount a single `<ShortcutHelp />` overlay in the dashboard so `Shift+?` opens a
  live cheatsheet listing every registered shortcut, grouped by category.
- The system SHALL register, with human-readable descriptions and groups, all global shortcuts:
  Cmd+K (command palette), `/` (search), `n` (create), `?` (help), and the `g`-chords (g a/c/d/s/t/h).
- The system SHALL register all inbox shortcuts when the inbox is mounted: `j`/`k` (next/prev),
  `e` (done), `r` (reply), plus the K06 additions (`#` done-from-any-typing-safe, `h` remind/snooze,
  `c` compose) and the lane `g`-chords (g i Inbox, g e/Done, etc. per K06).
- WHEN focus is in an input/textarea/select/contenteditable, the system SHALL suppress single-key
  shortcuts (registry hook already enforces this; the inbox handler mirrors it).
- The cheatsheet SHALL render combos in platform-correct glyphs (⌘/Ctrl, ⇧, ↑↓…) via `prettyCombo`.
- The cheatsheet SHALL reflect the **current screen** — only shortcuts actually mounted appear (the
  registry is live, per-page), so it never lists a binding that does nothing here.
- The system SHALL expose a static "Shortcuts" reference under Settings (or `/settings/shortcuts`)
  that lists the full catalog for discovery away from the overlay.
- WHEN a user has customized a binding (INBOX-K07), the cheatsheet SHALL show the custom combo, not
  the default.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN any dashboard page WHEN the user presses `?` (Shift+/) THEN the cheatsheet opens listing the
  global shortcuts grouped (Navigation, Actions, Help), each with a kbd glyph.
- GIVEN the inbox WHEN the user opens the cheatsheet THEN it additionally lists the inbox group
  (j/k/e/r/#/h/c and lane go-tos), because those hooks are mounted there.
- GIVEN focus inside the reply composer WHEN the user types "e" THEN no "done" fires and no shortcut
  triggers (typing-safe).
- GIVEN the cheatsheet open WHEN the user presses `?` again or Escape THEN it closes.
- GIVEN a Mac WHEN the cheatsheet renders Cmd+K THEN it shows "⌘K"; GIVEN Windows THEN "Ctrl+K".
- GIVEN a user who remapped `e`→`x` (K07) WHEN the cheatsheet renders THEN "Mark done" shows "X".

## Edge cases & failure handling
- Registry empty (no hooks mounted on a bare page) → overlay shows "No shortcuts registered on this
  page" (already handled, `shortcut-help.tsx:80`), never a blank modal.
- Duplicate combo registered by two components → registry is keyed by combo (`hotkey-registry.ts:24`),
  last writer wins; flag in dev so we don't ship a silent collision.
- A shortcut that conflicts with a browser default (e.g. Cmd+K in some browsers) → we `preventDefault`
  on match (`use-hotkey.ts:55`); document any irreducible OS conflict in the catalog.
- Overlay opened over the command palette → both are token-styled modals; `?` is typing-safe so it
  can't open while the palette input is focused.
- Reduced-motion users → overlay uses no essential animation.

## Best-in-class bar
- Our cheatsheet is **live and screen-accurate** — it enumerates exactly the hooks mounted now (the
  registry updates as components mount/unmount), so it can never lie about a binding, unlike a static
  printed shortcut list.
- It is **the single source of truth**: the same `registerShortcut` call that wires a key also
  documents it, so a shortcut and its help can't drift apart.
- Customized bindings (K07) flow through automatically, so the help always matches the user's actual
  keymap — Superhuman's printed list is fixed.

## Design sketch
- **Data:** the in-memory registry (`lib/hotkey-registry.ts`); K07 reads custom combos from
  `user_preferences` (resource `keyboard`).
- **API:** none for the overlay; the Settings reference page is static + (for K07) reads
  `/api/user-preferences?resource=keyboard`.
- **UI:** mount `<ShortcutHelp />` (`app/apps/web/src/components/ui/shortcut-help.tsx`) once in
  `app/(dashboard)/layout.tsx` (next to `<CommandPalette />`). Surface = centered card,
  `--color-bg-card`, `--shadow-dialog`, overlay `--color-bg-modal-overlay`, Inter; group headers
  `text-[10px] uppercase tracking-wider` `--color-text-muted`; kbd chips `--color-bg-hover` +
  `--color-border-default`, mono font. Icon: `X` (close) only; no per-row icons (rank = none here).
  Shortcut: **Shift+?** to toggle. Light + dark via tokens, no emoji, no provider name. A persistent
  bottom hint bar ("⌘K commands · ? shortcuts") is OPTIONAL and, if added, uses the same tokens; not
  required for K02.
- **AI:** none.
- **Security:** none (UI only).
- **Failure/perf:** registry is O(n) tiny; overlay renders only when open.

## Tasks (ordered, each with verify + test)
1. Mount `<ShortcutHelp />` in `app/(dashboard)/layout.tsx`. (verify: `?` opens the overlay on any
   dashboard page) (test: render test that `?` toggles the dialog)
2. Add `description`+`group` registration to the global shortcuts. Today `use-keyboard-shortcuts.ts`
   binds keys via a raw `keydown` handler with NO registry entries — either migrate those bindings to
   `useHotkey(...)` (preferred: one source of truth) or register them explicitly. (verify: cheatsheet
   lists Cmd+K, /, n, ?, and the g-chords) (test: registry contains the global combos after mount)
3. Register the inbox shortcuts (j/k/e/r and the K06 additions) with descriptions/group "Inbox" when
   the inbox mounts. The inbox currently uses a raw `keydown` listener (`page.tsx:182-222`) with no
   registry entries — register them so they appear in the cheatsheet. (verify: on /inbox the Inbox
   group appears) (test: inbox mount adds the Inbox group)
4. Add the static `/settings/shortcuts` reference page enumerating the full catalog. (verify: page
   lists every documented shortcut) (test: page render lists the catalog)
5. Make `prettyCombo` honor K07 custom combos when present. (verify: remapped key shows in help)
   (test: custom keymap → custom glyph in cheatsheet)

## Current-state notes (VERIFY before building — code moves)
- `app/apps/web/src/components/ui/shortcut-help.tsx` EXISTS, bound to `Shift+?`
  (`:25`), reads the live registry (`:19-23`), renders grouped kbd chips with `prettyCombo`
  (`:124`). **It is NOT mounted in `app/(dashboard)/layout.tsx`** (only `<CommandPalette />`,
  `<KeyboardShortcutsProvider />`, `<NavigationProgress />`, `<ChatDock />`, `<IdleLogout />` are) —
  so `?` does nothing today. This is the core gap K02 closes.
- `app/apps/web/src/hooks/use-hotkey.ts` auto-registers each binding when given a `description`
  (`:48-50`); `lib/hotkey-registry.ts` is the live store; `__tests__/hotkey-registry.test.ts` and
  `__tests__/use-hotkey.test.ts` exist.
- `app/apps/web/src/hooks/use-keyboard-shortcuts.ts` binds Cmd+K/`/`/`n`/`g`-chords via a RAW keydown
  listener with **no `useHotkey` and no registry entries** (`:48-113`) — these won't show in the
  cheatsheet until migrated/registered (task 2).
- Inbox `j/k/e/r` likewise raw in `app/(dashboard)/inbox/page.tsx:182-222` — not registered (task 3).
