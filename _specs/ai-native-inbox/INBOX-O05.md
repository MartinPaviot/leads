# INBOX-O05 — Customizable layout / themes / density
> Theme: T12 · Autonomy rung: passive · Priority: P2
> Pillar: cross (comfort / readability)

## User story
As a user, I want a few simple, high-impact display choices for the inbox — light ("Clear Mode")
or dark theme, and row density (compact / default / comfortable) — that persist across sessions,
so the inbox is comfortable to read all day without a wall of settings.

## Why (audit anchor)
Superhuman exposes **Theme** under My Account and a handful of layout toggles (Split Inbox, Show
Sender Full Names, Hide Empty Split Inboxes) (`teardown-superhuman/feature-inventory.md` "My
Account → Theme"; "Advanced → Show Sender Full Names"). It's a *light* customization surface, not
a theming engine — which matches our **"customizable but very simple: fewest controls, strong
defaults"** doctrine. We already have the pieces: a `.dark`-class theme system (`ThemeProvider`,
light-first "Clear Mode" default) and a density control persisted via `user_preferences`
(`DisplayPanel`, density compact/default/comfortable). O05 just brings theme + density to the
inbox as two clean controls — no new design system.

## Requirements (EARS)
- The system SHALL offer a **theme** choice (Light "Clear Mode" / Dark) that applies the existing
  `.dark` class on `<html>` so all token-driven surfaces swap automatically.
- The system SHALL offer an inbox **density** choice (compact / default / comfortable) that adjusts
  row height / padding in the conversation list and reading pane.
- The system SHALL **persist both choices per-user** so they survive reload and follow the user
  across devices (not only `localStorage`).
- The theme + density SHALL read entirely from the existing CSS tokens — no hardcoded hex — so
  dark mode "just works" on every inbox surface (list rows, reading pane, badges, sidebars).
- The system SHALL keep the control set minimal: theme + density only (plus an optional "Show
  sender full names" toggle if cheap); no font picker, no color customizer, no layout builder.
- WHEN the user changes a setting, the system SHALL apply it immediately (optimistic) and save in
  the background, reverting on save failure with a quiet notice.
- The system SHALL default to Light "Clear Mode" + default density for new users (the documented
  defaults), and SHALL respect an existing stored choice on load.
- The density + theme SHALL be scoped per-user; one teammate's choice never changes another's view.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN the inbox WHEN the user switches to Dark THEN every inbox surface (list, pane, badges,
  sidebars) re-renders from dark tokens with no light-on-light or hardcoded-color artifacts.
- GIVEN density set to Compact WHEN the list renders THEN rows are visibly tighter (smaller row
  height / padding) than default, and Comfortable is looser.
- GIVEN a theme/density choice WHEN the user reloads or signs in on another device THEN the same
  choice is applied (persisted per-user, not just `localStorage`).
- GIVEN a save failure WHEN the user toggles a setting THEN the UI keeps the optimistic change
  visible briefly then reverts with a small "couldn't save" note, never silently desyncs.
- GIVEN a brand-new user WHEN they open the inbox THEN it is Light "Clear Mode" at default density.
- GIVEN user A on Dark WHEN user B loads the inbox THEN B sees their own theme, not A's.

## Edge cases & failure handling
- `localStorage` theme (today's `ls-theme`) vs. the new per-user store disagree → on load, the
  per-user store is authoritative; reconcile `localStorage` to it (avoid a flash of the wrong
  theme by reading the per-user value early / keeping the `localStorage` fast-path in sync).
- First paint flash of unstyled/wrong theme (FOUC) → keep the existing early `localStorage`
  read for the initial class, then reconcile with the server value (no hard regression of the
  current no-flash behavior).
- Density applied to virtualized long lists (INBOX-R11) → density feeds the row-height constant so
  virtualization math stays correct.
- Email *body* dark rendering is a separate concern (INBOX-R08) — O05 themes the app chrome; it
  must not invert a white email background into something unreadable (defer body to R08).
- Reduced-motion → theme/density changes apply without transition animation if the user prefers.
- Multi-tenant/per-user: both settings are per-user via `user_preferences`.

## Best-in-class bar
- We ship **two controls that matter** (theme + density), persisted **per-user across devices**,
  reusing the density primitive we already persist — Superhuman's theme is account-local; ours
  follows the person. "Customizable but very simple" made literal.
- Because every inbox surface already reads from **tokens**, dark mode is *complete* (no half-dark
  panes), and density reuses the proven `DisplayPanel` model rather than a bespoke inbox-only knob.

## Design sketch
- **Data:** theme + density = `user_preferences` (`db/schema/auth.ts`, resource `inbox`): keys
  `theme` (`"light"|"dark"`) and `density` (reuse `DisplayDensity = "compact"|"default"|
  "comfortable"` from `components/ui/display-panel.tsx`). No migration. Theme application = the
  existing `.dark` class (`globals.css` `@custom-variant dark`).
- **API:** reuse `GET/PUT /api/user-preferences` (resource `inbox`). Theme also continues to drive
  the `<html>` class via `ThemeProvider`; extend `ThemeProvider` to hydrate from (and persist to)
  the per-user store, keeping `localStorage` as the no-flash fast path.
- **UI:** a small "Display" control set — either a section in `/settings/mail-calendar` (or
  `/settings/inbox`) AND/OR a `DisplayPanel`-style popover in the inbox header. Theme = a segmented
  Light/Dark control; density = the exact segmented control already in `DisplayPanel`
  (compact/default/comfortable, tokens `--color-bg-hover` active). Density feeds the list/pane row
  constants (`--table-row` ≈ 44px baseline; compact/comfortable adjust it). lucide: `Sun` / `Moon`
  (theme), `Rows3` (density). Shortcut: none required (optional Cmd+K "Toggle theme" command via
  K01). Light + dark via tokens, no emoji, no provider name.
- **AI:** none.
- **Security/perf:** per-user scope; optimistic apply + background save; no-FOUC preserved; density
  integrates with virtualization (R11).

## Tasks (ordered, each with a verify step + test to write)
1. Extend `ThemeProvider` to hydrate from + persist to `user_preferences:inbox.theme` while keeping
   the `localStorage` no-flash fast path. (verify: theme follows the user across a fresh session)
   (test: `theme-provider.test.tsx` — server value wins, localStorage stays in sync)
2. Inbox density: read `user_preferences:inbox.density`, feed the list + pane row-height/padding
   constants. (verify: compact rows tighter than default) (test: density → row constant mapping)
3. Display control UI (segmented theme + density), optimistic apply + background save + revert on
   failure. (verify: toggle persists; save-fail reverts) (test: render + PUT shape + revert)
4. Token audit of inbox surfaces in dark (list, pane, badges, sidebars) — no hardcoded hex.
   (verify: browser — dark inbox has no light-on-light artifacts) (test: lint/grep no raw hex in
   inbox components)
5. Density ↔ virtualization (R11) row-height consistency. (verify: long list scrolls correctly at
   each density) (test: virtualization row-height test)

## Current-state notes (VERIFY before building — code moves)
- `components/ui/theme-provider.tsx` EXISTS: light default ("Clear Mode"), dark via the `.dark`
  class on `<html>`, currently persisted in **`localStorage` (`ls-theme`) only** (`:19-33`) — O05
  adds per-user persistence on top, keeping the early read for no-flash.
- `globals.css` drives dark via `@custom-variant dark (&:where(.dark, .dark *))` (`:11`) and a full
  `.dark` token block (`:175+`); the design contract is light-first + dark-via-`.dark`
  (`_UI-DNA.md`). Every inbox surface must read tokens (mostly already does).
- `components/ui/display-panel.tsx` already defines `DisplayDensity` (compact/default/comfortable)
  and the segmented density control, persisted "via `/api/user-preferences` separately" (`:24`) —
  reuse this exact model for inbox density (do not invent a new density scale).
- `user_preferences` + `/api/user-preferences` exist (`db/schema/auth.ts`,
  `app/api/user-preferences/route.ts`) — resource `inbox`, no migration.
- Layout constants (`--sidebar-width` 240, header 44, `--table-row` 44, detail-panel 400) are in
  `_UI-DNA.md`/`globals.css`; density nudges the row constant. Email-body dark = INBOX-R08
  (separate); long-list density = INBOX-R11.
