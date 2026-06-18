# INBOX-N05 — Mobile parity (responsive inbox + Quick-Reply-from-notification)
> Theme: T10 · Autonomy rung: helper · Priority: P2
> Pillar: P1 fidelity / P4 triage

## User story
As a founder away from my desk, I want the inbox to work on my phone — readable threads, the
context sidebar reachable, triage tappable — and I want to fire a quick reply straight from a
notification without opening the full app, so I can keep deals moving on the go.

## Why (audit anchor)
Superhuman ships **Quick Reply from mobile notifications** as a headline capability and treats
mobile as first-class (`findings.md` §F "Latest Updates → Quick Reply from mobile notifications";
their Ask AI answers always include a "Mobile" section, `findings.md` §E). The bar to beat:
respond from the lock screen. Our gap is structural — the inbox page (`app/(dashboard)/inbox/
page.tsx`) carries **no responsive breakpoints at all** (list + reading pane + sidebar assume a
wide viewport), so on a phone it's unusable. N05 makes the inbox responsive and adds a
quick-reply path from the notification, grounded — like everything else — in the prospect's real
context with a cited draft (INBOX-C02/G08).

## Requirements (EARS)
- The system SHALL render the inbox usably from a phone viewport (≈360px) up to desktop: the
  list, reading pane, and GTM context sidebar SHALL adapt (stack / drawer / overlay) rather than
  overflow or clip.
- WHEN the viewport is narrow, the system SHALL show ONE primary surface at a time (list → tap →
  thread → back), with the context sidebar (INBOX-G01) reachable via a toggle/drawer, not a fixed
  400px column.
- The system SHALL keep core triage reachable by touch on mobile: open, mark done/archive, snooze,
  reply — with tap targets ≥ 44px (the layout-constant row height) and no hover-only affordances.
- The system SHALL render the smart notification (INBOX-N01) and SLA-breach alert (INBOX-N04) on
  mobile with a **Quick Reply** affordance that opens a minimal composer (or, where a platform
  supports inline notification actions, an inline reply field) without loading the full inbox.
- The Quick Reply composer SHALL offer the one-tap suggested replies (INBOX-C02) and, for known
  prospects, a context-grounded draft (INBOX-G08) — each cited — so a mobile reply is as grounded
  as a desktop one, never a blind text box.
- The system SHALL send a Quick Reply through the SAME outbound path as the desktop composer
  (per-user mailbox, sequence-reply linking), with the same approval/guardrails — no mobile-only
  bypass of send rules.
- The system SHALL preserve per-user/tenant scope on every mobile surface and notification action
  (the owner's mailbox only).
- The system SHALL keep the existing reading fidelity on mobile: sanitized HTML body (INBOX-R01),
  collapsed quotes (INBOX-R05), images gated (INBOX-R02/R07) — the body must not overflow the
  small viewport (responsive max-width container, INBOX-R01 already mandates this).

## Acceptance criteria (GIVEN/WHEN/THEN)
- GIVEN a 375px viewport WHEN the inbox loads THEN the conversation list fills the screen, no
  horizontal scroll, and tapping a row opens the thread full-screen with a back affordance.
- GIVEN the thread open on mobile WHEN the user taps the context toggle THEN the GTM sidebar
  (contact/company/deal, cited) slides in as a drawer/overlay and can be dismissed.
- GIVEN the thread open on mobile WHEN the user taps snooze/done/reply THEN each action works by
  touch with a ≥44px target; no action requires hover.
- GIVEN a smart notification on mobile WHEN the user taps Quick Reply THEN a minimal composer opens
  with suggested replies + (for a known prospect) a cited grounded draft, without loading the full
  inbox.
- GIVEN a Quick Reply is sent WHEN it dispatches THEN it goes out via the user's own mailbox, links
  to the sequence reply if applicable, and respects the same send guardrails as desktop.
- GIVEN an HTML email with a wide table WHEN viewed on mobile THEN the body fits the viewport
  (scoped responsive container), no app-chrome overflow.
- GIVEN a tablet/desktop viewport WHEN the inbox loads THEN the existing two/three-pane layout is
  unchanged (parity is additive, not a regression).
- GIVEN two tenants WHEN either uses mobile/Quick Reply THEN no cross-tenant data or send occurs.

## Edge cases & failure handling
- Very long subject / sender name on a narrow row → truncate with ellipsis, never wrap-break the row
  height or push actions off-screen.
- No mailbox connected → the existing "Connect your mailbox" empty state renders responsively
  (not clipped) and routes to settings.
- Quick Reply for an unknown sender → suggested replies still offered; the grounded-draft path
  degrades gracefully ("no CRM context") rather than fabricating, consistent with INBOX-G08.
- Notification action on a platform without inline-reply support → tapping opens the minimal
  in-app composer instead (progressive enhancement), never a dead action.
- Slow network on mobile → optimistic triage (the existing remove-from-lane optimism) + a clear
  pending/failed state on Quick Reply send; never a silent drop.
- Landscape / split-screen / dynamic font scaling → layout reflows from breakpoints + relative units,
  not fixed pixels, so large accessibility fonts don't clip controls.
- Drawer/overlay open + back gesture → back closes the drawer first, then the thread (predictable nav).
- Multi-account on mobile → the mailbox switcher (INBOX-K05) remains reachable in the narrow layout.

## Best-in-class bar
- Quick Reply from a notification is **grounded**: it surfaces our suggested replies + a
  context-grounded, cited draft (INBOX-C02/G08) — Superhuman's mobile quick reply is a plain text
  field; ours brings the deal context to the lock screen.
- Parity is achieved by making the **existing** inbox responsive (one surface at a time + a drawer
  sidebar) and routing Quick Reply through the **existing** send path — no separate mobile app, no
  duplicated logic, no mobile-only send bypass.

## Design sketch
- **Data:** none new — reuses the conversations read model, the context bundle (INBOX-G01), and the
  outbound send path. Notification rows already carry `entityType`/`entityId` (deep-link target).
- **API:** none new for layout. Quick Reply posts to the existing inbox send/reply endpoint (the
  same one the desktop composer uses), preserving sequence-reply linking + guardrails. The grounded
  draft reuses INBOX-G08's endpoint; suggested replies reuse INBOX-C02.
- **UI:** make `app/(dashboard)/inbox/page.tsx` responsive with Tailwind breakpoints (`sm:`/`md:`/
  `lg:`) over the current fixed widths — narrow = single-pane list↔thread with a back control; the
  400px sidebar (`_conversation-pane.tsx` / INBOX-G01) becomes a `md:`-fixed column but a slide-in
  drawer below `md` (token `--color-bg-card`, `--shadow-floating`). Triage controls get touch-sized
  hit areas (≥44px, the table-row constant) and lose hover-only reveals. A Quick Reply surface =
  a compact bottom-sheet composer (`--color-bg-card`, rounded-lg) with suggested-reply chips +
  "Use draft" (lucide `Reply`, `CornerUpLeft`, `Sparkles`). Light+dark via tokens, no emoji, no
  provider name, draft cited. (Web push / inline notification actions are a platform follow-up; the
  in-app deep-link + minimal composer is the baseline that works everywhere.)
- **AI:** none new — suggested replies (C02) + grounded draft (G08), each cited, cached per their
  specs; zero-retention option (T11).
- **Security/perf:** every surface + send is owner+tenant scoped; Quick Reply uses the guarded send
  path (no bypass); responsive containers prevent overflow; optimistic triage keeps the existing
  fail-soft path.

## Tasks (ordered, each with a verify step + test to write)
1. Audit + add responsive breakpoints to `inbox/page.tsx`: single-pane list↔thread below `md`,
   back control, no horizontal scroll at 360–414px. (verify: browser at 375px — usable, no
   overflow) (test: render at narrow width / snapshot)
2. Make the GTM context sidebar a `md:`-column / below-`md` drawer toggle (compose with INBOX-G01).
   (verify: drawer opens/dismisses on mobile, fixed column on desktop) (test: render both widths)
3. Touch-size triage controls (≥44px, drop hover-only). (verify: snooze/done/reply tappable on
   mobile) (test: a11y/target-size assertion)
4. Mobile reading fidelity: confirm INBOX-R01 body container is responsive (no overflow on wide
   tables/images). (verify: browser — HTML email fits 375px) (test: render)
5. Quick Reply bottom-sheet composer (suggested replies C02 + grounded draft G08, cited), wired to
   the existing send path. (verify: send goes via user's mailbox + links sequence reply) (test:
   send integration — scope + guardrails honoured)
6. Quick Reply entry from a notification deep-link (in-app baseline; inline notification actions
   noted as a platform follow-up). (verify: tapping a notification opens Quick Reply without the
   full inbox) (test: nav integration)
7. Regression: desktop two/three-pane layout unchanged. (verify: browser desktop parity) (test:
   render desktop)

## Current-state notes (VERIFY before building — code moves)
- The inbox page has NO responsive breakpoints today — a grep for `sm:`/`md:`/`lg:`/`hidden`/
  `max-w-`/`useMediaQuery` in `app/(dashboard)/inbox/page.tsx` returns nothing (VERIFY). Layout
  constants assume desktop: sidebar 240px, detail-panel 400px (`_UI-DNA.md`).
- Inbox surfaces to make responsive: `page.tsx` (lanes + list + pane), `_conversation-list.tsx`
  (rows: snippet `:99`, reason badge `:113`), `_conversation-pane.tsx` (reading pane; body `:471`,
  snooze popover `:316-341`, handleSent `:186`). Empty state "Connect your mailbox" must reflow.
- Reading fidelity deps (must hold on mobile): INBOX-R01 (sanitized HTML, responsive max-width
  container), R02/R07 (image gating), R05 (quote collapse).
- Quick Reply composition deps: INBOX-C02 (one-tap suggested replies), INBOX-G08 (context-grounded
  cited draft), INBOX-G01 (context sidebar). Mailbox switcher: INBOX-K05.
- Send path: the existing inbox composer's send/reply route (per-user mailbox; sequence-reply
  linking lives in capture/`detectSequenceReply`). Notification deep-link target: `notifications.
  entityType`/`entityId` (`db/schema/outbound.ts:411-412`); bell `components/notification-bell.tsx`.
- No mobile-specific layout, drawer, or Quick Reply surface exists today.
