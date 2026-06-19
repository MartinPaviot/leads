# INBOX-K05 — Quick-switch accounts / mailboxes
> Theme: T6 · Autonomy rung: passive · Priority: P1
> Pillar: cross (speed/keyboard-first)

## User story
As a user who runs outreach from several mailboxes, I want to switch which inbox I'm viewing with the
keyboard alone — a quick-switcher and number chords — so I can move between "All inboxes" and a
specific box without reaching for the rail.

## Why (audit anchor)
Superhuman supports multiple accounts (feature-inventory "My Account → Add Accounts (multi-account)")
and makes split/folder switching a keyboard act via "G then X" go-tos down the rail (findings §G).
Switching context is instant and keyboard-driven. We already have the **unified-inbox model** — a
left rail listing the user's connected mailboxes with per-box backlogs and an "All inboxes" entry
(`_mailbox-rail.tsx`), driven by `selectedMailbox` state (`page.tsx:49`) — but it is **mouse-only**:
there is no shortcut to switch boxes. K05 makes the switch keyboard-first.

## Requirements (EARS)
- WHEN the user owns 2+ connected mailboxes, the system SHALL provide a keyboard way to switch the
  focused mailbox: number chords (e.g. `m` then `1..9`, where `0`/`m a` = All inboxes) AND a
  quick-switch entry in the command palette ("Switch mailbox →").
- WHEN a mailbox is switched, the system SHALL update `selectedMailbox`, refetch the current lane
  scoped to that box (`?mailbox=`), and reflect the box in the rail's active state.
- The system SHALL expose each connected mailbox as a command-palette item (with its address + its
  attention backlog) so the user can jump to a box by name via Cmd+K.
- The system SHALL register the mailbox-switch chords in the shortcut registry (K02) so they appear in
  the cheatsheet, scoped to the inbox.
- WHEN the user has only one mailbox, the system SHALL hide the switcher entirely (no rail, no chords)
  — customizable-but-simple: a single-box user needs no chooser.
- The system SHALL keep mailbox switching typing-safe (suppressed inside inputs/composer).
- The system SHALL preserve the selected lane (attention/snoozed/done/handled) across a mailbox switch
  and reset the visible selection to the first row of the newly scoped list.
- The system SHALL respect per-user scope: only the viewer's own connected mailboxes are switchable
  (`lib/inbox/user-scope.ts`).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a user with 3 mailboxes on the inbox WHEN they press `m` then `2` THEN the second mailbox
  becomes active, the lane refetches scoped to it, and the rail highlights it.
- GIVEN the same user WHEN they press `m` then `0` (or `m a`) THEN "All inboxes" becomes active and the
  unified list returns.
- GIVEN the command palette open WHEN the user types "mailbox" or a box's address THEN a "Switch
  mailbox" group lists each box with its backlog count, and Enter switches to it.
- GIVEN a single-mailbox user WHEN on the inbox THEN no rail, no switch commands, and the chords are
  inert (nothing to switch).
- GIVEN focus in the reply composer WHEN the user types "m2" THEN no switch happens (typing-safe).
- GIVEN a mailbox switch WHEN it completes THEN the previously selected lane is unchanged and the first
  row of the new scope is selected.

## Edge cases & failure handling
- Mailbox list changes (a box disconnected) while a chord is pending → switching to a now-missing index
  no-ops gracefully (clamp/skip), no crash.
- More than 9 mailboxes → number chords cover 1..9; the palette switcher covers the rest by name.
- Switch lane fetch fails → toast "Couldn't load the inbox" (existing pattern, `page.tsx:100`); keep
  the prior scope.
- Rapid successive switches → the in-flight lane fetch is superseded; only the latest scope renders
  (await/abort, consistent with existing load logic).
- Cross-tenant: a mailbox id not owned by the user is never in the list, so never switchable.
- Snoozed/Done counts are unified vs per-box — keep the existing semantics; switching only filters the
  list, not the global counts the tabs show.

## Best-in-class bar
- We switch between **real per-mailbox backlogs with their own attention counts** (the rail already
  computes them, `_mailbox-rail.tsx:23`), so the switcher shows *where the work is*, not just a list of
  accounts — more useful than a bare account picker.
- One **command-palette + chord** path means mailbox switching uses the same muscle memory as every
  other jump (K01/K06), and shows up in the cheatsheet (K02) — discoverable, not hidden.
- It stays invisible for single-box users (the majority), honoring customizable-but-simple instead of
  adding chrome everyone pays for.

## Design sketch
- **Data:** none new; `mailboxes: MailboxSummary[]` + `selectedMailbox` already in inbox state
  (`page.tsx:48-49`, type in `_types.ts:4-10`).
- **API:** reuse `GET /api/inbox/conversations?mailbox=…` (already supported, `page.tsx:83`). No new
  endpoint.
- **UI:** keep `_mailbox-rail.tsx` as the visual switcher; add keyboard handling in `page.tsx`
  (an `m`-prefixed chord, mirroring the `g`-chord pattern in `use-keyboard-shortcuts.ts:60-85`), and a
  "Switch mailbox" command group in `command-palette.tsx` populated from the inbox's mailbox list.
  Tokens unchanged (rail already uses `--color-accent-soft`, `inset 2px 0 0 var(--color-accent)` for
  active). Icons: `Inbox` (All), `Mail` (a box) — already used in the rail. Shortcut: **`m` then
  1-9 / 0 / a**; also Cmd+K → "Switch mailbox". Light + dark via tokens, no emoji, no provider name,
  no vendor mailbox branding (we show the user's own address/label).
- **AI:** none.
- **Security:** switch only among the user's own connected mailboxes (scope already enforced).
- **Failure/perf:** reuse the existing lane-fetch path (await prior, supersede on rapid switch).

## Tasks (ordered, each with verify + test)
1. Add the `m`-chord handler to the inbox keyboard effect (`page.tsx:182`), mapping `1-9`→mailbox
   index, `0`/`a`→All; typing-safe; only active with 2+ boxes. Register in the shortcut registry
   (K02). (verify: `m 2` switches; single-box inert) (test: chord maps index→`selectedMailbox`)
2. Refetch the lane scoped to the new box and reset selection to the first row. (verify: list reflects
   the box; lane preserved) (test: switch triggers scoped GET, selection resets)
3. Add a "Switch mailbox" command group to `command-palette.tsx`, sourced from the inbox mailbox list,
   each item showing address + backlog. (verify: palette lists boxes; Enter switches) (test: command
   group present with 2+ boxes, switches on run)
4. Hide all switching affordances for single-mailbox users. (verify: one box → no rail/commands/chords)
   (test: 1 box → no switch commands)

## Current-state notes (VERIFY before building — code moves)
- Unified-inbox model EXISTS: `selectedMailbox` + `mailboxes` state (`page.tsx:48-49`), rail rendered
  only when `mailboxes.length >= 2` (`page.tsx:273-279`), per-box attention in
  `app/(dashboard)/inbox/_mailbox-rail.tsx:23`, `?mailbox=` filter already sent (`page.tsx:83`).
- `MailboxSummary` type: `{ id, address, label, attention }` (`_types.ts:4-10`).
- Rail switching is **mouse-only** today (`onSelect` from rail clicks) — no keyboard path, no
  command-palette entry. K05 adds both.
- The `g`-chord implementation to mirror lives in `hooks/use-keyboard-shortcuts.ts:60-85` (press `g`,
  then a second key within 1 s). The command palette to extend is
  `components/ui/command-palette.tsx` (groups built in `buildItems()`).
- Note: "accounts" here means the user's own connected **mailboxes**, not CRM accounts — Elevay has no
  multi-tenant account switcher; do not introduce one (Pilae anti-creep).
