# INBOX-O04 — Interactive keyboard tutorial / onboarding
> Theme: T12 · Autonomy rung: passive · Priority: P1
> Pillar: cross (speed/keyboard-first adoption)

## User story
As a new user, I want a short, do-it-yourself tutorial that teaches the core inbox shortcuts by
having me actually press them on safe demo mail — one key at a time — so the keyboard flow
(open, archive/done, reply, snooze, command palette) becomes muscle memory in a few minutes
without risking my real inbox.

## Why (audit anchor)
Superhuman's onboarding is a **3-minute keyboard tutorial on a practice inbox**: full-width
coach-mark cards blur the inbox and teach one shortcut at a time (E = Mark Done, Enter = open,
H = Remind Me), and it teaches **by doing** — "press E three times" on demo data, building muscle
memory (`teardown-superhuman/findings.md` §A). That onboarding is a named pattern to steal
(`findings.md` §"Patterns to STEAL" → INBOX-O04). We already have the **machinery**: a live
hotkey registry + a `?` cheatsheet (`use-hotkey.ts`, `shortcut-help.tsx`) and the inbox
shortcuts themselves (INBOX-K02/K06) — but no guided, do-it-yourself coach-mark flow. O04 adds the
practice-by-pressing tutorial on demo mail.

## Requirements (EARS)
- The system SHALL offer an interactive tutorial that teaches the core inbox shortcuts on a
  **safe demo dataset**, never on the user's real mail.
- The tutorial SHALL teach **one shortcut at a time** with a coach-mark card explaining the key
  and SHALL advance only when the user actually performs that key's action (do-it-yourself).
- The tutorial SHALL cover, in order, the keyboard spine: open (`Enter`/`o`), next/prev (`j`/`k`),
  mark done (`e`), reply (`r`), snooze/remind (`h`), and the command palette (Cmd/Ctrl+K).
- The tutorial SHALL be skippable at any step and resumable, and SHALL record completion per-user
  so it does not reappear after it is finished or skipped.
- WHEN the user completes the tutorial, the system SHALL point them to the live `?` cheatsheet
  (INBOX-K02) for the full map, so the tutorial is an on-ramp, not the only reference.
- The tutorial SHALL be reachable on demand later (Settings → a "Replay tutorial" / a "Learn"
  entry), not only at first run.
- The tutorial SHALL respect reduced-motion (no essential animation) and be fully keyboard-
  operable (it is, after all, a keyboard tutorial) — no step requires the mouse.
- The tutorial SHALL be per-user (completion state in `user_preferences`, resource `inbox`, key
  `tutorial`), so each teammate learns on their own account.
- The tutorial's shortcut prompts SHALL reflect any **customized bindings** (INBOX-K07): if the
  user remapped `e`→`x`, the coach-mark teaches `x`.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a first-run user WHEN they open the inbox THEN a tutorial offer appears; accepting loads a
  demo dataset (not real mail) and the first coach-mark ("Press Enter to open").
- GIVEN the "Press E to mark done" step WHEN the user presses E on the demo message THEN the
  message archives from the demo list and the tutorial advances to the next step.
- GIVEN any step WHEN the user clicks Skip THEN the tutorial closes and does not reappear on the
  next inbox load.
- GIVEN a partially-completed tutorial WHEN the user returns THEN it resumes at the next unlearned
  step (or offers to restart).
- GIVEN the final step completed WHEN the tutorial ends THEN it surfaces "Press ? anytime for all
  shortcuts" and marks the tutorial complete for this user.
- GIVEN a user who remapped `e`→`x` (K07) WHEN the done step runs THEN the coach-mark says press
  "X", and pressing X advances it.
- GIVEN reduced-motion preference WHEN the tutorial runs THEN no blur/slide animation is required
  to proceed.
- GIVEN user A completed the tutorial WHEN user B logs in THEN B still sees the offer (per-user).

## Edge cases & failure handling
- User triggers the real shortcut on real mail mid-tutorial → the tutorial operates on an isolated
  demo dataset/route, so real mail is never mutated by a tutorial step.
- User never presses the taught key (gets stuck) → after a short idle, the coach-mark shows a
  hint and a "show me / skip step" affordance; it never hard-blocks the app.
- Focus in an input (e.g. demo composer) → single-key prompts are typing-safe (mirror the registry
  hook's suppression), so the tutorial never fires "done" while typing.
- Tiny viewport / mobile → the coach-mark degrades to a simple stacked card; if keyboard isn't
  available (touch), the tutorial offers a tap-equivalent or defers (keyboard tutorial is desktop-
  first; don't trap a phone user).
- Completion write fails → fail open (tutorial may reappear) rather than blocking the inbox; retry
  on next save.
- Multi-tenant/per-user: demo data is ephemeral/local and identical for everyone; completion is
  per-user.

## Best-in-class bar
- Like Superhuman, we teach **by doing on a practice inbox** (muscle memory), not a passive video
  — but our coach-marks render in **Elevay's light DNA** (soft cards, Inter, blue accent), not a
  dark monospace overlay.
- Our tutorial is **wired to the live registry**: it teaches exactly the bindings that are mounted
  (and the user's *custom* bindings via K07), so it can never teach a key that doesn't work here —
  Superhuman's tutorial is fixed to defaults.
- It hands off to the **screen-accurate `?` cheatsheet** (K02), so learning continues after the
  3-minute on-ramp instead of dead-ending.

## Design sketch
- **Data:** completion/progress = `user_preferences` (resource `inbox`, key `tutorial`):
  `{ completed: boolean, step: number, skippedAt? }`. Demo dataset = a static, local fixture
  (a handful of `ConversationMessage`-shaped demo rows) — never persisted, never from real mail.
- **API:** reuse `GET/PUT /api/user-preferences` (resource `inbox`) for progress — no migration.
  No server demo data (client fixture). The tutorial reads the live hotkey registry
  (`lib/hotkey-registry.ts`) + K07 custom combos (`/api/user-preferences?resource=keyboard`) to
  label keys correctly.
- **UI:** a new `_inbox-tutorial.tsx` mounted by `app/(dashboard)/inbox/page.tsx`, plus a reusable
  coach-mark primitive (none exists today — build a small `CoachMark` in `components/ui/`). Surface
  = a card overlay, `--color-bg-card`, `--shadow-dialog`, overlay `--color-bg-modal-overlay`,
  Inter; the taught key shown as a kbd chip (`--color-bg-hover` + `--color-border-default`, mono,
  reuse the cheatsheet's `prettyCombo`); step copy `text-[13px]`, group label `text-[10px]
  uppercase tracking-wider` `--color-text-muted`; Skip/Next as `Button` ghost/solid. lucide:
  `GraduationCap` (offer), `ArrowRight` (advance), `X` (skip). Shortcut: the tutorial *is* the
  shortcuts; a later "Replay tutorial" lives under Settings (next to the K02 `/settings/shortcuts`
  reference). Light + dark via tokens, no emoji, no provider name.
- **AI:** none.
- **Security/perf:** demo data is ephemeral + local (no real-mail mutation); progress per-user;
  reduced-motion honored; lazy-mount the overlay only when the tutorial is active.

## Tasks (ordered, each with a verify step + test to write)
1. A reusable `CoachMark` overlay primitive (card + kbd chip + Skip/Next, reduced-motion safe).
   (verify: renders a step with a kbd chip) (test: `coach-mark.test.tsx` — renders + Skip closes)
2. Static local demo dataset (a few `ConversationMessage`-shaped rows) the tutorial drives.
   (verify: tutorial list shows demo rows, real inbox untouched) (test: fixture shape)
3. `_inbox-tutorial.tsx` step machine: open→j/k→e→r→h→Cmd+K, advancing on the real action; reads
   the live registry + K07 combos for labels. (verify: pressing the taught key advances) (test:
   step advance on action; custom-keymap label)
4. Persist completion/skip/resume via `user_preferences:inbox.tutorial`; offer on first run only.
   (verify: complete → no reappear; B still sees offer) (test: completion gating + per-user)
5. Hand-off to the `?` cheatsheet on completion + a Settings "Replay tutorial" entry. (verify:
   browser — finish tutorial, `?` shows full map; replay works) (test: hand-off + replay)

## Current-state notes (VERIFY before building — code moves)
- The hotkey machinery EXISTS: `app/apps/web/src/hooks/use-hotkey.ts` auto-registers bindings with
  a `description`; `lib/hotkey-registry.ts` is the live store; `components/ui/shortcut-help.tsx`
  renders the `?` cheatsheet via `prettyCombo` (per INBOX-K02). The inbox shortcuts themselves are
  defined by K02/K06 (today raw `keydown` in `inbox/page.tsx:182-222`). O04 *teaches* those keys.
- **No coach-mark / tutorial / tour primitive exists** (grep `coach|tutorial|tour|walkthrough|
  spotlight` across `app/apps/web/src` → only unrelated call-mode/meeting hits). Build the small
  `CoachMark` primitive here.
- `user_preferences` + `/api/user-preferences` exist for per-user progress (`db/schema/auth.ts`,
  resource `inbox`) — no migration.
- The dashboard layout mounts `<CommandPalette />`, `<ChatDock />`, `<KeyboardShortcutsProvider />`,
  `<NavigationProgress />`, `<IdleLogout />` (per K02 notes); the inbox tutorial mounts inside
  `inbox/page.tsx`, not the global layout, so it only runs in the inbox.
- K07 (customizable shortcuts) reads custom combos from `user_preferences` (resource `keyboard`)
  per K02 — the tutorial must label keys from there when present.
- This pairs with the broader product onboarding (the existing `app/api/onboarding/*` website/ICP
  flow + "step 5 Mail & Calendar"); O04 is specifically the *inbox keyboard* on-ramp, distinct from
  the GTM onboarding.
