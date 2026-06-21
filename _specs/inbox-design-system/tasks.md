# F1 — inbox-design-system · Tasks

**Total estimate: ~4.5 dev-days (9 half-days).** 9 tasks. Branch: feat/inbox-design-system.
Run all commands from app/ (or app/apps/web) per CLAUDE.md. No DB migration (presentation-only).

Order is dependency-correct: tokens → contract test → row → chip → pane → button/composer audit → docs reconcile → design-review pass → gate publish.

---

## B1 [NEW] — Add the inbox token block to globals.css · 0.5 half-day · R1.2, R1.3, R1.6

Action: add the INBOX DENSITY group inside the @theme block in app/apps/web/src/app/globals.css (after the LAYOUT group, ~line 30): --inbox-row-height 56px, --inbox-row-height-compact 44px, --inbox-sidebar-width 240px, --inbox-list-width 360px, --inbox-cta-radius 10px. Add no color/gradient/shadow token.

Verify: pnpm -C app/apps/web build succeeds; grep the five new vars in globals.css; confirm getComputedStyle(document.documentElement).getPropertyValue("--inbox-row-height") returns 56px in the running app.

Test: globals.tokens.test.ts — read globals.css, assert the five --inbox-* vars exist with the exact values and that no NEW --color-* / --gradient-* / --shadow-* var was added by this diff.

---

## B2 [NEW] — Token-contract test (machine half of the G-design gate) · 1 half-day · R1.1, R7.2

Action: add inbox/__tests__/tokens.contract.test.ts. It globs every .tsx under app/apps/web/src/app/(dashboard)/inbox/, strips comments + lucide imports, and fails on any raw color literal (#rrggbb, rgb(, rgba(, hsl( with literal numbers) used as a color value — allowlisting var(--...) and the SenderAvatar HSL helper (which is data-derived, not a token-replaceable color).

Verify: pnpm -C app/apps/web test tokens.contract passes on a clean tree; manually inject a #ff0000 into a throwaway inbox tsx and confirm the test goes red, then revert.

Test: this task IS the test; assert it red-flags an injected literal and green-passes the real tree.

---

## B3 [NEW] — Extract InboxRow · 1 half-day · R2.1-R2.11

Action: create inbox/_inbox-row.tsx with the InboxRow contract (design §7). Move the row markup out of _conversation-list.tsx:103-206 into it; bump the type scale to the bar: sender 14px/700, subject 14px/600, snippet 13px/text-secondary, timestamp 12px/text-tertiary; row min-height var(--inbox-row-height); padding px-3.5. Keep the existing selection rail (R2.6), hover-checkbox (R2.8), avatar (R2.11), prefetch-on-hover. Add the up-to-3 hover quick-action affordances (R2.9) wired to the onQuickAction prop (Done/Snooze pass-through to existing handlers).

Verify: inbox renders unchanged in behavior; row measures 56px and sender computes to 700 weight / 14px in DevTools; hovering reveals checkbox + quick actions; selecting shows the accent rail; j/k still navigates. Screenshot 001-row-default, 002-row-hover, 003-row-selected at 1440.

Test: _inbox-row.test.tsx (happy-dom + Testing Library) — renders a sample item; asserts sender text node has the bold class/weight, snippet truncates, timestamp present, checkbox hidden at rest and shown on a simulated hover/selection, quick-action buttons carry aria-label.

---

## B4 [NEW] — Extract LaneChip + CountBadge · 0.5 half-day · R3.1-R3.5

Action: create inbox/_lane-chip.tsx (LaneChip + CountBadge per design §7). Replace the three near-duplicate inline tab blocks in page.tsx:765-811 (built-in TABS, customLanes, bundles) with LaneChip; render the count via CountBadge (R3.3) instead of (n) parens. Custom Splits use the identical chip (R3.5). Honor hideWhenEmpty (R3.4).

Verify: the lane bar looks consistent across built-in / custom / bundles; active chip is accent-soft/accent, inactive tertiary; counts render as pills; an empty hideWhenEmpty lane shows no chip. Screenshot 004-lanebar.

Test: _lane-chip.test.tsx — active vs inactive styling branch; CountBadge renders the number; LaneChip fires onClick.

---

## B5 [NEW] — Unify the reading-pane card family · 0.5 half-day · R5.2, R5.3

Action: in _conversation-pane.tsx, ensure every insight/intelligence block (prepared reply :704, signals :722, action items :648, next-action :592, key details, handled note) and every message card (:769) shares the same radius (rounded-lg / 8px) and 1px var(--color-border-default) border via one local card token/class. No behavior change; pure consolidation of the inline styles already present.

Verify: visually the pane reads as one card family at 1440; no card has a stray radius or border color. Screenshot 005-pane-cards. pnpm -C app/apps/web tsc clean.

Test: extend _inbox-row.test or add _pane-cards.test.tsx asserting the shared card class is applied to a rendered message + a rendered insight block.

---

## B6 [NEW] — Button / composer single-style audit · 0.5 half-day · R4.1-R4.5, R6.1-R6.3

Action: sweep the inbox tree for any hand-rolled styled button or pill; route them through the shared Button (solid/outline/ghost) and Badge. Confirm exactly one gradient CTA path (the empty-state Connect mailbox, page.tsx:861 already actionVariant gradient). Confirm the composer is the shared EmailComposerPanel with a solid Send (R6.3). No second gradient anywhere.

Verify: grep the inbox tree for inline button styling (background: var(--color-accent) on a bare button, gradient-brand class on more than one element) returns only the sanctioned CTA. Screenshot 006-empty-connect, 007-composer.

Test: extend tokens.contract.test.ts (or a sibling buttons.contract.test.ts) to assert at most one occurrence of gradient-brand / --gradient-brand across the inbox tree, and that no inbox .tsx sets background: var(--color-accent) on a raw button (must use Button solid).

---

## B7 [NEW] — Reconcile the two stale design docs to live tokens · 0.5 half-day · R7.3

Action: rewrite _harness/design-language.md §Color/§Typography/§Layout/§Buttons and .claude/commands/design-review.md §1 + §3 to the LIVE globals.css values: Clear-Mode light-first, accent #2C6BED (not #6366f1), bg ladder #FAFAFA→#FFFFFF→#F5F5F5→#EBEBEB (not #09090b→#2a2a31), 44px table row (not 40px), the 3-stop brand gradient, shadows DO exist in light mode (remove the dark-only no-shadow claim, scope it to dark). Add a §Inbox subsection with the F1 token table.

Verify: a diff of both docs shows zero remaining references to #6366f1 / #09090b / 40px row / dark-only. grep -ri "6366f1" on both files returns nothing.

Test: docs.contract.test.ts — assert neither doc contains the stale strings (#6366f1, #09090b, "40px row", "NO shadows in dark mode" as an unscoped absolute), and that both name accent #2C6BED.

---

## B8 [NEW] — design-review Playwright pass (manual half of the gate) · 0.5 half-day · R7.1, R7.2

Action: run /design-review on /inbox against the reconciled tokens. Capture default / row-hover / selected / empty / loading / dark-mode at 1440 and 1024. Record the 12-item G-design result.

Verify: every screenshot saved to app/apps/web/screenshots/ with sequential names; console clean; the G-design checklist scored 12/12 (any miss is a blocking finding to fix before merge). End on a verification screenshot, not a hand-off.

Test: not unit-testable; the artifact is the screenshot set + the scored checklist committed under _specs/inbox-design-system/_review/.

---

## B9 [NEW] — Publish the G-design gate + wire it into the roadmap · 0.5 half-day · R7.1, R7.4

Action: confirm design.md §8 is the canonical G-design block; add a one-line note to _specs/inbox-overhaul/ROADMAP.md pointing every UI spec at it ("embed _specs/inbox-design-system/design.md §8 in your design.md or be rejected"). No code.

Verify: ROADMAP §Cross-cutting GATES references the concrete file+section; a fresh reader can copy the checklist without hunting.

Test: docs.contract.test.ts (B7) extended — assert ROADMAP.md links inbox-design-system design §8 as the G-design source.

---

## Acceptance summary (Definition of Done, software — distinct from any OKR)

- pnpm -C app build, lint, tsc, test all green.
- The five --inbox-* tokens exist; no new color/gradient/shadow/font token added.
- InboxRow + LaneChip + CountBadge are the only row/chip renderers in the inbox; no inline-styled row or tab remains.
- tokens.contract.test.ts + buttons.contract.test.ts + docs.contract.test.ts pass and red-flag injected violations.
- /inbox scores 12/12 on the G-design checklist with screenshots committed.
- design-language.md + design-review.md match live globals.css (zero stale dark-indigo strings).
- ROADMAP points every later UI spec at design §8.
