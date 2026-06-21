# F1 — inbox-design-system · Requirements

**Feature ID:** inbox-design-system
**Track:** F (“Feel” layer) · **Prio:** P0 · **Deps:** none · **Foundation for:** the G-design gate (every other UI spec in _specs/inbox-overhaul/ROADMAP.md).

## Goal (one sentence)

Standardize the inbox design tokens and core components to a *measured craft bar* (from the Upstream teardown, _research/upstream/teardown/12-pass2-pixel-details.md) — expressed in **Elevay own brand language**, not a pixel clone — and ship the **G-design acceptance gate** that every later UI spec references.

## Ground-truth inventory (verified against live code 2026-06-19)

| Area | Live state | Tag |
|------|-----------|-----|
| Token system (@theme + :root + .dark) in globals.css:18-273 | Light-first “Clear Mode”; accent #2C6BED; 3-stop brand gradient #17C3B2 → #2C6BED → #FF7A3D (globals.css:161); 10 badge hues; full semantic + shadow + LP token sets | [DONE] core / [NEW] inbox-specific |
| --table-row-height: 44px (globals.css:28) | Already 44px — matches the Upstream 44px bar exactly | [DONE] |
| --font-sans = Inter stack (globals.css:20) | Elevay uses Inter (Upstream uses raw system) — keep Inter (brand) | [LOCKED] |
| Button (components/ui/button.tsx) | 6 variants: gradient/solid/outline/ghost/destructive/icon; sizes sm/md/lg; solid=accent, gradient=brand | [DONE] |
| Badge/Tag/PropertyBadge (components/ui/badge.tsx) | Pill, rounded-full, soft-bg + same-hue text + {color}20 border; 10-hue hash palette | [DONE] |
| Conversation row (inbox/_conversation-list.tsx:103-206) | Avatar(28) + name 13px/500 + subject 12px + snippet 11px + time 11px + reason/labels line; hover-reveal checkbox; inset-2px selection rail | [NEW] — type scale + density below bar |
| SenderAvatar (inbox/_sender-avatar.tsx) | Deterministic initials, HSL disc, 10 hues, no remote logo | [DONE] |
| Reading pane (inbox/_conversation-pane.tsx) | Header (name 14px/600 + subject + badges) + Button actions row + message cards rounded-lg border p-3 | [NEW] — message-card + actions |
| Lane / Split chip (inbox/page.tsx:765-811) | rounded-md px-2.5 py-1 text-[12px], active = accent-soft, inactive = tertiary; count in (n) parens | [NEW] — promote to LaneChip + count badge |
| Composer (components/email-composer-panel.tsx) | Exists, 44 token refs — already token-driven | [DONE] (audit-only) |
| _harness/design-language.md | STALE — old dark-first indigo (#6366f1, #09090b, 40px rows) no longer matches globals.css | [NEW] — reconcile |
| .claude/commands/design-review.md §1/§3 | STALE — same dark-first tokens; G-design must point at live tokens | [NEW] — update |

**Non-regression note:** the token set in globals.css is already excellent and largely hits the bar. F1 real work is (1) **codifying** the inbox component layer on those tokens, (2) **closing the row type-scale gap** to the measured bar, and (3) **publishing the G-design checklist + reconciling the two stale docs**. F1 does NOT rewrite the color system.

---

## R1 — Tokens (the foundation layer)

- **R1.1** [NEW] THE SYSTEM SHALL express every inbox surface using only the CSS custom properties defined in globals.css @theme / :root / .dark; no inbox component shall introduce a raw hex, rgb(), or rgba() literal for color.
- **R1.2** [NEW] THE SYSTEM SHALL define inbox layout-density tokens in globals.css @theme: --inbox-row-height: 56px, --inbox-row-height-compact: 44px, --inbox-sidebar-width: 240px (Elevay rail; Upstream is 208px — wider is the Elevay choice), --inbox-list-width: 360px.
- **R1.3** [DONE] THE SYSTEM SHALL keep --table-row-height: 44px (globals.css:28) as the measured compact-density bar and reuse it for --inbox-row-height-compact.
- **R1.4** [NEW] THE SYSTEM SHALL define the inbox type scale as a documented token table hitting the Upstream craft bar in *feel* — 14px primary, weight 700 sender, weight 600 subject, weight 400 snippet+timestamp — using Elevay color tokens: sender 14px/700 var(--color-text-primary), subject 14px/600 var(--color-text-primary), snippet 13px/400 var(--color-text-secondary), timestamp 12px/400 var(--color-text-tertiary).
- **R1.5** [LOCKED] THE SYSTEM SHALL designate exactly ONE accent gradient for inbox CTAs — Elevay existing --gradient-brand (#17C3B2 → #2C6BED → #FF7A3D, globals.css:161) — as the analog of Upstream #12B4D8 → #6C73E4, and SHALL NOT introduce a second gradient.
- **R1.6** [NEW] THE SYSTEM SHALL set --inbox-cta-radius: 10px (Elevay rounded-md family; Upstream is 12px — 10px is the deliberate Elevay choice) and apply it to primary gradient CTAs.
- **R1.7** [NEW] WHERE a surface needs elevation, THE SYSTEM SHALL use only the defined shadow tokens (--shadow-button/-card/-panel/-floating/-dialog, globals.css:154-158) and SHALL NOT introduce ad-hoc box-shadow values.
- **R1.8** [NEW] THE SYSTEM SHALL define a single 4px spacing rhythm for inbox components; horizontal row padding SHALL be 14px (px-3.5) and the vertical gutter between row text lines SHALL be 2px (mt-0.5).
- **R1.9** [LOCKED] THE SYSTEM SHALL NOT add any new color hue, font family, or icon library; icons remain lucide-react (no emoji anywhere in the UI, per CLAUDE.md).
- **R1.10** [NEW] WHEN dark mode is active (.dark on the html element), THE SYSTEM SHALL resolve every inbox token via the .dark override block, so no inbox surface hard-codes a light-mode value.

## R2 — Conversation row component (InboxRow)

- **R2.1** [NEW] THE SYSTEM SHALL render each conversation row at --inbox-row-height (56px standard) with vertical centering, 14px horizontal padding, and a 1px bottom border var(--color-border-default).
- **R2.2** [NEW] THE SYSTEM SHALL lay out a row left to right as: [hover/selection checkbox] · avatar (28px) · primary column (sender + subject + snippet) · right column (timestamp, then on-hover quick actions).
- **R2.3** [NEW] THE SYSTEM SHALL render the sender name at 14px/700 var(--color-text-primary) and the subject at 14px/600 var(--color-text-primary) on the primary line — matching the Upstream “sender AND subject bold” bar, one weight-step apart for Elevay hierarchy.
- **R2.4** [NEW] THE SYSTEM SHALL render the preview snippet at 13px/400 var(--color-text-secondary), truncated to a single line, sharing the truncation budget with the subject.
- **R2.5** [NEW] THE SYSTEM SHALL render the timestamp right-aligned at 12px/400 var(--color-text-tertiary) as relative time (timeAgo).
- **R2.6** [DONE] WHEN a row is the selected/open conversation, THE SYSTEM SHALL show a 2px inset accent rail (box-shadow: inset 2px 0 0 var(--color-accent)) and var(--color-accent-soft) background (already in _conversation-list.tsx:110-113).
- **R2.7** [NEW] WHILE a row is hovered AND not selected, THE SYSTEM SHALL show var(--color-bg-hover) background with a 100ms ease transition.
- **R2.8** [DONE] WHILE a row is hovered OR any selection is active, THE SYSTEM SHALL reveal the left “Select thread” checkbox (hidden at rest via opacity, never display/width, so the gutter never shifts) — Upstream resting-clean / hover-discoverable pattern (12-pass2-pixel-details.md §Row hover; live at _conversation-list.tsx:117-134).
- **R2.9** [NEW] WHILE a row is hovered, THE SYSTEM SHALL reveal up to 3 right-aligned icon-only quick-action affordances (Done / Snooze / more), each with a title tooltip and an aria-label.
- **R2.10** [NEW] WHERE a conversation is unread, THE SYSTEM SHALL signal it with weight/contrast (sender at full primary); WHERE read, with reduced contrast — never by color hue alone (a11y).
- **R2.11** [DONE] THE SYSTEM SHALL render the avatar as SenderAvatar (deterministic initials disc, _sender-avatar.tsx) and SHALL NOT fetch a remote logo from the row.

## R3 — Lane / Split chip component (LaneChip)

- **R3.1** [NEW] THE SYSTEM SHALL render a lane/Split tab as a chip: rounded-md, 12px/500 label, 4px/10px padding (py-1 px-2.5), with a trailing count badge.
- **R3.2** [NEW] WHEN a lane chip is active, THE SYSTEM SHALL style it with var(--color-accent-soft) background and var(--color-accent) text; WHEN inactive, transparent background and var(--color-text-tertiary) text.
- **R3.3** [NEW] THE SYSTEM SHALL render the lane count as a CountBadge pill (var(--color-bg-emphasis)/var(--color-text-secondary) inactive, var(--color-accent-soft)/var(--color-accent) active) rather than bare (n) parentheses — quantifying the triage win at a glance (per 05-inbox-frame-sidebar-splits.md §PM observations).
- **R3.4** [NEW] IF a lane count is zero AND the lane is hideWhenEmpty, THEN THE SYSTEM SHALL omit its chip.
- **R3.5** [NEW] THE SYSTEM SHALL render custom per-sender Splits (the “Qonto” pattern, 05-inbox-frame-sidebar-splits.md) with the identical LaneChip styling as built-in lanes — no visual second class.

## R4 — Buttons & CTAs

- **R4.1** [NEW] THE SYSTEM SHALL route every inbox button through the shared Button (components/ui/button.tsx); no inbox surface shall hand-roll a button styled as a primary/secondary button.
- **R4.2** [NEW] THE SYSTEM SHALL use exactly one primary treatment per context: solid accent for in-pane verbs (Reply, Done), gradient reserved for the single highest-intent conversion CTA (e.g. empty-state “Connect mailbox”), never two gradient buttons competing in one view.
- **R4.3** [NEW] WHERE a button is secondary, THE SYSTEM SHALL use outline; WHERE tertiary/inline, ghost.
- **R4.4** [NEW] THE SYSTEM SHALL size inbox buttons sm (28px, 12px) inside dense surfaces (row actions, bulk bar, lane bar) and md (32px) in the reading-pane header.
- **R4.5** [NEW] THE SYSTEM SHALL render the one gradient CTA with --gradient-brand, white text, --inbox-cta-radius, and --shadow-button; no drop shadow beyond the token.

## R5 — Reading pane & message card

- **R5.1** [DONE] THE SYSTEM SHALL render the reading-pane header with sender 14px/600 var(--color-text-primary), from-address 12px var(--color-text-tertiary), subject 12px var(--color-text-secondary) (codifying live _conversation-pane.tsx:373-391).
- **R5.2** [DONE] THE SYSTEM SHALL render each message as a card: rounded-lg (8px), 1px var(--color-border-default), 12px padding, inbound = var(--color-bg-card), outbound = transparent + 24px left indent (live _conversation-pane.tsx:769-779).
- **R5.3** [NEW] THE SYSTEM SHALL render every intelligence/insight block (prepared reply, signals, action items, next-action) on the SAME radius (8px) and border token, so the pane reads as one card family.
- **R5.4** [DONE] THE SYSTEM SHALL render the actions row as one horizontal Button group with an 8px gap, Done/Snooze right-aligned via ml-auto (live _conversation-pane.tsx:442-562).
- **R5.5** [DONE] WHERE the email body HTML is rendered, THE SYSTEM SHALL apply the scoped .email-body rules (globals.css:691-735) so a message markup cannot break the pane; dark mode renders the body on a light “paper”.

## R6 — Composer

- **R6.1** [DONE] THE SYSTEM SHALL render the composer via the shared EmailComposerPanel; the inbox SHALL NOT fork a second composer.
- **R6.2** [DONE] THE SYSTEM SHALL render tone and snippet chips above the composer as rounded-full chips on the badge token family (active = accent-soft/accent), consistent with _conversation-pane.tsx:843-868.
- **R6.3** [NEW] THE SYSTEM SHALL render the composer primary Send as the solid accent Button and its dismiss as ghost/outline — never a second gradient.

## R7 — G-design acceptance gate (the deliverable every other spec references)

- **R7.1** [NEW] THE SYSTEM SHALL publish a single G-design checklist (design.md §G-design) that every UI spec in _specs/inbox-overhaul/ROADMAP.md copies into its acceptance criteria.
- **R7.2** [NEW] THE SYSTEM SHALL make the gate machine-checkable where possible: a test (tokens.contract.test.ts) asserts no inbox .tsx introduces a raw color literal; design-review (Playwright) covers the rest.
- **R7.3** [NEW] THE SYSTEM SHALL reconcile _harness/design-language.md and .claude/commands/design-review.md §1/§3 to the LIVE globals.css tokens (Clear-Mode light-first, accent #2C6BED, 44px rows, 3-stop brand gradient) so the gate never checks against stale dark-indigo values.
- **R7.4** [NEW] WHEN a UI spec design.md is written, IF it does not embed the G-design checklist, THEN it SHALL be rejected at review (ROADMAP §Cross-cutting GATES: No UI ships without it).

## Non-goals

- **NG-1** THE SYSTEM SHALL NOT pixel-clone Upstream (no 208px sidebar, no #12B4D8 gradient, no raw system font) — Elevay brand values are deliberate (R1.2, R1.5, R1.6, R1.4).
- **NG-2** THE SYSTEM SHALL NOT rewrite the color system in globals.css — it is already at bar; F1 only ADDS inbox density/type tokens and codifies components.
- **NG-3** THE SYSTEM SHALL NOT implement Splits/Noise/AI-draft behavior — those are B3/B4/B1; F1 standardizes only their chrome (chip, row, buttons).
- **NG-4** THE SYSTEM SHALL NOT introduce a component library / shadcn dependency; components stay bespoke on Tailwind 4 + the token set.
- **NG-5** THE SYSTEM SHALL NOT add motion beyond the existing 100-150ms ease transitions and the reduced-motion guard (globals.css:744-753).
