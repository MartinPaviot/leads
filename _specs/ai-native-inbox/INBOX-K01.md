# INBOX-K01 — Command palette (Cmd+K / Ctrl+K) — Elevay-light "Superhuman Command"
> Theme: T6 · Autonomy rung: passive · Priority: P0
> Pillar: cross (speed/keyboard-first)

## User story
As a power user, I want one keyboard-summoned command surface (Cmd+K / Ctrl+K) that lets me jump
anywhere, run any action, and triage the open conversation without touching the mouse, so the
inbox feels instant and keyboard-first.

## Why (audit anchor)
Superhuman's universal command palette ("Ctrl+K = Superhuman Command", findings §G) is the spine of
its speed: every action — compose, snooze, New Split Inbox, search — is one keystroke away
(findings §B, §E). The teardown ruled this **P0, not nice-to-have**. We already ship a command
palette (`command-palette.tsx`), but it is CRM-only (Accounts/Contacts/Deals) and **inbox-blind**:
no Done/Snooze/Reply/Compose, no lane jumps, no thread search. K01 makes it the one surface for the
inbox too. Critical DNA note: Superhuman renders this **dark monospace**; we render the SAME speed
in Elevay **light** — card `--color-bg-card`, `--shadow-dialog`, Inter, blue accent — which the
existing palette already does correctly (no redesign, only capability).

## Requirements (EARS)
- WHEN the user presses Cmd+K or Ctrl+K anywhere in the dashboard, the system SHALL toggle the
  command palette open/closed, even while focus is in a non-text element.
- WHEN the palette opens, the system SHALL focus the search input and show context-relevant default
  groups: "On this conversation" (only when the inbox has a selected thread), "Navigate to",
  "Actions".
- WHEN a conversation is selected in the inbox, the system SHALL offer its triage verbs as commands
  — Mark done, Snooze…, Reply, Book meeting, Stop sequence (mirroring the pane's actions) — each
  executing the same handler the pane button would.
- WHEN the user types, the system SHALL filter static commands AND query records via the existing
  `/api/search/quick` debounced search, grouping results by type.
- The system SHALL support full keyboard operation: ArrowUp/Down to move, Enter to run the selected
  command, Escape to close — with the selected row scrolled into view.
- WHEN a command is a navigation target, the system SHALL route in-app (`router.push`); WHEN it is an
  action, the system SHALL invoke its handler and close the palette.
- The system SHALL be summonable from non-keyboard affordances via the existing
  `window.dispatchEvent(new CustomEvent("elevay:command-palette"))` contract (sidebar search button).
- The system SHALL NOT fire Cmd+K capture inside a different already-open modal/composer that owns the
  key (no double-trigger), and SHALL respect per-user/tenant scope on every searched record.

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN any dashboard page WHEN the user presses Cmd+K THEN the light palette opens with the input
  focused and ESC hint visible.
- GIVEN the inbox with a thread selected WHEN the palette opens THEN an "On this conversation" group
  lists Mark done / Snooze / Reply / Book meeting, and running "Mark done" archives that thread
  exactly as pressing `e` would (optimistic, advances selection).
- GIVEN the palette open WHEN the user types "acme" THEN matching accounts/contacts/opportunities
  appear grouped, sourced from `/api/search/quick`, within ~200 ms of typing.
- GIVEN the palette open WHEN the user presses ArrowDown twice then Enter THEN the third visible row
  runs (navigates or acts) and the palette closes.
- GIVEN the palette open WHEN the user presses Escape THEN it closes and focus returns to the page.
- GIVEN no thread is selected (e.g. on /accounts) WHEN the palette opens THEN the "On this
  conversation" group is absent (no dead commands).
- GIVEN a teammate's record outside the viewer's tenant WHEN searched THEN it never appears.

## Edge cases & failure handling
- Search request fails/aborts → static commands still render; no error toast inside the palette
  (silent, as today at `command-palette.tsx:199`).
- Cmd+K pressed while the email composer is open and focused → composer keeps the keystroke if it
  binds it; otherwise palette opens over it (document-level listener, lowest priority).
- Inbox triage command issued while a triage POST is in flight → reuse the inbox `pendingTriage`
  guard (`page.tsx:62`) so the action queues, never races the write.
- Action command on a stale selection (thread already archived) → handler no-ops gracefully, toast
  "Conversation no longer available".
- Empty query → defaults only; never an empty "No results" flash.
- Offline → navigation still works (client routes); record search degrades to static commands.

## Best-in-class bar
- Superhuman's command bar acts on the focused mailbox only; ours acts on the **CRM graph too** —
  the same Cmd+K jumps to a deal or a contact, not just an email, because the palette already
  searches records (`command-palette.tsx:147-164`). One surface for inbox + pipeline.
- We render the speed in **light Elevay DNA** with cited record rows (company logos via
  `CompanyLogo`), where Superhuman is a dark generic launcher.
- Inbox verbs run the **identical optimistic handlers** as the pane, so palette-driven triage is as
  instant and consistent as mouse/`e` — no second code path.

## Design sketch
- **Data:** none new. Inbox commands read the current selection from inbox state; record results come
  from `/api/search/quick` (already tenant-scoped).
- **API:** reuse `GET /api/search/quick` (`command-palette.tsx:192`). Triage commands hit the existing
  `POST /api/inbox/triage`; reply/book reuse the pane's handlers (no new endpoints).
- **UI:** extend `app/apps/web/src/components/ui/command-palette.tsx` (the mounted instance in
  `app/(dashboard)/layout.tsx:116`). Surface = centered card, `--color-bg-card`, border
  `--color-border-default`, `--shadow-dialog`, overlay `--color-bg-modal-overlay`, Inter, accent
  `--color-accent`; lucide icons per command (CheckCircle2 done, AlarmClock snooze, Mail reply,
  CalendarPlus book, OctagonX stop, plus existing nav icons). Shortcut: **Cmd+K / Ctrl+K** (toggle),
  `/` also opens it via `use-keyboard-shortcuts.ts:94`. Light + dark via tokens, no emoji, no provider
  name, record rows cited ("via Elevay" through CompanyLogo, not a vendor).
- **AI:** none in K01 (pure launcher). A future "Ask AI" command can route to the chat dock; out of
  scope here.
- **Security:** every searched record already tenant-scoped server-side; inbox commands operate only
  on the user's own scoped selection (`lib/inbox/user-scope.ts`).
- **Failure/perf:** debounced 200 ms search with AbortController (existing); static commands instant.

## Tasks (ordered, each with verify + test)
1. Lift the inbox selection + triage/reply/book handlers into a context (or a lightweight
   `window`-event bridge) the palette can read, so it can offer "On this conversation" only when a
   thread is selected. (verify: palette shows the group on /inbox with a selection, hides it
   elsewhere) (test: `command-palette.test.tsx` — group present/absent by selection)
2. Add the inbox command group to `buildItems()` in `command-palette.tsx` with the five verbs +
   lucide icons. (verify: each verb runs the same handler as the pane) (test: clicking "Mark done"
   calls the triage handler with action `done`)
3. Wire triage commands through the inbox `pendingTriage` guard. (verify: command + rapid lane switch
   never shows an empty lane) (test: race test around `handleTriage`)
4. Confirm the light tokens + ESC/↑↓/↵ footer already meet UI DNA; add the new icons. (verify: visual
   diff in light + dark) (test: snapshot of palette chrome tokens)

## Current-state notes (VERIFY before building — code moves)
- `app/apps/web/src/components/ui/command-palette.tsx` — full working palette: Cmd/Ctrl+K toggle
  (`:212`), debounced `/api/search/quick` (`:185-204`), NAV_ITEMS/ACTION_ITEMS (`:59-82`),
  `elevay:command-palette` external-open event (`:263-269`), light tokens (`:282-289`). **No inbox
  commands today** — nav goes to `/inbox` but there is no Done/Snooze/Reply/Compose.
- Mounted once at `app/(dashboard)/layout.tsx:116`.
- Inbox triage handler `handleTriage` + `pendingTriage` ref live in
  `app/(dashboard)/inbox/page.tsx:62,146`; pane verbs (Reply/Book/Stop/Done/Snooze) in
  `_conversation-pane.tsx:291-353`. Reuse these — do not fork.
- `use-keyboard-shortcuts.ts:94` maps `/` to open the palette by dispatching a synthetic Ctrl+K
  (works because our own palette listens for real Ctrl+K, unlike Superhuman which rejects synthetic
  keys).
