# Elevay UI DNA — the design contract every spec's UI section MUST respect

Source of truth: `app/apps/web/src/app/globals.css` (tokens) + the codebase conventions
below. **Elevay is light-first, soft, professional — NOT Superhuman's dark monospace.**
When we adopt a Superhuman *pattern* (split inbox, AI reply, summarize), we render it in
Elevay's DNA, never its look.

## Tokens (use the CSS variables, never hardcoded hex)
- **Type:** `--font-sans: Inter` (body/UI), `--font-display: Fraunces` (serif, display only),
  `--font-mono: JetBrains Mono`. UI text sizes seen in code: `text-[11px]/[12px]/[13px]`,
  labels `text-[10px] uppercase tracking-wider`.
- **Surfaces (light "Clear Mode" default):** page `--color-bg-page` #FAFAFA, card
  `--color-bg-card` #FFF, hover `--color-bg-hover` #F5F5F5, selected `--color-bg-selected`
  #F0F7FF, modal overlay `--color-bg-modal-overlay`.
- **Text:** `--color-text-primary` #1A1A2E, `-secondary` #64648C, `-tertiary`/`-muted` #9CA3AF,
  `-placeholder` #C4C4D4.
- **Borders:** `--color-border-default`/`-moderate` #E8E8F0, `-strong` #D1D1E0,
  `-focus` #2C6BED.
- **Accent (brand blue):** `--color-accent` #2C6BED, `-hover`, `-soft` (0.08), `-muted` (0.04).
- **Semantic:** success #10B981, warning #F59E0B, error #EF4444, info #2C6BED (+ `-soft`).
- **Brand gradient** `--gradient-brand` (teal→blue→orange #17C3B2→#2C6BED→#FF7A3D): **no-image
  fallback ONLY** (avatars/logos), never as primary chrome.
- **Shadows:** `--shadow-card/-panel/-floating/-dialog` (subtle, low-opacity).
- **Badges:** 10 category hues `--color-badge-0..9`; industry sectors `--ind-*`
  (`lib/ui/industry-style.ts`), seniority tiers `--sen-*` (`lib/ui/title-style.ts`).
- **Dark mode:** via `.dark` class (not OS media query); tokens auto-swap. Every surface/text
  must read from tokens so dark mode "just works".
- **Layout constants:** sidebar 240px, header 44px, filter-bar 40px, table-row 44px,
  detail-panel 400px, kanban-column 260px.

## Hard conventions (enforced, some by tests)
- **No emojis in UI.** Icons = `lucide-react` only; tests assert `icon === ""`. (Superhuman's
  🎉/⚡/🗂️ become a sober lucide glyph or nothing.)
- **No provider names shown to users.** Never "Apollo/Lusha/Crunchbase/Resend…" — "sourced by
  Elevay" / "added manually" / unknown→null. (NB: Superhuman shows "Pitch", BCC-to-CRM, etc. —
  we don't surface vendor names.)
- **No status-jewelry icons.** No crowns/medals/insignia in chips. Rank = color + tooltip;
  one sober object-icon per family (Briefcase for titles, sector object for industries).
- **Customizable but very simple.** Fewest controls, strong defaults; customization is optional
  refinement; reuse existing primitives (Button, Badge, MoreMenu, ColumnPicker, owner-select…).
- **No hype / strictly factual** copy. No superlatives, no roadmap promises ("Soon"), no selling.
- **Citations / "why" on every AI claim.** Provenance reads "via Elevay", never a vendor.
- **Per-user + tenant scope** everywhere (`lib/inbox/user-scope.ts`).

## Component idiom (match the surrounding code)
- Inline styles with tokens: `style={{ color: "var(--color-text-secondary)" }}`; utility classes
  for layout (`flex items-center gap-2 rounded-md px-2 py-1.5`), `hover:bg-[var(--color-bg-hover)]`.
- Rounded: `rounded-md` (controls) / `rounded-lg` (cards/popovers). Shadows via the `--shadow-*` tokens.
- Reuse: `components/ui/*` (Button, Badge, MoreMenu, ColumnPicker, column-filter, owner-select),
  `components/ai-ui/confidence-state` (Verified/Likely/Inferred), IndustryBadge/TitleBadge.
- Existing inbox UI to extend, not replace: `app/(dashboard)/inbox/` (`page.tsx`,
  `_conversation-list.tsx`, `_conversation-pane.tsx`, `_outbound-table.tsx`, `_types.ts`).

## Translating the Superhuman teardown into Elevay DNA (per spec)
- Superhuman's **dark command palette / Cmd+K** → an Elevay **light** command surface (card
  `--color-bg-card`, `--shadow-floating`, Inter, blue accent), same keyboard-first speed.
- Their **Ask AI** dark panel → Elevay's existing chat dock / a light right-or-left assistant
  panel using our tokens; answers carry **citations** ("via Elevay").
- Their **Social Insights** sidebar (LinkedIn/GitHub) → our **GTM context sidebar** (contact +
  deal + signals + last interaction, cited) — IndustryBadge/TitleBadge, sober icons.
- Their **Auto Labels "Pitch"** chip → our PropertyBadge/Badge in token colors, ICP/persona-
  grounded, no vendor name.
- Their **"Smart Send / Remind me"** → our sequence + signal-freshness + no-reply-nudge engine.
- AI reply flow (summarize → draft → composer → rewrite) → same flow, Elevay-light, grounded in
  the CRM graph with citations; rewrite presets include GTM ones ("propose the next step").

## In each spec's "Design sketch → UI" line, state:
the surface (card/popover/sidebar/inline), the exact tokens used, the lucide icon(s), the
keyboard shortcut, and that it works in light + dark via tokens — and confirm "no emoji, no
provider name, cited."
