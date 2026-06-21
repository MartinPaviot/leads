# F1 — inbox-design-system · Design

## 1. Approach

The Elevay token system in globals.css already hits most of the measured craft bar (44px row token, Inter, a brand gradient, full semantic + shadow sets, badge palette, dark-mode parity). F1 therefore does NOT redesign the palette. It does three things:

1. **Add a thin inbox token layer** (density + type-scale + CTA-radius tokens) so every inbox component reads from one place.
2. **Extract the inbox chrome into named, reusable components** (InboxRow, LaneChip, CountBadge) styled exactly to those tokens, replacing the inline-styled markup in _conversation-list.tsx and page.tsx.
3. **Publish the G-design gate** and reconcile the two stale docs (design-language.md, design-review.md) to the live tokens, so every later spec audits against reality.

Craft-bar mapping (Upstream measured → Elevay value, deliberate deltas):

| Upstream (measured) | Elevay (this spec) | Why the delta |
|----|----|----|
| Sidebar 208px, transparent | --inbox-sidebar-width 240px, var(--color-bg-sidebar) | Elevay rail already 240px (globals.css:24); solid panel is the Clear-Mode idiom |
| Row 44px (dense) | 56px standard, 44px compact token | Elevay rows carry a snippet + reason/label line; 56px breathes, 44px stays available |
| System font | Inter (--font-sans) | Brand decision [LOCKED] |
| Sender 14/700 rgb(15,23,42) | 14/700 var(--color-text-primary) #1A1A2E | Same weight/feel, Elevay near-black |
| Subject 14/700 | 14/600 var(--color-text-primary) | One weight-step apart = clearer Elevay hierarchy |
| Snippet 14/400 rgba(10,25,41,.6) | 13/400 var(--color-text-secondary) #64648C | Same muted role, Elevay scale |
| Timestamp 14/400 rgb(163,163,163) | 12/400 var(--color-text-tertiary) #9CA3AF | Same light-gray role, Elevay scale |
| CTA gradient #12B4D8→#6C73E4, r12, 16/600 | --gradient-brand #17C3B2→#2C6BED→#FF7A3D, r10 | Elevay 3-stop brand gradient is the single accent gradient [LOCKED] |

## 2. Architecture diff vs existing

Added (new files):
- inbox/_inbox-row.tsx — InboxRow (extracted from _conversation-list.tsx).
- inbox/_lane-chip.tsx — LaneChip + CountBadge (extracted from page.tsx FilterBar).
- inbox/__tests__/tokens.contract.test.ts — the machine-checkable half of the G-design gate.

Changed (existing files):
- globals.css @theme — add the inbox token block (density, type-scale comments, --inbox-cta-radius).
- _conversation-list.tsx — render InboxRow instead of the inline button; type scale moves to the new tokens.
- page.tsx — render LaneChip in the FilterBar instead of the inline tab buttons.
- _conversation-pane.tsx — message + insight cards reference one shared radius/border (no behavior change).
- _harness/design-language.md and .claude/commands/design-review.md — reconciled to live tokens (R7.3).

Already there (NOT touched beyond token references): the full color/semantic/shadow/badge system in globals.css; Button; Badge/Tag/PropertyBadge; SenderAvatar; EmailComposerPanel.

## 3. Data model

None. F1 is presentation-only: no Drizzle CREATE/ALTER, no schema under app/apps/web/src/db/schema/, no migration. (Verified: no entity is introduced.)

## 4. Orchestration

None. No Inngest function. F1 ships no background job.

## 5. Integrations

None added. Stack unchanged: Next 15 App Router, React 19, Tailwind 4, lucide-react. No new dependency (NG-4). Confirmed against the locked stack in CLAUDE.md.

## 6. Token additions (the only globals.css change)

Add inside the @theme block (after the LAYOUT group, globals.css:23-30):

    /* === INBOX DENSITY (F1) === */
    --inbox-row-height: 56px;
    --inbox-row-height-compact: 44px;   /* = --table-row-height, the measured bar */
    --inbox-sidebar-width: 240px;       /* = --sidebar-width */
    --inbox-list-width: 360px;
    --inbox-cta-radius: 10px;

Type scale is documented (not new CSS vars — it maps to existing color tokens + Tailwind size utilities), recorded in design-language.md §Inbox:

    sender    14px / 700 / var(--color-text-primary)
    subject   14px / 600 / var(--color-text-primary)
    snippet   13px / 400 / var(--color-text-secondary)
    timestamp 12px / 400 / var(--color-text-tertiary)
    lane chip 12px / 500
    count     11px / 600

No new color, gradient, shadow, or font token is introduced (R1.9, NG-2).

## 7. Component contracts

### InboxRow (_inbox-row.tsx)
Props: item: ConversationListItem; selected; multiSelected; hasSelection; showCheckbox; showMailbox; onSelect; onToggleSelect; onQuickAction(action). Renders R2.1–R2.11. Pure presentational; all data + handlers passed in. Reuses SenderAvatar, timeAgo, decodeDisplay, dirOf, prefetchDetail (no logic moved out of the list — only the row markup).

### LaneChip + CountBadge (_lane-chip.tsx)
LaneChip props: label; count; active; onClick; title. CountBadge props: count; active. Renders R3.1–R3.3. One component drives built-in lanes, custom lanes, and bundles (so they cannot drift, R3.5). Replaces the three near-duplicate inline tab blocks in page.tsx:765-811.

### Button / Badge / Composer
No new component. The gate (R4, R6) is enforced by audit + the contract test: inbox .tsx files import Button/Badge/EmailComposerPanel rather than hand-rolling styled buttons or pills.

## 8. G-design acceptance gate (copy this block into every UI spec design.md)

A UI surface passes G-design when ALL hold (cite the failing token on any miss):

1. **Tokens only** — no raw hex / rgb() / rgba() for color; every color is a var(--color-*) (R1.1). [machine-checked by tokens.contract.test.ts]
2. **One accent gradient** — the single CTA gradient is --gradient-brand; no second gradient, no purple/neon glow (R1.5, R4.5).
3. **One button system** — every primary/secondary/tertiary button is the shared Button (solid/outline/ghost); at most one gradient CTA per view (R4.1, R4.2).
4. **Type scale snaps** — sizes on the Elevay scale (24/20/16/14/13/12/11); sender 14/700, subject 14/600, snippet 13/secondary, timestamp 12/tertiary (R1.4, R2.3–R2.5).
5. **Density** — list rows on --inbox-row-height (56) or --inbox-row-height-compact (44); 4px spacing rhythm; row padding 14px (R1.2, R1.8, R2.1).
6. **Radius family** — cards rounded-lg (8px), chips/buttons rounded-md, the one CTA --inbox-cta-radius (10px); no off-scale radii (R1.6, R5.2, R5.3).
7. **Elevation via tokens** — shadows only from the --shadow-* set (R1.7).
8. **Contrast (a11y)** — body text at or above var(--color-text-secondary); state never conveyed by hue alone; AA contrast on text (R2.10).
9. **Dark-mode parity** — every surface resolves through .dark; no hard-coded light value (R1.10).
10. **No emoji, lucide only** — icons are lucide-react at 16/13/11px; zero emoji in the UI (R1.9, CLAUDE.md).
11. **Focus + motion** — keyboard focus uses the :focus-visible ring (globals.css:678); transitions 100-150ms; respects prefers-reduced-motion (NG-5).
12. **State coverage** — every list/pane has an EmptyState, a skeleton, and a hover state (full coverage handed to F3; gated here).

Pass = 12/12. Each later spec records its G-design result as a one-line PASS/FAIL per item in its tasks.md acceptance step.

## 9. Guardrails (one line each)

- No raw color literal in any inbox .tsx (contract test enforces).
- Exactly one gradient (--gradient-brand) across the inbox; at most one gradient CTA per view.
- Every button is the shared Button; no hand-rolled primary/secondary button.
- Type sizes snap to the Elevay scale; sender/subject/snippet/timestamp weights fixed by R2.3–R2.5.
- Cards share the 8px radius + 1px border token; the one CTA uses 10px.
- Shadows only from the --shadow-* token set; no ad-hoc box-shadow.
- Dark-mode resolves via .dark for every surface; no hard-coded light value.
- lucide-react only; no emoji; no new icon set, font, or dependency.
- design-language.md and design-review.md must match live globals.css before the gate is trusted.
