# INBOX-K07 — Customizable shortcuts
> Theme: T6 · Autonomy rung: passive · Priority: P2
> Pillar: cross (speed/keyboard-first)

## User story
As a user with my own muscle memory, I want to remap a few inbox/app shortcuts to keys I prefer (and
reset to defaults), persisted to my account, so the keyboard layout fits how I already work — without
a sprawling settings panel.

## Why (audit anchor)
Superhuman ships a fixed, heavily-taught shortcut set (feature-inventory "Learn → Shortcuts";
Advanced → "Backtick as Escape", "Send + Mark Done", "RSVP + Mark Done" toggles show even Superhuman
exposes a little binding customization). Power users want their own keys. We already have the right
substrate: a hotkey hook + registry that defines combos centrally (`use-hotkey.ts`, `hotkey-registry.ts`)
and a per-user, per-resource preferences store with an upsert API (`user_preferences` table +
`/api/user-preferences`). K07 lets the user override a small allowlist of bindings, persisted per user,
honoring "customizable-but-simple" — strong defaults, optional refinement, the fewest controls.

## Requirements (EARS)
- The system SHALL let the user remap a curated allowlist of actions (e.g. done, snooze/remind, reply,
  compose, next, previous, command palette) to a chosen key/combo — not arbitrary internals.
- The system SHALL persist each override per user via `PUT /api/user-preferences` with
  `resource: "keyboard"` and load them via `GET /api/user-preferences?resource=keyboard`.
- WHEN overrides exist, the system SHALL resolve each action's active combo as override → default, and
  bind that combo at mount.
- The system SHALL reject conflicting remaps: a combo already bound to another action SHALL be flagged
  and not saved until resolved (no silent shadowing).
- The system SHALL provide a "Reset to defaults" that clears the user's keyboard overrides.
- The cheatsheet (K02) and the command palette hints SHALL display the user's ACTIVE combo (override if
  present), so help always matches reality.
- The system SHALL keep all remapped keys typing-safe (suppressed in inputs) exactly as defaults are.
- The system SHALL validate combos against the parser (`parseCombo`) and refuse unparseable or
  reserved combos (e.g. plain Escape, browser-critical keys).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the shortcuts settings WHEN the user remaps "Mark done" from `e` to `x` and saves THEN on the
  inbox pressing `x` marks done and `e` no longer does.
- GIVEN a saved override WHEN the user reloads or signs in elsewhere THEN the override still applies
  (persisted per user).
- GIVEN the user tries to map "Reply" to `e` while `e` is "Mark done" WHEN saving THEN a conflict is
  shown and the save is blocked until they change one.
- GIVEN overrides set WHEN the user opens the `?` cheatsheet THEN "Mark done" shows "X", not "E".
- GIVEN the user clicks "Reset to defaults" THEN all keyboard overrides clear and defaults resume.
- GIVEN an unparseable/reserved combo WHEN entered THEN it is rejected with a clear message, nothing
  saved.
- GIVEN another tenant's user WHEN they load preferences THEN they only get their own (scoped by
  `authCtx.userId`).

## Edge cases & failure handling
- Override references an action that no longer exists (renamed) → ignored on load, pruned on next save;
  defaults used.
- Two overrides collide due to a stale save → load-time resolver detects the collision and falls back
  the later one to default, surfacing a one-time notice.
- Preferences API fails on load → fall back to defaults silently (the app still works); on save failure
  → toast and keep the prior keymap.
- A remap to a combo the OS/browser intercepts (e.g. Ctrl+W) → warn that the browser may capture it;
  allow only with acknowledgment, or disallow for a small reserved set.
- Mobile/no-keyboard → settings still render but note shortcuts apply on desktop.
- Empty overrides object → identical to defaults (no special-casing).

## Best-in-class bar
- We get customization **for free from existing infra** — the same `user_preferences` upsert that
  remembers column layouts now remembers keymaps; no new table, no migration — and the same registry
  that defines a shortcut renders its help, so customization, binding, and documentation stay in sync.
- Customization is **deliberately small** (a curated allowlist), honoring customizable-but-simple:
  strong defaults out of the box, a short list of remappable verbs, and one-click reset — not a
  120-row keymap editor.
- Conflict detection prevents the classic remap footgun (silently shadowing an existing binding), which
  most apps ignore.

## Design sketch
- **Data:** `user_preferences` (`db/schema/auth.ts:141-164`) — one row `resource: "keyboard"`,
  `key: "overrides"`, `value: { actionId: combo }` JSONB; unique on (userId, resource, key) makes the
  upsert safe. No migration (table + index exist in prod).
- **API:** reuse `GET`/`PUT /api/user-preferences` (`app/api/user-preferences/route.ts`); already
  user-scoped via `getAuthContext` (`:27,57`). No new endpoint.
- **UI:** a small "Keyboard shortcuts" panel under Settings (`/settings/shortcuts`, shared with K02's
  reference): list the remappable actions, each with its current combo as an editable kbd capture +
  "Reset to defaults". Surface = card `--color-bg-card`, border `--color-border-default`, Inter; kbd
  chips `--color-bg-hover`; conflict notice in `--color-warning-soft`. Reuse `Button`. Icon: `Keyboard`
  (lucide) for the section header only. Light + dark via tokens, no emoji, no provider name. A central
  `lib/shortcuts/keymap.ts` defines the allowlist + defaults + `resolveCombo(actionId, overrides)`
  consumed by `useHotkey` callers and the inbox handler.
- **AI:** none.
- **Security:** per-user scope enforced by the preferences API; overrides never cross users/tenants.
- **Failure/perf:** load once on app mount, cache in a provider; defaults if the fetch fails.

## Tasks (ordered, each with verify + test)
1. `lib/shortcuts/keymap.ts`: the remappable action allowlist, defaults, `resolveCombo`, and a conflict
   detector. (verify: resolver returns override→default; detector flags dup combos) (test:
   `keymap.test.ts` — resolution + conflict detection + reserved-combo rejection)
2. A keymap provider that loads `GET /api/user-preferences?resource=keyboard` once and exposes
   `resolveCombo`. (verify: overrides load on mount; defaults on failure) (test: provider falls back to
   defaults on API error)
3. Make `useHotkey` callers and the inbox keydown handler resolve combos through the keymap (so a remap
   actually rebinds). (verify: remapped `e`→`x` triages on the inbox) (test: handler fires on the
   resolved combo)
4. Settings panel: list actions, capture a new combo, conflict-check, save via `PUT`, "Reset to
   defaults". (verify: save persists; reset clears; conflict blocks) (test: save/reset/conflict flows)
5. Cheatsheet (K02) + palette hints read active combos via `resolveCombo`. (verify: `?` shows custom
   combo) (test: help reflects override)

## Current-state notes (VERIFY before building — code moves)
- `user_preferences` table EXISTS with `(userId, resource, key, value jsonb)` and a unique index on
  `(user_id, resource, key)` (`app/apps/web/src/db/schema/auth.ts:141-164`) — already used for column
  visibility/order/density. Reuse `resource: "keyboard"`; **no migration needed**.
- `GET`/`PUT /api/user-preferences` (`app/apps/web/src/app/api/user-preferences/route.ts`) is
  user-scoped (`getAuthContext`, `:27,57`) and upserts safely (`:67-94`).
- The hotkey system is centralized and self-describing: `hooks/use-hotkey.ts` (`parseCombo` exported,
  `:76`; auto-register, `:48-50`) + `lib/hotkey-registry.ts` + `components/ui/shortcut-help.tsx`
  (`prettyCombo`, `:124`). **But** the global + inbox bindings currently use RAW keydown handlers
  (`hooks/use-keyboard-shortcuts.ts`, `app/(dashboard)/inbox/page.tsx:182`) with hardcoded keys — these
  must route through `resolveCombo` for remaps to take effect (task 3); migrating them to `useHotkey`
  (K02 task 2/3) makes this clean.
- No customization UI or keymap allowlist exists yet; `savedViews` (`auth.ts:110-135`) is a sibling
  per-user store but is for filter/column views, not shortcuts — do not overload it.
