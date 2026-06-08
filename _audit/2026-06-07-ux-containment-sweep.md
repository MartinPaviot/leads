# UX containment sweep — 2026-06-07

Systematic sweep for the issue classes behind Martin's recent complaints —
modals that "ressortent" / need scrolling, and pages that "ne finissent ni à
droite ni à gauche" (inset bars floating over full-bleed content). Method:
exhaustive code audit (grep + read) across every component and all 66 dashboard
pages, plus two parallel read-only audit agents.

> **Limitation (honest):** a *rendered* page-by-page visual pass was NOT possible
> this session. The dashboard requires auth; the Playwright session died on a
> dev-server restart; the app login needs Martin's own password (the stored
> credentials are for external services only); email verification is broken so I
> couldn't self-provision; and the dev server is unstable in this sandbox. Every
> finding below is from code. Purely-visual issues (spacing nuance, specific
> data-populated screens, responsive edge cases) still need a rendered pass —
> see "Still open".

## Fixed this session (this sweep)
- **live-extraction.tsx** — rendered literal emoji `👥 💰 📋 🔧` as field icons →
  replaced with lucide (`Users` / `Banknote` / `Wrench` / `Swords`). Direct
  no-emoji-rule violation. The only real rendered emoji in the app.
- **tam-build-progress.tsx + accounts/page.tsx** — `TamBuildProgress` was a
  `rounded-lg border` inset card (wrapped in `px-4 pt-3`) floating above the
  flush filter bar + full-bleed table → made it a **flush full-width strip with
  a bottom border** (same fix as the Call Mode funnel) and dropped the inset
  wrapper. Only used on Accounts.
- **contacts/page.tsx** — the import-result banner was an inset `mx-5 rounded-md`
  card between two flush bars → **flush full-width colored strip**.

(Earlier this session, same theme: shared `Modal` containment primitive + its 8
consumers; campaign-wizard backdrop-blur removed; smart-import, create-skill,
close-reason, confirm/destructive, settings/plays, contacts-create dialogs
capped; Call Mode funnel flushed.)

## Checked — compliant, no change needed (with reason)
- **GPU compositing** (`backdrop-blur` / `backdrop-filter` / `blur()` /
  `radial-gradient`): none in app code — only comments noting prior removal. Clean.
- **Slide-over drawers** (`slide-over.tsx`, `email-composer.tsx`,
  `email-composer-panel.tsx`, home `selectedAction`): all
  `fixed right-0 top-0 h-full flex-col` with `flex-1 overflow-auto` bodies and
  pinned footers — bounded, scroll internally. (Agent flagged these; verified
  false positive.)
- **Live onboarding** (v2: `OnboardingV2Wrapper → OnboardingConfirmationCard`):
  full-screen `fixed inset-0 overflowY:auto` overlay with `mx-auto max-w-2xl`
  content — scrollable, bounded. Not a containment bug.
- **Accounts table**: `<table>` inside `flex-1 overflow-auto` — wide column sets
  scroll *inside* the table region; the page itself never overflows. Standard
  data-table behaviour.
- **Settings pages**: all use the shared `SettingsHeader` (consistent).
- **command-palette / shortcut-help**: top-anchored, `max-h` capped. Compliant.
- **Emoji elsewhere**: only in test fixtures (intentional inputs), the chat
  system prompt (which *enforces* the no-emoji rule), and code comments.

## Dead code (left as-is — not on the live path)
- `onboarding-wizard.tsx` (v1), `onboarding-7phase/wizard.tsx` + `/onboarding-v3`,
  `onboarding-chat.tsx` (v3). Gated behind a non-default `onboardingVersion`; the
  live path is v2. Not worth fixing dead modals.

## Still open — needs a rendered visual pass (could not do this session)
The structural/containment dimension is now substantially clean. The remaining
"plein d'éléments" almost certainly live in the *visual* layer, which a code
audit cannot see:
- Spacing / padding consistency across the 66 pages (some use `p-4`, `p-5`, `p-6`,
  `px-4 py-6` for their content area — no single convention).
- Empty-state quality (e.g. Call Mode's center/right show small centered
  placeholder text in large empty columns — reads sparse when the queue is empty).
- Control alignment, text truncation/overflow, responsive behaviour at narrow
  widths (e.g. the Call Mode connected-state header packs 4 controls — verify it
  doesn't crowd below ~1100px).
- Any data-populated layout issues only visible with real rows.

**To unblock the visual pass:** I need a way into the running app — the dev
login password (dev account), or a live session, or a dev auth bypass. Then I
can drive Playwright through every page and screenshot-audit each one.
